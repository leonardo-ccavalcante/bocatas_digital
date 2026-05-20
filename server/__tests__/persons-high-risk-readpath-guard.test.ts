/**
 * persons-high-risk-readpath-guard.test.ts — TECH_DEBT C-02 systemic guard.
 *
 * The high-risk-PII boundary is APP-LAYER (the app reads via the service-role
 * client, which bypasses Postgres RLS + column REVOKEs — see
 * docs/superpowers/security-model.md). The audit that produced C-01 found
 * `persons.getById` was the only read path doing `.from("persons").select("*")`
 * without `redactHighRiskFields`. This source-level guard makes that boundary
 * regression-proof: ANY server router file that reads persons with `select("*")`
 * MUST also apply `redactHighRiskFields` (a no-op for elevated roles, so it is
 * always safe to add). A new unredacted persons select-* read path fails here.
 *
 * Pattern mirrors the existing source-text test rls-column-grants.migration.test.ts
 * and the codemap-parity guard.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROUTERS_DIR = resolve(__dirname, "../routers");

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      out.push(...walkTsFiles(full));
    } else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Files where a `persons` query chain uses `select("*")`.
 *
 * Statement-precise (not file-level): split the source at each `.from(` call so
 * each chunk is one query chain belonging to the table named at its start. Only
 * flag a chunk that starts with "persons" AND select("*") within that chain.
 * This avoids false positives when a file reads persons with safe explicit
 * columns but select("*")s a DIFFERENT table (e.g. families, which has no
 * high-risk columns).
 */
function personsSelectStarFiles(): string[] {
  return walkTsFiles(ROUTERS_DIR).filter((file) => {
    const src = readFileSync(file, "utf8");
    const chains = src.split(/\.from\(/);
    return chains.some(
      (chain) =>
        /^\s*["']persons["']\)/.test(chain) &&
        /\.select\(\s*["']\*["']/.test(chain),
    );
  });
}

describe("persons high-risk read-path guard (C-02)", () => {
  it("every persons select(*) read path applies redactHighRiskFields", () => {
    const offenders = personsSelectStarFiles().filter((file) => {
      const src = readFileSync(file, "utf8");
      return !src.includes("redactHighRiskFields");
    });

    expect(
      offenders,
      `These server routers read persons via .select("*") but never call ` +
        `redactHighRiskFields — high-risk PII (situacion_legal, ` +
        `recorrido_migratorio, foto_documento_url) would leak to non-elevated ` +
        `callers (CLAUDE.md §3). Apply redactHighRiskFields at the return:\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("the guard is actually scanning files (sanity: persons/crud.ts is covered)", () => {
    // crud.ts has getById's select("*"); if this list is empty the glob broke.
    const files = personsSelectStarFiles().map((f) => f.replace(/\\/g, "/"));
    expect(files.some((f) => f.endsWith("persons/crud.ts"))).toBe(true);
  });
});
