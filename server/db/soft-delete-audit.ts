import { createClient } from "@supabase/supabase-js";

export interface TableAudit {
  tableName: string;
  hasDeletedAt: boolean;
  hasIndex: boolean;
  requiresDeletedAt: boolean;
  migrationSQL: string;
  status: "compliant" | "missing-column" | "missing-index";
}

const SOFT_DELETE_REQUIRED_TABLES = [
  "families",
  "familia_miembros",
  "persons",
  "programs",
  "announcements",
  "entregas",
  "family_documents",
  "documento_extranjero",
  "programa_participante",
];

export async function auditSoftDeleteSchema(): Promise<TableAudit[]> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(supabaseUrl, supabaseServiceKey);

  const results: TableAudit[] = [];

  for (const tableName of SOFT_DELETE_REQUIRED_TABLES) {
    try {
      // Check if table has deleted_at column
      const { data: columns, error: columnsError } = await db
        .from(tableName)
        .select("*")
        .limit(0);

      if (columnsError) {
        console.error(`Error checking table ${tableName}:`, columnsError);
        continue;
      }

      // Query information_schema to check for deleted_at column
      const { data: schemaData, error: schemaError } = await db
        .from("information_schema.columns")
        .select("column_name")
        .eq("table_name", tableName)
        .eq("column_name", "deleted_at");

      const hasDeletedAt = !schemaError && schemaData && schemaData.length > 0;

      // Check if index exists
      const { data: indexData, error: indexError } = await db
        .from("information_schema.statistics")
        .select("index_name")
        .eq("table_name", tableName)
        .ilike("index_name", `%deleted_at%`);

      const hasIndex = !indexError && indexData && indexData.length > 0;

      const status = !hasDeletedAt
        ? "missing-column"
        : !hasIndex
          ? "missing-index"
          : "compliant";

      const migrationSQL = !hasDeletedAt
        ? `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_${tableName}_deleted_at ON ${tableName}(deleted_at);`
        : !hasIndex
          ? `CREATE INDEX IF NOT EXISTS idx_${tableName}_deleted_at ON ${tableName}(deleted_at);`
          : "";

      results.push({
        tableName,
        hasDeletedAt,
        hasIndex,
        requiresDeletedAt: true,
        migrationSQL,
        status,
      });
    } catch (error) {
      console.error(`Error auditing table ${tableName}:`, error);
    }
  }

  return results;
}

export async function generateMigrationScript(): Promise<string> {
  const audit = await auditSoftDeleteSchema();
  const migrations = audit
    .filter((t) => t.migrationSQL)
    .map((t) => t.migrationSQL)
    .join("\n\n");

  return `-- Auto-generated soft-delete schema migrations
-- Generated: ${new Date().toISOString()}

${migrations}

-- Verification query: Check all tables have deleted_at
SELECT table_name, column_name 
FROM information_schema.columns 
WHERE table_name IN (${SOFT_DELETE_REQUIRED_TABLES.map((t) => `'${t}'`).join(",")})
AND column_name = 'deleted_at'
ORDER BY table_name;`;
}
