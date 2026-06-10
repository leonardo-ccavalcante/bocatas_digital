/**
 * Batch 20 auto-migration: adds columns needed for exclude intervention
 * and signed PDF upload features.
 *
 * Runs once at server startup. Uses Supabase service role to execute DDL
 * via a stored procedure that we create if it doesn't exist.
 *
 * Strategy: create a helper PL/pgSQL function via the REST API's
 * /rest/v1/rpc endpoint, then call it. This avoids needing direct
 * postgres access.
 */
import { createAdminClient } from "../../client/src/lib/supabase/server";

export async function runBatch20Migration(): Promise<void> {
  const db = createAdminClient();

  // Check if excluded_at already exists
  const { error: checkErr } = await db
    .from("derivacion_intervenciones")
    .select("excluded_at")
    .limit(1);

  if (!checkErr) {
    // Column already exists
    return;
  }

  if (checkErr.code !== "42703") {
    // Unexpected error — log and continue
    console.warn("[Batch20Migration] Unexpected error checking excluded_at:", checkErr.message);
    return;
  }

  console.log("[Batch20Migration] Running DDL: adding excluded_at, firmado_url columns...");

  // Create a temporary stored function to run DDL
  // We use the Supabase REST API to POST to /rest/v1/rpc/create_batch20_fn
  // But since we can't create functions via REST, we use a workaround:
  // Call the Supabase Management API if available, otherwise log instructions.
  
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY ?? "";
  const projectRef = supabaseUrl.replace("https://", "").replace(".supabase.co", "");

  // Try the Supabase Management API (requires management token)
  // This is available in some deployment environments
  const mgmtToken = process.env.SUPABASE_ACCESS_TOKEN ?? "";
  
  if (mgmtToken) {
    try {
      const resp = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${mgmtToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `
              ALTER TABLE derivacion_intervenciones
                ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS excluded_by TEXT,
                ADD COLUMN IF NOT EXISTS excluded_reason TEXT;
              ALTER TABLE derivacion_hojas
                ADD COLUMN IF NOT EXISTS firmado_url TEXT,
                ADD COLUMN IF NOT EXISTS firmado_at TIMESTAMPTZ;
            `,
          }),
        }
      );
      if (resp.ok) {
        console.log("[Batch20Migration] DDL applied via Management API");
        return;
      }
    } catch {
      // Management API not available
    }
  }

  // Fallback: log the SQL for manual execution
  console.warn(`
[Batch20Migration] Cannot run DDL automatically. Please run the following SQL in your Supabase Dashboard:

ALTER TABLE derivacion_intervenciones
  ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluded_by TEXT,
  ADD COLUMN IF NOT EXISTS excluded_reason TEXT;

ALTER TABLE derivacion_hojas
  ADD COLUMN IF NOT EXISTS firmado_url TEXT,
  ADD COLUMN IF NOT EXISTS firmado_at TIMESTAMPTZ;
  `);
}
