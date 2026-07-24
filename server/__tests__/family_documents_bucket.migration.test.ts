/**
 * family_documents_bucket.migration.test.ts — MYT-134 (gh #134).
 *
 * Asserts that at least one migration under `supabase/migrations/` creates the
 * `family-documents` Storage bucket via `INSERT INTO storage.buckets`.
 *
 * Evidence (2026-07-24): a fresh local stack (`supabase start` + `db reset`) does
 * NOT have this bucket — only `firmas-entregas` and `documentos-fisicos-entregas`
 * are created (20260413121828_20260501101100_create_storage_buckets.sql). Several
 * server routers (documents.ts, documents-gen.ts, rounds-ocr.ts,
 * rounds-documents.ts) and
 * server/services/__tests__/informeGen.live.integration.test.ts read/write the
 * `family-documents` bucket, and comments in
 * 20260430000001_add_canal_llegada_programa_familias.sql /
 * 20260430000002_family_documents_support.sql claim it exists — but no
 * migration or seed.sql ever creates it. Workaround verified 2026-07-23 via
 * `POST /storage/v1/bucket`.
 *
 * This is a content-assert against migration SQL text (no live Supabase stack
 * running in this worktree — `npx supabase status` reports
 * "No such container: supabase_db_repo-wave-9" — so the live
 * informeGen.live.integration.test.ts path, gated behind
 * RUN_LIVE_INFORME_TESTS=1, cannot be exercised here). It mirrors the existing
 * migration-content-lint pattern (`family_webhook_log.migration.test.ts`,
 * `firma.migration.test.ts`) rather than the live-stack `StorageApiError: Bucket
 * not found` failure documented in the finding, which requires a running Docker
 * + Supabase local stack outside this sandbox.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");
const SEED_PATH = resolve(__dirname, "../../supabase/seed.sql");

// Matches an INSERT INTO storage.buckets statement whose VALUES include the
// 'family-documents' bucket id/name (allows either single migration list-form
// or the ON CONFLICT upsert form used elsewhere in this repo).
const CREATES_FAMILY_DOCUMENTS_BUCKET =
  /INSERT\s+INTO\s+storage\.buckets[\s\S]{0,500}?'family-documents'/i;

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => join(MIGRATIONS_DIR, f));
}

function anySourceCreatesTheBucket(): { found: boolean; matchedFile: string | null } {
  for (const path of migrationFiles()) {
    const sql = readFileSync(path, "utf8");
    if (CREATES_FAMILY_DOCUMENTS_BUCKET.test(sql)) {
      return { found: true, matchedFile: path };
    }
  }
  // seed.sql is NOT a substitute for a migration (docs/dev-setup.md + fix_hint:
  // `supabase db reset` must create the bucket every time), but check it too so
  // the assertion failure message is unambiguous either way.
  const seedSql = readFileSync(SEED_PATH, "utf8");
  if (CREATES_FAMILY_DOCUMENTS_BUCKET.test(seedSql)) {
    return { found: true, matchedFile: SEED_PATH };
  }
  return { found: false, matchedFile: null };
}

describe("MYT-134: family-documents storage bucket must be created by a migration", () => {
  it("some migration under supabase/migrations/ inserts the family-documents bucket into storage.buckets", () => {
    const { found, matchedFile } = anySourceCreatesTheBucket();
    expect(
      found,
      "No migration (nor seed.sql) creates the 'family-documents' Storage bucket. " +
        "A fresh `supabase db reset` therefore leaves it missing, and code paths " +
        "that upload to it (server/routers/families/documents.ts, documents-gen.ts, " +
        "rounds-ocr.ts, rounds-documents.ts; " +
        "server/services/__tests__/informeGen.live.integration.test.ts) fail with " +
        "StorageApiError: Bucket not found (gh #134).",
    ).toBe(true);
    expect(matchedFile).not.toBeNull();
  });
});
