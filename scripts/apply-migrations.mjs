/**
 * Migration runner — applies the 6 new Supabase SQL migrations from PRs #68-70
 * Uses the Supabase Management API to execute raw SQL.
 * Run with: node scripts/apply-migrations.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Extract project ref from URL: https://vqvgcsdvvgyubqxumlwn.supabase.co
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
console.log(`📦 Supabase project: ${projectRef}\n`);

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function executeSql(sql, migrationName) {
  // Use Supabase REST API via the pg endpoint
  const url = new URL(`${supabaseUrl}/rest/v1/rpc/exec_sql`);
  
  // Try the pg REST endpoint for raw SQL execution
  const body = JSON.stringify({ sql });
  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "return=minimal",
    },
  };

  const result = await httpsRequest(options, body);
  return result;
}

async function executeSqlDirect(sql) {
  // Use Supabase's pg REST endpoint directly
  const projectUrl = new URL(supabaseUrl);
  const hostname = projectUrl.hostname;
  
  const body = JSON.stringify({ query: sql });
  const options = {
    hostname: hostname,
    path: "/pg/query",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  };

  return httpsRequest(options, body);
}

const migrations = [
  "supabase/migrations/20260604000001_fix_legacy_person_dedup_by_document.sql",
  "supabase/migrations/20260604000002_confirm_legacy_familias_import_estado_counts.sql",
  "supabase/migrations/20260604000003_add_informe_social_texto_and_enrich_audit.sql",
  "supabase/migrations/20260604000004_enrich_families_from_informes_fn.sql",
  "supabase/migrations/20260605000001_confirm_legacy_familias_import_upsert_mode.sql",
  "supabase/migrations/20260605000002_enrich_families_actor_jwt_sub.sql",
];

async function runMigrations() {
  console.log(`🚀 Applying ${migrations.length} migrations...\n`);
  let passed = 0;
  let failed = 0;

  for (const migrationPath of migrations) {
    const fullPath = resolve(projectRoot, migrationPath);
    const sql = readFileSync(fullPath, "utf-8");
    const name = migrationPath.split("/").pop();

    console.log(`⏳ ${name}`);
    
    // Try exec_sql RPC first
    const result = await executeSql(sql, name);
    
    if (result.status === 200 || result.status === 204) {
      console.log(`   ✅ Applied successfully\n`);
      passed++;
    } else {
      // Try pg/query endpoint
      const result2 = await executeSqlDirect(sql);
      if (result2.status === 200 || result2.status === 204) {
        console.log(`   ✅ Applied via pg/query\n`);
        passed++;
      } else {
        console.log(`   ❌ Status ${result.status}: ${result.body.substring(0, 200)}\n`);
        failed++;
      }
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runMigrations().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
