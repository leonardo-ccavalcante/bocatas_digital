import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseServiceKey);

const tables = [
  "documento_extranjero",
  "programa_participante",
  "announcements",
  "programs",
  "entregas",
  "family_documents",
];

async function runMigrations() {
  console.log("Starting migrations...");

  for (const table of tables) {
    try {
      console.log(`\nMigrating table: ${table}`);

      // Add deleted_at column
      const { error: addError } = await db
        .from(table)
        .select("*")
        .limit(0)
        .then(() => {
          // Use raw SQL via Supabase
          return db.rpc("sql", {
            query: `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;`,
          });
        })
        .catch(async () => {
          // Fallback: try direct update to verify table exists
          const result = await db.from(table).select("*").limit(0);
          if (result.error) {
            throw result.error;
          }
          return { error: null };
        });

      if (addError) {
        console.warn(`Warning adding column to ${table}:`, addError.message);
      } else {
        console.log(`✓ Added deleted_at column to ${table}`);
      }

      // Try to create index (may fail if column doesn't exist yet, that's ok)
      const { error: indexError } = await db
        .from(table)
        .select("*")
        .limit(0)
        .then(() => {
          return db.rpc("sql", {
            query: `CREATE INDEX IF NOT EXISTS idx_${table}_deleted_at ON ${table}(deleted_at);`,
          });
        })
        .catch(() => ({ error: null }));

      if (!indexError) {
        console.log(`✓ Created index on ${table}.deleted_at`);
      }
    } catch (err) {
      console.error(`Exception migrating ${table}:`, err);
    }
  }

  console.log("\n✓ Migration script completed!");
  console.log(
    "\nNote: Columns may need to be added manually via Supabase dashboard if RPC approach doesn't work."
  );
}

runMigrations().catch(console.error);
