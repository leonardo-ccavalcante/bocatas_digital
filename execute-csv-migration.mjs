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
      "./supabase/migrations/20260501000010_fix_bulk_import_previews_and_add_history.sql",
      "utf-8"
    );

    console.log("🚀 Executing migration...");
    console.log("   - Converting created_by from uuid to text");
    console.log("   - Creating bulk_import_history table");
    console.log("   - Setting up indexes and RLS");

    // Split SQL into individual statements
    const statements = migrationSQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("--"));

    let successCount = 0;
    for (const statement of statements) {
      try {
        const { error } = await supabase.rpc("exec_sql", { sql: statement });

        if (error && error.message.includes("exec_sql")) {
          console.log("⚠️  Direct SQL execution not available");
          console.log("   Please execute manually via Supabase dashboard:");
          console.log("   1. Go to SQL Editor");
          console.log("   2. Copy: supabase/migrations/20260501000010_fix_bulk_import_previews_and_add_history.sql");
          console.log("   3. Execute");
          process.exit(0);
        }

        if (error) throw error;
        successCount++;
      } catch (err) {
        console.error(`❌ Error: ${err.message}`);
      }
    }

    console.log(`✅ Migration executed! (${successCount} statements)`);
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  }
}

executeMigration();
