/**
 * scripts/export-applied-migrations.ts
 *
 * One-shot migration drift fixer: reads `supabase_migrations.schema_migrations` from
 * production (or any Supabase project) and writes each applied migration's SQL to
 * `supabase/migrations/EXPORTED/<version>_<name>.sql`.
 *
 * Why: applied migration history (52+ entries on prod as of 2026-05-05) is wider than
 * the files in `supabase/migrations/` (22 files). Without this export, `supabase db reset`
 * locally cannot reproduce production schema — every developer's local DB silently diverges.
 *
 * Usage:
 *   1. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are in env (e.g., from .env.local)
 *   2. pnpm tsx scripts/export-applied-migrations.ts
 *   3. Review generated files under supabase/migrations/EXPORTED/
 *   4. Resolve any duplicates with files already in supabase/migrations/ (likely the
 *      EXPORTED/ versions are authoritative for any pre-2026-05-06 migration)
 *   5. Run `supabase db reset --local` to verify clean reproduction
 *   6. Commit the EXPORTED/ tree
 *
 * Idempotent: safe to re-run. Warns if a file's content drifts from the DB.
 *
 * Connect with:
 *   SUPABASE_URL=$(read from Supabase dashboard → Project Settings → API → URL)
 *   SUPABASE_SERVICE_ROLE_KEY=$(read from same page → service_role secret)
 *
 * NEVER commit the service role key. Use `.env.local` and add it to `.gitignore`.
 */

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUT_DIR = "supabase/migrations/EXPORTED";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  console.error("Tip: source .env.local first.");
  process.exit(1);
}

interface Row {
  version: string;
  name: string;
  statements: string[];
}

async function main(): Promise<void> {
  const supa = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data, error } = await supa
    .schema("supabase_migrations")
    .from("schema_migrations")
    .select("version, name, statements")
    .order("version", { ascending: true })
    .returns<Row[]>();

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  let written = 0;
  let drift = 0;
  let unchanged = 0;

  for (const m of data ?? []) {
    const file = join(OUT_DIR, `${m.version}_${m.name}.sql`);
    const content = `-- ${m.version}_${m.name}\n-- Re-exported from supabase_migrations.schema_migrations on ${new Date().toISOString()}\n\n${m.statements.join("\n\n")}\n`;

    if (existsSync(file)) {
      const existing = readFileSync(file, "utf8");
      if (existing.trim() === content.trim()) {
        unchanged++;
      } else {
        console.warn(`DRIFT: ${file} — local file differs from DB`);
        drift++;
      }
      continue;
    }

    writeFileSync(file, content);
    console.log(`Wrote ${file}`);
    written++;
  }

  console.log(`\nDone. ${written} new files, ${unchanged} unchanged, ${drift} drift warnings.`);
  if (drift > 0) {
    console.error("Drift warnings present — investigate which version is canonical.");
    process.exit(2);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
