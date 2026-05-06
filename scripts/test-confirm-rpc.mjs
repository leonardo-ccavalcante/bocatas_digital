import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url, key);

// First create a real preview to test with
const payload = {
  groups: [{
    legacy_numero_familia: "TEST-CONFIRM-001",
    rows: [],
    person_dedup_hits: [],
    errors: [],
    family_already_imported: false
  }],
  src_filename: "test.csv"
};
const { data: preview, error: insertErr } = await db
  .from("bulk_import_previews")
  .insert({ parsed_rows: payload, created_by: "test-confirm-user" })
  .select("token")
  .single();

if (insertErr) {
  console.log("INSERT FAILED:", JSON.stringify(insertErr));
  process.exit(1);
}
console.log("Preview token:", preview.token);

// Now call the RPC with service-role key
const { data, error } = await db.rpc("confirm_legacy_familias_import", {
  p_token: preview.token,
  p_src_filename: "test.csv",
});
console.log("RPC data:", JSON.stringify(data));
console.log("RPC error:", JSON.stringify(error));
