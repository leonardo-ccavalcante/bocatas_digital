import { describe, it, expect } from "vitest";
import { auditSoftDeleteSchema, SOFT_DELETE_REQUIRED_TABLES } from "../db/soft-delete-audit";

describe("Soft-Delete Schema Audit", () => {
  it("identifies all tables with soft-delete requirements", async () => {
    const audit = await auditSoftDeleteSchema();

    // Tables that MUST have deleted_at (real Supabase table names)
    const requiredTables = [
      "families",
      "familia_miembros",
      "persons",
      "programs",
      "announcements",
      "deliveries",              // replaces legacy 'entregas'
      "family_member_documents", // replaces legacy 'family_documents'
    ];

    for (const table of requiredTables) {
      const result = audit.find((t) => t.tableName === table);
      expect(result, `Table ${table} should be in audit results`).toBeDefined();
      expect(result?.hasDeletedAt, `Table ${table} should have deleted_at column`).toBe(true);
      expect(result?.hasIndex, `Table ${table} should have deleted_at index`).toBe(true);
    }
  }, 30_000);

  it("identifies tables missing deleted_at column", async () => {
    const audit = await auditSoftDeleteSchema();
    const missing = audit.filter((t) => !t.hasDeletedAt && t.requiresDeletedAt);

    // Should be empty after migrations
    expect(missing).toHaveLength(0);
  }, 30_000);

  it("verifies deleted_at indexes exist for performance", async () => {
    const audit = await auditSoftDeleteSchema();
    const withoutIndex = audit.filter((t) => t.hasDeletedAt && !t.hasIndex);

    // Should be empty after migrations
    expect(withoutIndex).toHaveLength(0);
  }, 30_000);

  it("generates migration SQL for missing columns", async () => {
    const audit = await auditSoftDeleteSchema();
    const migrations = audit
      .filter((t) => !t.hasDeletedAt && t.requiresDeletedAt)
      .map((t) => t.migrationSQL);

    // Each migration should be valid SQL
    for (const sql of migrations) {
      expect(sql).toContain("ALTER TABLE");
      expect(sql).toContain("ADD COLUMN");
      expect(sql).toContain("deleted_at");
    }
  }, 30_000);

  it("SOFT_DELETE_REQUIRED_TABLES does not include legacy table names", () => {
    const tables = SOFT_DELETE_REQUIRED_TABLES as readonly string[];
    expect(tables).not.toContain("entregas");
    expect(tables).not.toContain("family_documents");
    expect(tables).toContain("deliveries");
    expect(tables).toContain("family_member_documents");
  });
});
