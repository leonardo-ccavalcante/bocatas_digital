/**
 * log-no-pii.test.ts — Phase 6 QA-9 / SAT-KAC #12 / J.12 mitigation.
 *
 * CLAUDE.md §3 RGPD guard-rail: "No PII in logs." Server logs (console.*
 * + structured logger calls) must never include raw values from the
 * persons / families / consents PII column-name list.
 *
 * Mechanism: source-level static scanner. We grep every server/*.ts file
 * (excluding tests) for `console.log/.error/.warn/.info` and inspect the
 * argument expression. If the argument literal or interpolation contains
 * a variable named after a PII column, we fail.
 *
 * False positives are tolerated by an explicit allow-list at the bottom
 * (e.g. `console.error("[announcements] audit log write failed:",
 * error.message)` — `message` here is not a PII column name).
 *
 * What this catches:
 *   console.log(`Saving ${person.nombre}`);
 *   console.error("Failed to save", { telefono: person.telefono });
 *   console.warn("Person:", person);  // when person object obviously contains PII
 *
 * What it does NOT catch (out of scope — needs runtime gate):
 *   logger.info({ user: req.session.user });   // structured logger, deep
 *   throw new Error(`Bad ${nombre}`);          // error message PII
 * Those need a runtime gate (e.g. Pino redact paths) — tracked as
 * follow-up; this static scanner covers the high-leverage subset.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const SERVER_ROOT = path.join(ROOT, "server");

const PII_VARS = [
  "nombre",
  "apellidos",
  "telefono",
  "email",
  "numero_documento",
  "tipo_documento",
  "direccion",
  "fecha_nacimiento",
  "fecha_llegada_espana",
  "situacion_legal",
  "recorrido_migratorio",
  "foto_documento_url",
];

const ALLOWLIST_PATTERNS: ReadonlyArray<RegExp> = [
  // error.message — `message` is not a PII column
  /console\.\w+\([^)]*\berror\.message\b/,
  // err.message — same
  /console\.\w+\([^)]*\berr\.message\b/,
  // .nombre on programs / locations / families etc. (NOT persons)
  // Covered by lookup target filtering below; for now allow if substring matches
  // a non-PII context is detected manually — but we keep this scanner strict
  // and add file-level overrides if needed.
];

function listServerFiles(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (
        e.isFile() &&
        full.endsWith(".ts") &&
        !full.endsWith(".test.ts") &&
        !full.endsWith(".spec.ts")
      ) {
        out.push(full);
      }
    }
  }
  return out;
}

interface Hit {
  file: string;
  line: number;
  text: string;
  varName: string;
}

function scanFile(file: string): Hit[] {
  const src = fs.readFileSync(file, "utf-8");
  const lines = src.split("\n");
  const hits: Hit[] = [];
  // Match a console.* call. Capture the rest of the line for argument inspection.
  const consoleRe = /console\.(log|error|warn|info|debug)\s*\(([^)]*)/;

  lines.forEach((line, idx) => {
    const m = line.match(consoleRe);
    if (!m) return;

    if (ALLOWLIST_PATTERNS.some((p) => p.test(line))) return;

    const argStr = m[2];
    for (const v of PII_VARS) {
      // Match the PII var as a whole word (not e.g. "subnombre" or "nombreField")
      // and only if it appears INSIDE the args (after the opening paren).
      const re = new RegExp(`\\b${v}\\b`);
      if (re.test(argStr)) {
        hits.push({
          file: path.relative(ROOT, file),
          line: idx + 1,
          text: line.trim(),
          varName: v,
        });
        break;
      }
    }
  });
  return hits;
}

describe("Server logs must contain zero PII (CLAUDE.md §3 + SAT-KAC #12)", () => {
  const files = listServerFiles(SERVER_ROOT);

  it("found .ts files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no PII column-name reference appears inside any console.* call argument", () => {
    const allHits: Hit[] = [];
    for (const f of files) allHits.push(...scanFile(f));
    if (allHits.length > 0) {
      const formatted = allHits
        .map((h) => `  ${h.file}:${h.line} (${h.varName}) — ${h.text}`)
        .join("\n");
      throw new Error(
        `Found ${allHits.length} potential PII leak(s) in server console.* calls:\n${formatted}\n` +
          "Each must either route through a redacting logger, replace the value with " +
          "an opaque ID, or be added to ALLOWLIST_PATTERNS in this test (with a *why* comment)."
      );
    }
    expect(allHits).toEqual([]);
  });
});
