/**
 * family_webhook_log.migration.test.ts — Phase B.7.5 string-level lint.
 *
 * Asserts that the PENDING REVIEW migration for `family_webhook_log`
 * contains the expected DDL. The migration is NOT executed — this is a
 * contract test against the SQL text only, mirroring the pattern in
 * `firma.migration.test.ts` (B.4.5).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../supabase/migrations/20260512000001_create_family_webhook_log.sql",
);

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("family_webhook_log migration — file presence", () => {
  it("the migration file exists and is non-empty", () => {
    const sql = readMigration();
    expect(sql.length).toBeGreaterThan(0);
  });

  it("explicitly marks itself as PENDING REVIEW", () => {
    const sql = readMigration();
    expect(sql).toMatch(/PENDING REVIEW/i);
  });
});

describe("family_webhook_log migration — table DDL", () => {
  it("creates the family_webhook_log table", () => {
    const sql = readMigration();
    expect(sql).toMatch(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?family_webhook_log/i);
  });

  it("declares family_id as NOT NULL FK to families(id) with ON DELETE CASCADE", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /family_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+families\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    );
  });

  it("declares event as NOT NULL TEXT", () => {
    const sql = readMigration();
    expect(sql).toMatch(/event\s+TEXT\s+NOT\s+NULL/i);
  });

  it("declares attempted_at as TIMESTAMPTZ NOT NULL DEFAULT now()", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /attempted_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i,
    );
  });

  it("declares status_code, response_body, and error columns", () => {
    const sql = readMigration();
    expect(sql).toMatch(/status_code\s+INT/i);
    expect(sql).toMatch(/response_body\s+TEXT/i);
    expect(sql).toMatch(/error\s+TEXT/i);
  });
});

describe("family_webhook_log migration — indexes + RLS", () => {
  it("creates a lookup index on (family_id, attempted_at DESC)", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /CREATE\s+INDEX[^;]+idx_family_webhook_log_by_family[^;]+ON\s+family_webhook_log\s*\(\s*family_id,\s*attempted_at\s+DESC\s*\)/i,
    );
  });

  it("creates a lookup index on (event, attempted_at DESC)", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /CREATE\s+INDEX[^;]+idx_family_webhook_log_by_event[^;]+ON\s+family_webhook_log\s*\(\s*event,\s*attempted_at\s+DESC\s*\)/i,
    );
  });

  it("enables RLS on the audit table", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+family_webhook_log\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
  });

  it("declares a SELECT policy for superadmin_role only", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /CREATE\s+POLICY\s+family_webhook_log_superadmin_select[\s\S]+FOR\s+SELECT[\s\S]+TO\s+superadmin_role/i,
    );
  });

  it("does NOT declare any UPDATE or DELETE policy (append-only ledger)", () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/CREATE\s+POLICY[^;]+FOR\s+UPDATE/i);
    expect(sql).not.toMatch(/CREATE\s+POLICY[^;]+FOR\s+DELETE/i);
  });
});

describe("family_webhook_log migration — rollback documentation", () => {
  it("documents how to rollback (DROP TABLE / DROP INDEX in a comment block)", () => {
    const sql = readMigration();
    expect(sql).toMatch(/ROLLBACK|DOWN/i);
    expect(sql).toMatch(/DROP\s+TABLE\s+IF\s+EXISTS\s+public\.family_webhook_log/i);
    expect(sql).toMatch(
      /DROP\s+INDEX\s+IF\s+EXISTS\s+public\.idx_family_webhook_log_by_family/i,
    );
  });
});
