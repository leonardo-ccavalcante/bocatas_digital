/**
 * Migration runner — applies the 6 new Supabase SQL migrations from PRs #68-70
 * Uses the service role key (admin client) to bypass RLS.
 * Run with: node scripts/run-migrations.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const migrations = [
  "supabase/migrations/20260604000001_fix_legacy_person_dedup_by_document.sql",
  "supabase/migrations/20260604000002_confirm_legacy_familias_import_estado_counts.sql",
  "supabase/migrations/20260604000003_add_informe_social_texto_and_enrich_audit.sql",
  "supabase/migrations/20260604000004_enrich_families_from_informes_fn.sql",
  "supabase/migrations/20260605000001_confirm_legacy_familias_import_upsert_mode.sql",
  "supabase/migrations/20260605000002_enrich_families_actor_jwt_sub.sql",
];

async function runMigrations() {
  console.log(`🚀 Applying ${migrations.length} migrations to Supabase...\n`);

  for (const migrationPath of migrations) {
    const fullPath = resolve(projectRoot, migrationPath);
    const sql = readFileSync(fullPath, "utf-8");
    const name = migrationPath.split("/").pop();

    console.log(`⏳ Applying: ${name}`);
    try {
      const { error } = await supabase.rpc("exec_sql", { sql }).single();
      if (error) {
        // Try direct query if exec_sql RPC doesn't exist
        console.log(`   ↳ exec_sql RPC not available, trying direct query...`);
        throw error;
      }
      console.log(`   ✅ Done\n`);
    } catch {
      // Fallback: use the REST API to execute raw SQL via the pg connection
      try {
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ sql }),
        });
        if (!response.ok) {
          const text = await response.text();
          console.error(`   ❌ Failed: ${text}\n`);
        } else {
          console.log(`   ✅ Done\n`);
        }
      } catch (err2) {
        console.error(`   ❌ Error: ${err2.message}\n`);
      }
    }
  }

  console.log("✅ Migration run complete.");
}

runMigrations().catch(console.error);
