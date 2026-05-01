/**
 * bulk-import-pg-fn.test.ts
 *
 * TDD test for the confirm_bulk_announcement_import PostgreSQL function.
 *
 * Root cause: the migration SQL was missing the ::tipo_announcement cast
 * when inserting into announcements.tipo (a PostgreSQL ENUM column).
 * Without the explicit cast, PL/pgSQL raises:
 *   "column tipo is of type tipo_announcement but expression is of type text"
 *
 * This test validates the migration SQL file contains the correct cast,
 * ensuring the bug cannot regress silently.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const MIGRATION_FILE = join(
  __dirname,
  "../../supabase/migrations/20260501000008_confirm_bulk_import_fn.sql"
);

describe("confirm_bulk_announcement_import PG function migration", () => {
  const sql = readFileSync(MIGRATION_FILE, "utf-8");

  it("casts tipo to ::tipo_announcement enum when inserting into announcements", () => {
    // The INSERT into announcements must use an explicit cast because
    // PostgreSQL cannot implicitly cast text → custom ENUM in PL/pgSQL.
    // Without this cast, every row fails with a type error.
    expect(sql).toContain("(v_row ->> 'tipo')::tipo_announcement");
  });

  it("does not use bare v_row ->> tipo without cast in INSERT VALUES", () => {
    // Ensure the broken pattern (no cast) is not present in the INSERT block.
    // We check that the only occurrence of "tipo" in the VALUES section
    // is the casted version.
    const insertBlock = sql.match(/INSERT INTO announcements[\s\S]*?RETURNING/)?.[0] ?? "";
    // The bare uncast pattern should NOT appear inside the INSERT VALUES
    const barePattern = /v_row\s*->>\s*'tipo'(?!\s*\)\s*::)/;
    expect(barePattern.test(insertBlock)).toBe(false);
  });

  it("includes the tipo column in the INSERT column list", () => {
    expect(sql).toContain("tipo,");
  });
});
