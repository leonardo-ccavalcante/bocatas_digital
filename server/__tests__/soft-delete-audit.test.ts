import { describe, it, expect } from "vitest";
import { auditSoftDeleteSchema } from "../db/soft-delete-audit";

describe("Soft-Delete Schema Audit", () => {
  it("identifies all tables with soft-delete requirements", async () => {
    const audit = await auditSoftDeleteSchema();

    // Tables that MUST have deleted_at
    const requiredTables = [
      "families",
      "familia_miembros",
      "persons",
      "programs",
      "announcements",
      "entregas",
      "family_documents",
    ];

    for (const table of requiredTables) {
      const result = audit.find((t) => t.tableName === table);
      expect(result).toBeDefined();
      expect(result?.hasDeletedAt).toBe(true);
      expect(result?.hasIndex).toBe(true);
    }
  });

  it("identifies tables missing deleted_at column", async () => {
    const audit = await auditSoftDeleteSchema();
    const missing = audit.filter((t) => !t.hasDeletedAt && t.requiresDeletedAt);

    // Should be empty after fix
    expect(missing).toHaveLength(0);
  });

  it("verifies deleted_at indexes exist for performance", async () => {
    const audit = await auditSoftDeleteSchema();
    const withoutIndex = audit.filter((t) => t.hasDeletedAt && !t.hasIndex);

    // Should be empty after fix
    expect(withoutIndex).toHaveLength(0);
  });

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
  });
});
