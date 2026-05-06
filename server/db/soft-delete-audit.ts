import { createClient } from "@supabase/supabase-js";

export interface TableAudit {
  tableName: string;
  hasDeletedAt: boolean;
  hasIndex: boolean;
  requiresDeletedAt: boolean;
  migrationSQL: string;
  status: "compliant" | "missing-column" | "missing-index";
}

/**
 * Tables that MUST have soft-delete support (deleted_at + index).
 * Uses real Supabase table names — no legacy 'entregas' or 'family_documents'.
 */
export const SOFT_DELETE_REQUIRED_TABLES = [
  "families",
  "familia_miembros",
  "persons",
  "programs",
  "announcements",
  "deliveries",
  "family_member_documents",
] as const;

export async function auditSoftDeleteSchema(): Promise<TableAudit[]> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const db = createClient(supabaseUrl, supabaseServiceKey);

  // Use the Supabase RPC function that checks schema via pg_indexes and information_schema
  const { data, error } = await db.rpc("check_soft_delete_schema", {
    table_names: [...SOFT_DELETE_REQUIRED_TABLES],
  });

  if (error) {
    throw new Error(`Failed to audit soft-delete schema: ${error.message}`);
  }

  const schemaRows = (data as Array<{ table_name: string; has_deleted_at: boolean; has_index: boolean }>) ?? [];

  return SOFT_DELETE_REQUIRED_TABLES.map((tableName) => {
    const row = schemaRows.find((r) => r.table_name === tableName);
    const hasDeletedAt = row?.has_deleted_at ?? false;
    const hasIndex = row?.has_index ?? false;

    const status: TableAudit["status"] = !hasDeletedAt
      ? "missing-column"
      : !hasIndex
        ? "missing-index"
        : "compliant";

    const migrationSQL = !hasDeletedAt
      ? `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;\nCREATE INDEX IF NOT EXISTS idx_${tableName}_deleted_at ON ${tableName}(deleted_at);`
      : !hasIndex
        ? `CREATE INDEX IF NOT EXISTS idx_${tableName}_deleted_at ON ${tableName}(deleted_at);`
        : "";

    return {
      tableName,
      hasDeletedAt,
      hasIndex,
      requiresDeletedAt: true,
      migrationSQL,
      status,
    };
  });
}

export async function generateMigrationScript(): Promise<string> {
  const audit = await auditSoftDeleteSchema();
  const migrations = audit
    .filter((t) => t.migrationSQL)
    .map((t) => t.migrationSQL)
    .join("\n\n");

  return `-- Auto-generated soft-delete schema migrations
-- Generated: ${new Date().toISOString()}

${migrations || "-- All tables are compliant"}

-- Verification query: Check all tables have deleted_at
SELECT table_name, column_name 
FROM information_schema.columns 
WHERE table_name IN (${SOFT_DELETE_REQUIRED_TABLES.map((t) => `'${t}'`).join(",")})
AND column_name = 'deleted_at'
ORDER BY table_name;`;
}
