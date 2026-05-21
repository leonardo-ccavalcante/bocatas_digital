import { spawn } from "node:child_process";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Converts a .docx buffer to .pdf bytes using `libreoffice --headless --convert-to pdf`.
 * Requires LibreOffice installed on the host. See docs/runbooks/libreoffice-setup.md.
 *
 * Concurrency note: LibreOffice locks ~/.config/libreoffice while running.
 * For now we serialize via a per-process Promise queue to avoid lock contention.
 * If throughput becomes an issue, run `--user-profile=...` per invocation.
 */
let queue: Promise<unknown> = Promise.resolve();

export function convertDocxToPdf(docxBuf: Buffer): Promise<Buffer> {
  const next = queue.then(() => convertDocxToPdfImpl(docxBuf));
  queue = next.catch(() => undefined);
  return next;
}

async function convertDocxToPdfImpl(docxBuf: Buffer): Promise<Buffer> {
  const tmp = await mkdtemp(join(tmpdir(), "derivar-pdf-"));
  const docxPath = join(tmp, "input.docx");
  const pdfPath = join(tmp, "input.pdf");
  try {
    await writeFile(docxPath, docxBuf);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("libreoffice", [
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        tmp,
        docxPath,
      ]);
      let stderr = "";
      proc.stderr.on("data", (b) => {
        stderr += b.toString();
      });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`libreoffice exited with code ${code}: ${stderr}`));
      });
      proc.on("error", reject);
    });
    return await readFile(pdfPath);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
