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
  // The GRANTs are emitted via a defensive `DO $$ ... EXECUTE format(...) $$`
  // role×table loop (so a missing role/column on a fresh-or-prod-drifted DB
  // RAISE NOTICEs instead of aborting the whole migration). The assertions
  // therefore validate the parameterized template + the role/table arrays
  // it iterates, not literal per-(role,table) GRANT statements (TECH_DEBT
  // T-02 — these regexes previously expected literals the loop never emits).

  it("grants the three high-risk columns via a parameterized GRANT template", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /GRANT\s+SELECT\s*\([^)]*situacion_legal[^)]*recorrido_migratorio[^)]*foto_documento_url[^)]*\)\s+ON\s+public\.%I\s+TO\s+%I/i,
    );
  });

  it("iterates both elevated roles (admin_role + superadmin_role)", () => {
    const sql = readMigration();
    expect(sql).toMatch(/role_names\s+text\[\]\s*:=\s*ARRAY\[[^\]]*'admin_role'[^\]]*\]/i);
    expect(sql).toMatch(/role_names\s+text\[\]\s*:=\s*ARRAY\[[^\]]*'superadmin_role'[^\]]*\]/i);
  });

  it("iterates both target tables (persons + families)", () => {
    const sql = readMigration();
    expect(sql).toMatch(/table_names\s+text\[\]\s*:=\s*ARRAY\[[^\]]*'persons'[^\]]*\]/i);
    expect(sql).toMatch(/table_names\s+text\[\]\s*:=\s*ARRAY\[[^\]]*'families'[^\]]*\]/i);
  });

  it("tolerates missing roles/columns/tables (defensive EXCEPTION catch)", () => {
    const sql = readMigration();
    // All three missing-object SQLSTATEs are caught so prod-vs-repo drift
    // can't abort the migration.
    expect(sql).toMatch(/WHEN\s+undefined_object\s+THEN/i);
    expect(sql).toMatch(/WHEN\s+undefined_column\s+THEN/i);
    expect(sql).toMatch(/WHEN\s+undefined_table\s+THEN/i);
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
