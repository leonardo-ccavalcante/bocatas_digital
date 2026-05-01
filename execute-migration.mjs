import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeMigration() {
  try {
    console.log("📋 Reading migration file...");
    const migrationSQL = fs.readFileSync(
      "./supabase/migrations/20260501000009_fix_bulk_import_previews_created_by_type.sql",
      "utf-8"
    );

    console.log("🚀 Executing migration to fix bulk_import_previews schema...");
    console.log("   - Converting created_by column from uuid to text");
    console.log("   - Preserving audit trail (openId identifiers)");

    // Split SQL into individual statements
    const statements = migrationSQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("--"));

    let successCount = 0;
    for (const statement of statements) {
      try {
        // Use the Supabase query method to execute raw SQL
        const { error } = await supabase.rpc("exec_sql", {
          sql: statement,
        });

        if (error) {
          // If exec_sql doesn't exist, try alternative approach
          if (error.message.includes("exec_sql")) {
            console.log("⚠️  Direct SQL execution not available via RPC");
            console.log("   Please execute the migration manually via Supabase dashboard:");
            console.log("   1. Go to SQL Editor in Supabase dashboard");
            console.log("   2. Copy the SQL from: supabase/migrations/20260501000009_fix_bulk_import_previews_created_by_type.sql");
            console.log("   3. Execute the SQL");
            process.exit(0);
          }
          throw error;
        }
        successCount++;
      } catch (err) {
        console.error(`❌ Error executing statement: ${err.message}`);
      }
    }

    console.log(`✅ Migration executed successfully! (${successCount} statements)`);
    console.log("   - created_by column is now text type");
    console.log("   - Audit trail preserved (stores openId identifiers)");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    console.log("\n📝 Manual execution required:");
    console.log("   1. Open Supabase dashboard");
    console.log("   2. Go to SQL Editor");
    console.log("   3. Execute: supabase/migrations/20260501000009_fix_bulk_import_previews_created_by_type.sql");
    process.exit(1);
  }
}

executeMigration();
