/**
 * migrations.apply.test.ts — Phase A.7.3 placeholder.
 *
 * Goal: apply every migration in `supabase/migrations/` against a clean
 * Postgres instance, in lexical order, and verify each one applies cleanly.
 * This locks the migration set against accidental syntax breaks or
 * out-of-order dependencies before they hit a real Supabase project.
 *
 * Status: SKIPPED until a Postgres test fixture is available locally.
 *
 * Why skipped (per A.7.3 spec — "do NOT mock"):
 *   - This branch has neither `testcontainers`, `pg-mem`, nor `@databases/pg`
 *     installed (verified `grep` against package.json).
 *   - There is no scripted "supabase start" in CI (see .github/workflows).
 *   - Mocking the Postgres surface would invalidate the contract — the
 *     entire point is to exercise the real DDL parser.
 *
 * Migration set on this branch (13 files):
 *   20260430000001_add_canal_llegada_programa_familias.sql
 *   20260430000002_family_documents_support.sql
 *   20260430000003_family_member_documents_rls.sql
 *   20260430000004_upload_family_document_fn.sql
 *   20260430000005_secure_upload_family_document_fn.sql
 *   20260501000001_create_announcements_table.sql
 *   20260501000002_announcement_audiences_table.sql
 *   20260501000003_es_urgente_and_tipo_legacy_check.sql
 *   20260501000004_announcement_audit_log.sql
 *   20260501000005_announcement_dismissals_and_webhook_log.sql
 *   20260501000006_announcements_rls.sql
 *   20260501000007_bulk_import_previews.sql
 *   20260501000008_confirm_bulk_import_fn.sql
 *
 * NOTE: the `families` table CREATE migration is NOT in
 * `supabase/migrations/` on this branch — only ALTERs are present. The
 * canonical CREATE lives in the EXPORTED migration set on `main`. Any
 * future implementation of this test must either (a) seed `families` from
 * a snapshot before applying the ALTERs, or (b) consume the full migration
 * set from `main`.
 *
 * TODO (Phase B or later):
 *   1. Add `testcontainers` (or `@databases/pg-test`) to devDependencies.
 *   2. Spin up a temp Postgres container per `describe` block.
 *   3. Read the migrations directory in lexical order.
 *   4. Execute each file via `client.query(sql)`. Assert no error.
 *   5. Optional: assert key invariants after the run (table existence,
 *      column types, RLS policies).
 *   6. Tear the container down in `afterAll`.
 */
import { describe, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const MIGRATIONS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "supabase",
  "migrations",
);

describe("migrations.apply — apply all migrations in order", () => {
  it.skip("applies every supabase/migrations/*.sql file on a temp Postgres", async () => {
    // PLACEHOLDER. Implementation deferred — see file header.
    //
    // Sketch (do NOT mock — actual Postgres only):
    //
    //   const container = await new GenericContainer("postgres:15")
    //     .withEnvironment({ POSTGRES_PASSWORD: "test" })
    //     .withExposedPorts(5432)
    //     .start();
    //   const pool = new Pool({ /* ... container details ... */ });
    //   try {
    //     for (const file of listMigrations()) {
    //       const sql = fs.readFileSync(file, "utf8");
    //       await pool.query(sql);
    //     }
    //   } finally {
    //     await pool.end();
    //     await container.stop();
    //   }
  });

  // Sanity check that the migrations directory exists and is non-empty —
  // this is fast, requires no DB, and guards against the directory being
  // accidentally deleted or moved during a refactor.
  it("supabase/migrations/ directory contains .sql files", () => {
    const exists = fs.existsSync(MIGRATIONS_DIR);
    if (!exists) {
      throw new Error(
        `supabase/migrations/ not found at ${MIGRATIONS_DIR} — repository structure changed`,
      );
    }
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    if (files.length === 0) {
      throw new Error("supabase/migrations/ contains no .sql files");
    }
    // Lock the lexical-order invariant: every file starts with a
    // 14-digit timestamp prefix so chronological order = lexical order.
    for (const f of files) {
      if (!/^\d{14}_/.test(f)) {
        throw new Error(
          `Migration file does not match timestamp prefix convention: ${f}`,
        );
      }
    }
  });
});
