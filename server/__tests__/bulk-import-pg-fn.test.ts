/**
 * bulk-import-pg-fn.test.ts
 *
 * TDD regression tests for the confirm_bulk_announcement_import PostgreSQL function
 * and related schema migrations.
 *
 * Bug 1: Missing ::tipo_announcement cast → all rows failed with type error
 * Bug 2: announcements.autor_id and announcement_audit_log.edited_by were uuid
 *        but Manus user IDs are non-UUID strings → INSERT failed with type error
 *
 * These tests validate the migration SQL files to prevent silent regressions.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const PG_FN_MIGRATION = join(
  __dirname,
  "../../supabase/migrations/20260501000008_confirm_bulk_import_fn.sql"
);

const AUTOR_ID_MIGRATION = join(
  __dirname,
  "../../supabase/migrations/20260501000009_fix_autor_id_type.sql"
);

describe("confirm_bulk_announcement_import PG function migration", () => {
  const sql = readFileSync(PG_FN_MIGRATION, "utf-8");

  it("casts tipo to ::tipo_announcement enum when inserting into announcements", () => {
    // Without this cast, PostgreSQL raises:
    // "column tipo is of type tipo_announcement but expression is of type text"
    expect(sql).toContain("(v_row ->> 'tipo')::tipo_announcement");
  });

  it("does not use bare v_row ->> tipo without cast in INSERT VALUES", () => {
    const insertBlock = sql.match(/INSERT INTO announcements[\s\S]*?RETURNING/)?.[0] ?? "";
    const barePattern = /v_row\s*->>\s*'tipo'(?!\s*\)\s*::)/;
    expect(barePattern.test(insertBlock)).toBe(false);
  });

  it("includes the tipo column in the INSERT column list", () => {
    expect(sql).toContain("tipo,");
  });
});

describe("fix_autor_id_type migration (20260501000009)", () => {
  const sql = readFileSync(AUTOR_ID_MIGRATION, "utf-8");

  it("alters announcements.autor_id from uuid to text", () => {
    // Manus user IDs are non-UUID strings (e.g. "Vdx6QymMi2aW275wQBxTfU")
    // so the column must be text, not uuid.
    expect(sql).toMatch(/ALTER\s+TABLE.*announcements[\s\S]*?autor_id\s+TYPE\s+text/i);
  });

  it("alters announcement_audit_log.edited_by from uuid to text", () => {
    expect(sql).toMatch(/ALTER\s+TABLE.*announcement_audit_log[\s\S]*?edited_by\s+TYPE\s+text/i);
  });

  it("uses USING clause for safe data conversion", () => {
    // USING ensures existing uuid values are cast to text without data loss
    expect(sql).toContain("USING autor_id::text");
    expect(sql).toContain("USING edited_by::text");
  });
});
