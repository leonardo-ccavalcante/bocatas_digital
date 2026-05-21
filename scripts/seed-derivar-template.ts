/**
 * Seeds (or replaces) the Derivar DOCX template in Supabase Storage.
 *
 * The template lives in bucket `program-document-templates` at
 * `derivacion_hoja_template_v1.docx`. To swap in Bocatas's branded version,
 * either re-run this script after replacing the committed fixture, or upload
 * the new .docx to that bucket/path via Supabase Studio (Storage). Placeholder
 * names must match shared/derivar/templatePlaceholders.ts.
 *
 * Run:  npx tsx --env-file=.env.local scripts/seed-derivar-template.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAdminClient } from "../client/src/lib/supabase/server";
import {
  TEMPLATE_BUCKET,
  TEMPLATE_FILENAME_DOCX,
} from "../shared/derivar/templatePlaceholders";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, "../server/_core/__fixtures__/derivacion_hoja_template_v1.docx");

async function main() {
  const db = createAdminClient();
  const bytes = readFileSync(fixture);
  const { error } = await db.storage
    .from(TEMPLATE_BUCKET)
    .upload(TEMPLATE_FILENAME_DOCX, bytes, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
  if (error) {
    console.error("Upload failed:", error.message);
    process.exit(1);
  }
  console.log(`Uploaded ${TEMPLATE_FILENAME_DOCX} (${bytes.length} bytes) to ${TEMPLATE_BUCKET}`);
}
main().then(() => process.exit(0));
