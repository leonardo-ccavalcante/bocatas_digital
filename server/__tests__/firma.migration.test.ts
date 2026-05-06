/**
 * firma.migration.test.ts — Phase B.4.5 string-level lint.
 *
 * Asserts that the two PENDING REVIEW migrations for the digital signature
 * legal stack contain the expected DDL statements. The migrations are NOT
 * executed — this is a contract test against the SQL text only, mirroring
 * the pattern established by `rls-column-grants.migration.test.ts` (B.2.3).
 *
 *   - 20260509000001_delivery_signature_audit.sql
 *   - 20260509000002_firmas_entregas_storage_rls.sql
 *
 * Each is parsed as a string and asserted against the contract documented
 * in /Users/familiagirardicavalcante/.claude/plans/memoized-dancing-stonebraker.md
 * Phase B.4.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const AUDIT_MIGRATION_PATH = resolve(
  __dirname,
  "../../supabase/migrations/20260509000001_delivery_signature_audit.sql",
);

const STORAGE_MIGRATION_PATH = resolve(
  __dirname,
  "../../supabase/migrations/20260509000002_firmas_entregas_storage_rls.sql",
);

function readAuditMigration(): string {
  return readFileSync(AUDIT_MIGRATION_PATH, "utf8");
}

function readStorageMigration(): string {
  return readFileSync(STORAGE_MIGRATION_PATH, "utf8");
}

// ─── delivery_signature_audit migration ─────────────────────────────────────

describe("delivery_signature_audit migration — file presence", () => {
  it("the migration file exists and is non-empty", () => {
    const sql = readAuditMigration();
    expect(sql.length).toBeGreaterThan(0);
  });

  it("explicitly marks itself as PENDING REVIEW", () => {
    const sql = readAuditMigration();
    expect(sql).toMatch(/PENDING REVIEW/i);
  });

  it("references the CARTA_ABOGADO_RGPD signoff requirement", () => {
    const sql = readAuditMigration();
    expect(sql).toMatch(/CARTA_ABOGADO_RGPD/i);
  });
});

describe("delivery_signature_audit migration — table DDL", () => {
  it("creates the delivery_signature_audit table", () => {
    const sql = readAuditMigration();
    expect(sql).toMatch(/CREATE\s+TABLE\s+delivery_signature_audit/i);
  });

  it("declares delivery_id as NOT NULL FK to deliveries(id) with ON DELETE CASCADE", () => {
    const sql = readAuditMigration();
    expect(sql).toMatch(
      /delivery_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+deliveries\(id\)\s+ON\s+DELETE\s+CASCADE/i,
    );
  });

  it("declares signer_person_id as NOT NULL FK to persons(id)", () => {
    const sql = readAuditMigration();
    expect(sql).toMatch(
      /signer_person_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+persons\(id\)/i,
    );
  });

  it("declares signed_at as TIMESTAMPTZ NOT NULL DEFAULT now()", () => {
    const sql = readAuditMigration();
    expect(sql).toMatch(
      /signed_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i,
    );
  });

  it("declares client_ip_hash column", () => {
    const sql = readAuditMigration();
    expect(sql).toMatch(/client_ip_hash\s+TEXT/i);
  });

  it("declares created_at as TIMESTAMPTZ NOT NULL DEFAULT now()", () => {
    const sql = readAuditMigration();
    expect(sql).toMatch(
      /created_at\s+TIMESTAMPTZ\s+NOT\s+NULL\s+DEFAULT\s+now\(\)/i,
    );
  });
});

describe("delivery_signature_audit migration — uniqueness + RLS", () => {
  it("creates a UNIQUE INDEX on delivery_id (one signature per delivery)", () => {
    const sql = readAuditMigration();
    expect(sql).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+delivery_signature_audit_one_per_delivery\s+ON\s+delivery_signature_audit\s*\(\s*delivery_id\s*\)/i,
    );
  });

  it("enables RLS on the audit table", () => {
    const sql = readAuditMigration();
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+delivery_signature_audit\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
  });

  it("declares an INSERT policy for voluntario_role", () => {
    const sql = readAuditMigration();
    expect(sql).toMatch(
      /CREATE\s+POLICY[^;]+FOR\s+INSERT[^;]+TO\s+voluntario_role/i,
    );
  });

  it("declares a SELECT policy for admin_role and superadmin_role", () => {
    const sql = readAuditMigration();
    expect(sql).toMatch(
      /CREATE\s+POLICY[^;]+FOR\s+SELECT[^;]+admin_role[^;]+superadmin_role/i,
    );
  });

  it("does NOT declare any UPDATE or DELETE policy (append-only)", () => {
    const sql = readAuditMigration();
    expect(sql).not.toMatch(/CREATE\s+POLICY[^;]+FOR\s+UPDATE/i);
    expect(sql).not.toMatch(/CREATE\s+POLICY[^;]+FOR\s+DELETE/i);
  });
});

describe("delivery_signature_audit migration — rollback documentation", () => {
  it("documents how to rollback (DROP TABLE / DROP INDEX in a comment block)", () => {
    const sql = readAuditMigration();
    expect(sql).toMatch(/ROLLBACK|DOWN/i);
    expect(sql).toMatch(/DROP\s+TABLE\s+IF\s+EXISTS\s+public\.delivery_signature_audit/i);
    expect(sql).toMatch(/DROP\s+INDEX\s+IF\s+EXISTS\s+public\.delivery_signature_audit_one_per_delivery/i);
  });
});

// ─── firmas-entregas storage RLS migration ──────────────────────────────────

describe("firmas-entregas storage RLS migration — file presence", () => {
  it("the migration file exists and is non-empty", () => {
    const sql = readStorageMigration();
    expect(sql.length).toBeGreaterThan(0);
  });

  it("explicitly marks itself as PENDING REVIEW", () => {
    const sql = readStorageMigration();
    expect(sql).toMatch(/PENDING REVIEW/i);
  });
});

describe("firmas-entregas storage RLS migration — bucket + policies", () => {
  it("creates a private bucket named firmas-entregas", () => {
    const sql = readStorageMigration();
    expect(sql).toMatch(
      /INSERT\s+INTO\s+storage\.buckets[^;]+'firmas-entregas'[^;]+false/i,
    );
  });

  it("declares a SELECT policy restricted to admin_role and superadmin_role", () => {
    const sql = readStorageMigration();
    expect(sql).toMatch(
      /CREATE\s+POLICY\s+firmas_entregas_select[\s\S]+FOR\s+SELECT[\s\S]+TO\s+admin_role,\s*superadmin_role[\s\S]+bucket_id\s*=\s*'firmas-entregas'/i,
    );
  });

  it("declares an INSERT policy restricted to voluntario_role", () => {
    const sql = readStorageMigration();
    expect(sql).toMatch(
      /CREATE\s+POLICY\s+firmas_entregas_insert[\s\S]+FOR\s+INSERT[\s\S]+TO\s+voluntario_role[\s\S]+bucket_id\s*=\s*'firmas-entregas'/i,
    );
  });

  it("does NOT declare any DELETE policy on storage.objects (append-only retention)", () => {
    const sql = readStorageMigration();
    expect(sql).not.toMatch(
      /CREATE\s+POLICY[^;]+FOR\s+DELETE[^;]+ON\s+storage\.objects/i,
    );
  });

  it("does NOT declare any UPDATE policy on storage.objects (immutable evidence)", () => {
    const sql = readStorageMigration();
    expect(sql).not.toMatch(
      /CREATE\s+POLICY[^;]+FOR\s+UPDATE[^;]+ON\s+storage\.objects/i,
    );
  });
});

describe("firmas-entregas storage RLS migration — rollback documentation", () => {
  it("documents how to rollback (DROP POLICY + bucket cleanup)", () => {
    const sql = readStorageMigration();
    expect(sql).toMatch(/ROLLBACK|DOWN/i);
    expect(sql).toMatch(/DROP\s+POLICY\s+IF\s+EXISTS\s+firmas_entregas_select/i);
    expect(sql).toMatch(/DROP\s+POLICY\s+IF\s+EXISTS\s+firmas_entregas_insert/i);
  });
});
