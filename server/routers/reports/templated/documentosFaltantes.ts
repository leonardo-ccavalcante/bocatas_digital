/**
 * templated/documentosFaltantes.ts — Documentos requeridos no subidos.
 *
 * For each active program_document_types row (is_required=true, is_active=true,
 * scope=familia or miembro) within the given programaId, joins active families and
 * reports which families are missing at least one required document.
 *
 * Inputs: { programaId: UUID }
 * Output: { rows: { family_id, familia_numero, missing: string[] }[] }
 *
 * Compliance: adminProcedure. withSoftDeleteFilter. wrapDbError.
 * PII: No high-risk fields selected.
 *
 * Note: family_member_documents queries are chunked to ≤100 IDs per request to
 * avoid PostgREST's 16KB URL limit (causes TypeError: fetch failed / HeadersOverflowError)
 * when there are many families.
 */

import { z } from "zod";
import { router, adminProcedure } from "../../../_core/trpc";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import { withSoftDeleteFilter, wrapDbError } from "../_shared";

const CHUNK_SIZE = 100;

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const InputSchema = z.object({ programaId: uuidSchema });

export const documentosFaltantesRouter = router({
  documentosFaltantes: adminProcedure
    .input(InputSchema)
    .query(async ({ input }) => {
      const db = createAdminClient();

      // 1. Fetch required document types for this programa.
      const { data: docTypes, error: docTypesErr } = await db
        .from("program_document_types")
        .select("id, slug, nombre, scope")
        .eq("programa_id", input.programaId)
        .eq("is_required", true)
        .eq("is_active", true);

      if (docTypesErr) {
        throw wrapDbError("reports.documentosFaltantes.docTypes", docTypesErr);
      }

      if (!docTypes || docTypes.length === 0) {
        return { rows: [] };
      }

      const requiredSlugs = docTypes.map((d) => d.slug);

      // 2. Fetch active families (no PII — name + number only for display).
      const { data: families, error: familiesErr } = await withSoftDeleteFilter(
        db
          .from("families")
          .select("id, familia_numero")
          .eq("estado", "activa"),
      );

      if (familiesErr) {
        throw wrapDbError("reports.documentosFaltantes.families", familiesErr);
      }

      if (!families || families.length === 0) {
        return { rows: [] };
      }

      const familyIds = families.map((f) => f.id);

      // 3. Fetch uploaded current docs in chunks of CHUNK_SIZE to avoid PostgREST's
      //    16KB URL limit that triggers HeadersOverflowError with large .in() arrays.
      const chunks: string[][] = [];
      for (let i = 0; i < familyIds.length; i += CHUNK_SIZE) {
        chunks.push(familyIds.slice(i, i + CHUNK_SIZE));
      }

      const chunkResults = await Promise.all(
        chunks.map((chunk) =>
          withSoftDeleteFilter(
            db
              .from("family_member_documents")
              .select("family_id, documento_tipo")
              .in("family_id", chunk)
              .eq("is_current", true)
              .not("documento_url", "is", null),
          ),
        ),
      );

      const firstDocsErr = chunkResults.find((r) => r.error)?.error;
      if (firstDocsErr) {
        throw wrapDbError("reports.documentosFaltantes.docs", firstDocsErr);
      }

      // Build a set of (family_id, documento_tipo) pairs that have been uploaded.
      const uploadedSet = new Set(
        chunkResults.flatMap(({ data }) =>
          (data ?? []).map(
            (d: { family_id: string; documento_tipo: string }) =>
              `${d.family_id}:${d.documento_tipo}`,
          ),
        ),
      );

      // 4. For each family, determine which required doc types are missing.
      const rows: { family_id: string; familia_numero: number; missing: string[] }[] = [];

      for (const family of families) {
        const missing = requiredSlugs.filter(
          (slug) => !uploadedSet.has(`${family.id}:${slug}`),
        );
        if (missing.length > 0) {
          rows.push({ family_id: family.id, familia_numero: family.familia_numero, missing });
        }
      }

      rows.sort((a, b) => a.familia_numero - b.familia_numero);

      return { rows };
    }),
});
