import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

import { createAdminClient } from "../../client/src/lib/supabase/server";
import {
  TEMPLATE_BUCKET,
  TEMPLATE_FILENAME_DOCX,
} from "../../shared/derivar/templatePlaceholders";

export interface DerivarHojaTemplateData {
  nombre: string;
  numUnidadFamiliar: string;
  programaReferencia: string;
  profesionalReferencia: string;
  fechaApertura: string;
  intervenciones: Array<{
    fecha: string;
    tipo: string;
    descripcion: string;
    recursoNombre: string;
    recursoDireccion: string;
    recursoTelefono: string;
    observaciones: string;
    firmaPlaceholder: string;
  }>;
}

/**
 * Loads the canonical Derivar template from Supabase Storage and fills it
 * with the supplied data. Returns a Buffer containing the .docx bytes.
 *
 * The template (`derivacion_hoja_template_v1.docx`) is a Bocatas-authored
 * asset uploaded to the `program-document-templates` bucket; its placeholder
 * names must match shared/derivar/templatePlaceholders.ts byte-for-byte.
 */
export async function renderDerivarHojaDocx(
  data: DerivarHojaTemplateData,
): Promise<Buffer> {
  const db = createAdminClient();
  const { data: file, error } = await db.storage
    .from(TEMPLATE_BUCKET)
    .download(TEMPLATE_FILENAME_DOCX);
  if (error || !file) {
    throw new Error(
      `Could not load Derivar template: ${error?.message ?? "no file"}`,
    );
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // Render missing placeholders as "" instead of throwing (matches E1's
    // documentService); a stale template tag must not 500 the whole render.
    nullGetter: () => "",
  });
  doc.render(data);
  return doc.toBuffer();
}
