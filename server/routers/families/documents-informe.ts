// documents-informe — procedimientos del INFORME SOCIAL dentro del router de
// documentos de familia: vista previa en PDF (conversion con LibreOffice) y
// verificacion de que lo subido es realmente un PDF.
//
// Viven fuera de documents.ts por el tope de 300 lineas por fichero; se montan
// con spread en documentsRouter, asi que la superficie tRPC no cambia.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import {
  FAMILY_DOC_TO_BOOLEAN_COLUMN,
  type FamilyDocType,
} from "@shared/familyDocuments";
import { uuidLike, type FamiliesUpdate } from "./_shared";
import { convertDocxToPdf, LibreOfficeUnavailableError } from "../../services/docxToPdf";
import { esPdfPorContenido, soloAdmitePdf } from "@shared/documentFormat";

type Db = ReturnType<typeof createAdminClient>;

/**
 * Recalcula la columna booleana de `families` que espeja este tipo de documento.
 * Extraído porque la baja y la verificación de PDF necesitan exactamente lo mismo.
 */
export async function recomputeBooleanCache(
  db: Db,
  familyId: string,
  documentoTipo: string,
): Promise<void> {
  const cacheCol = FAMILY_DOC_TO_BOOLEAN_COLUMN[documentoTipo as FamilyDocType];
  if (!cacheCol) return;
  const { data: existsRows } = await db
    .from("family_member_documents")
    .select("id")
    .eq("family_id", familyId)
    .eq("documento_tipo", documentoTipo)
    .not("documento_url", "is", null)
    .is("deleted_at", null)
    .eq("is_current", true)
    .limit(1);
  const payload = { [cacheCol]: (existsRows?.length ?? 0) > 0 } as FamiliesUpdate;
  await db.from("families").update(payload).eq("id", familyId);
}

export const informeDocumentProcedures = {
  /**
   * Faithful on-screen preview: downloads the generated .docx from the private
   * bucket and returns it converted to PDF (base64). Pure-JS docx renderers drop
   * the running header (membrete) and floating signature; a server-side
   * LibreOffice conversion is pixel-faithful and the browser renders PDF
   * natively. adminProcedure-gated — this carries Art.9 special-category data;
   * the base64 travels only over the authenticated tRPC channel, never persisted.
   * If LibreOffice is absent on the host, throws PRECONDITION_FAILED so the
   * client falls back to the .docx download.
   */
  getSocialReportPdf: adminProcedure
    .input(z.object({ path: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db.storage
        .from("family-documents")
        .download(input.path);
      if (error || !data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No se pudo abrir el documento",
        });
      }
      const docxBuffer = Buffer.from(await data.arrayBuffer());
      try {
        const pdf = await convertDocxToPdf(docxBuffer);
        return { pdfBase64: pdf.toString("base64") };
      } catch (e) {
        if (e instanceof LibreOfficeUnavailableError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "La vista previa en PDF no está disponible en este servidor",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudo generar la vista previa en PDF",
        });
      }
    }),

  /**
   * Comprueba que el documento recién subido es REALMENTE un PDF, leyendo su
   * cabecera del bucket privado con el cliente service-role.
   *
   * La subida va del navegador directo a Storage, así que el servidor nunca ve
   * los bytes en `uploadFamilyDocument`: solo recibe la RUTA. Esta es la única
   * barrera que no se salta renombrando el archivo (FAMILIAS-4). Si no es un
   * PDF, borra el objeto y da de baja la fila — ni PII huérfana en el bucket, ni
   * un «informe social» que no sirve como documento legal.
   */
  verifyUploadedPdf: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { data: row, error } = await db
        .from("family_member_documents")
        .select("id, family_id, documento_tipo, documento_url")
        .eq("id", input.id)
        .single();
      if (error || !row?.documento_url) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento no encontrado" });
      }
      if (!soloAdmitePdf(row.documento_tipo)) return { ok: true };

      const { data: blob, error: dlErr } = await db.storage
        .from("family-documents")
        .download(row.documento_url);
      if (dlErr || !blob) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudo comprobar el archivo subido",
        });
      }
      // Solo la cabecera: no se cargan en memoria los MB del documento entero.
      const cabecera = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
      if (esPdfPorContenido(cabecera)) return { ok: true };

      await db.storage.from("family-documents").remove([row.documento_url]);
      await db
        .from("family_member_documents")
        .update({ deleted_at: new Date().toISOString(), is_current: false })
        .eq("id", input.id);
      await recomputeBooleanCache(db, row.family_id, row.documento_tipo);
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "El archivo no es un PDF. El informe social debe subirse en PDF.",
      });
    }),
};
