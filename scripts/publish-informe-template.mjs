// Publish the Informe de Valoración Social docxtemplater template as the ACTIVE
// `informe_social` template. Run against a Supabase instance:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/publish-informe-template.mjs
//
// Idempotent-ish: bumps version, deactivates the prior active row, uploads the
// .docx to the `document-templates` bucket, inserts a new active row.
import { createClient } from "@supabase/supabase-js";
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

  // next version
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
