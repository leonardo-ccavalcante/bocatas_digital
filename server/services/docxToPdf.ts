// docxToPdf — faithful .docx → PDF conversion via headless LibreOffice.
//
// Pure-JS docx renderers cannot reproduce the running header (membrete) nor
// floating (wp:anchor) images like Espe's signature, so the on-screen preview
// of the informe de valoración social is produced by converting the real .docx
// to PDF and letting the browser render the PDF natively — pixel-faithful.
//
// No PII in thrown errors/logs — temp files use random names and are removed;
// soffice stderr/exit codes carry no personal data.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/** Thrown when LibreOffice (soffice) is not installed on the host. */
export class LibreOfficeUnavailableError extends Error {
  constructor() {
    super("LibreOffice no disponible en el servidor");
    this.name = "LibreOfficeUnavailableError";
  }
}

// Cold LibreOffice start (first run on a host) can take tens of seconds while it
// builds font caches; give generous headroom so a slow first render isn't
// mistaken for a hard failure. Warm conversions take a few seconds.
const CONVERT_TIMEOUT_MS = 90_000;

// Persistent profile so LibreOffice doesn't re-initialise on every call (a fresh
// UserInstallation costs ~8s; a warm shared one ~3s). Conversions are serialized
// (see `queue`) so a single shared profile never sees concurrent access.
const PROFILE_DIR = join(tmpdir(), "bocatas-libreoffice-profile");

/** Candidate soffice locations, absolute-first (dev server PATH may omit them). */
function resolveSoffice(): string {
  const candidates = [
    process.env.LIBREOFFICE_BIN,
    "/opt/homebrew/bin/soffice", // macOS (Homebrew)
    "/Applications/LibreOffice.app/Contents/MacOS/soffice", // macOS (cask app)
    "/usr/bin/soffice", // Linux
    "/usr/bin/libreoffice", // Linux (alt name)
  ].filter((c): c is string => !!c);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Last resort: rely on PATH (Linux servers usually expose it).
  return "soffice";
}

// Serialize conversions: LibreOffice is effectively single-instance per profile.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Convert a .docx buffer to a PDF buffer using headless LibreOffice.
 * Conversions run one-at-a-time (module-level queue) to avoid profile-lock
 * contention; each uses random temp files removed in `finally`.
 */
export function convertDocxToPdf(docx: Buffer): Promise<Buffer> {
  const run = queue.then(() => convertNow(docx), () => convertNow(docx));
  // Keep the chain alive regardless of this call's outcome.
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function convertNow(docx: Buffer): Promise<Buffer> {
  const bin = resolveSoffice();
  await mkdir(PROFILE_DIR, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), "informe-pdf-"));
  const inPath = join(work, `${randomUUID()}.docx`);
  const outPath = inPath.replace(/\.docx$/, ".pdf");
  try {
    await writeFile(inPath, docx);
    await runSoffice(bin, inPath, work);
    return await readFile(outPath);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function runSoffice(bin: string, inPath: string, outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      bin,
      [
        "--headless",
        "--norestore",
        "--nolockcheck",
        `-env:UserInstallation=file://${PROFILE_DIR}`,
        "--convert-to",
        "pdf:writer_pdf_Export",
        "--outdir",
        outDir,
        inPath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      console.error("[docxToPdf] soffice timed out");
      reject(new Error("soffice conversion timed out"));
    }, CONVERT_TIMEOUT_MS);

    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        console.error("[docxToPdf] soffice binary not found:", bin);
        return reject(new LibreOfficeUnavailableError());
      }
      console.error("[docxToPdf] soffice spawn error:", err.message);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      console.error(`[docxToPdf] soffice exited ${code}: ${stderr.slice(0, 300)}`);
      reject(new Error(`soffice exited ${code}`));
    });
  });
}
