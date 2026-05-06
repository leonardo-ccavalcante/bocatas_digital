/**
 * rls-column-grants.migration.test.ts — String-level lint (Phase B.2.3).
 *
 * Asserts that the pending migration `20260508000001_high_risk_fields_rls.sql`
 * contains the expected REVOKE / GRANT statements for the three high-risk
 * PII fields on both `persons` and `families`.
 *
 * The migration is intentionally NOT applied yet — see the file header.
 * This test only validates the SQL text so the contract is preserved as
 * the file is reviewed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../supabase/migrations/20260508000001_high_risk_fields_rls.sql",
);

const HIGH_RISK_COLS = [
  "situacion_legal",
  "recorrido_migratorio",
  "foto_documento_url",
] as const;

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("high-risk fields RLS migration — file presence", () => {
  it("the migration file exists and is non-empty", () => {
    const sql = readMigration();
    expect(sql.length).toBeGreaterThan(0);
  });

  it("explicitly marks itself as PENDING REVIEW", () => {
    const sql = readMigration();
    expect(sql).toMatch(/PENDING REVIEW/i);
  });
});

describe("high-risk fields RLS migration — REVOKE statements", () => {
  it("revokes SELECT on persons high-risk columns from authenticated", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /REVOKE\s+SELECT\s*\([^)]*situacion_legal[^)]*\)\s+ON\s+public\.persons\s+FROM\s+authenticated/i,
    );
    for (const col of HIGH_RISK_COLS) {
      expect(sql).toMatch(new RegExp(col, "i"));
    }
  });

  it("revokes SELECT on families high-risk columns from authenticated", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /REVOKE\s+SELECT\s*\([^)]*situacion_legal[^)]*\)\s+ON\s+public\.families\s+FROM\s+authenticated/i,
    );
  });
});

describe("high-risk fields RLS migration — GRANT statements", () => {
  it("grants SELECT on persons high-risk columns to admin_role", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /GRANT\s+SELECT\s*\([^)]*\)\s+ON\s+public\.persons\s+TO\s+admin_role/i,
    );
  });

  it("grants SELECT on persons high-risk columns to superadmin_role", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /GRANT\s+SELECT\s*\([^)]*\)\s+ON\s+public\.persons\s+TO\s+superadmin_role/i,
    );
  });

  it("grants SELECT on families high-risk columns to admin_role", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /GRANT\s+SELECT\s*\([^)]*\)\s+ON\s+public\.families\s+TO\s+admin_role/i,
    );
  });

  it("grants SELECT on families high-risk columns to superadmin_role", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /GRANT\s+SELECT\s*\([^)]*\)\s+ON\s+public\.families\s+TO\s+superadmin_role/i,
    );
  });
});

describe("high-risk fields RLS migration — rollback documentation", () => {
  it("documents how to rollback the column-level grants", () => {
    const sql = readMigration();
    // The DOWN/rollback block must mention re-granting SELECT to
    // authenticated for both tables.
    expect(sql).toMatch(/ROLLBACK|DOWN/i);
    expect(sql).toMatch(
      /GRANT\s+SELECT[^;]*ON\s+public\.persons\s+TO\s+authenticated/i,
    );
    expect(sql).toMatch(
      /GRANT\s+SELECT[^;]*ON\s+public\.families\s+TO\s+authenticated/i,
    );
  });
});
