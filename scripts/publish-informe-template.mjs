// Publish the Informe de Valoración Social docxtemplater template as the ACTIVE
// `informe_social` template. Run against a Supabase instance:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/publish-informe-template.mjs
//
// Idempotent: if the fixture is byte-identical to the currently-active template
// this is a no-op, so the version history only ever records real changes.
// Otherwise it bumps the version, uploads the .docx to the `document-templates`
// bucket, deactivates the prior active row and inserts a new active one.
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "../server/services/__fixtures__/informe-valoracion-social.docx");
const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PLACEHOLDERS = [
  "titular.nombre",
  "titular.apellidos",
  "titular.documento",
  "familia.numero",
  "valoracion",
];

const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const buf = fs.readFileSync(FIXTURE);
  const fixtureHash = crypto.createHash("sha256").update(buf).digest("hex");

  // Skip when the fixture already IS the active template — keeps the version
  // history honest (one row per real change, not one per run).
  const { data: active } = await db
    .from("document_templates")
    .select("version, storage_path")
    .eq("slug", "informe_social")
    .eq("is_active", true)
    .maybeSingle();
  if (active) {
    const dl = await db.storage.from("document-templates").download(active.storage_path);
    if (dl.data) {
      const activeHash = crypto
        .createHash("sha256")
        .update(Buffer.from(await dl.data.arrayBuffer()))
        .digest("hex");
      if (activeHash === fixtureHash) {
        console.log(`No change: fixture already active as v${active.version}. Nothing to publish.`);
        return;
      }
    }
  }

  // Bump from the highest existing version so a new row never collides, even if
  // an older version was manually reactivated.
  const { data: last } = await db
    .from("document_templates")
    .select("version")
    .eq("slug", "informe_social")
    .order("version", { ascending: false })
    .limit(1);
  const version = (last?.[0]?.version ?? 0) + 1;
  const storagePath = `informe_social/v${version}/informe-valoracion-social.docx`;

  // ensure bucket (ignore "already exists")
  await db.storage.createBucket("document-templates", { public: false }).catch(() => {});

  const up = await db.storage.from("document-templates").upload(storagePath, buf, {
    contentType: MIME,
    upsert: true,
  });
  if (up.error) throw up.error;

  // deactivate current active, then insert new active (partial-unique on active+slug)
  await db.from("document_templates").update({ is_active: false }).eq("slug", "informe_social").eq("is_active", true);

  const ins = await db.from("document_templates").insert({
    slug: "informe_social",
    nombre: "Informe de Valoración Social Familia",
    version,
    mime: MIME,
    storage_path: storagePath,
    placeholders: PLACEHOLDERS,
    static_blocks: {},
    logos: [],
    is_active: true,
    created_by: "system:publish-script",
  }).select("id, version").single();
  if (ins.error) throw ins.error;

  console.log(`Published informe_social template v${version} (${ins.data.id}) → ${storagePath}`);
}

main().catch((e) => {
  console.error("Publish failed:", e.message ?? e);
  process.exit(1);
});
