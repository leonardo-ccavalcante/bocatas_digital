import { z } from "zod";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { uuidLike } from "./_shared";
import { renderDocument, DocumentValidationError } from "../../services/documentService";
import { buildFamilyDataContext } from "../../services/documentContextBuilder";
import { fetchActiveFamiliesReadiness } from "../../services/informeBulkData";
import {
  INFORME_SKIP_REASON_LABEL,
  type InformeSkipReason,
} from "../../services/informeEligibility";

type Db = ReturnType<typeof createAdminClient>;

/**
 * Generate the Informe de Valoración Social for one family and PERSIST it:
 * render → upload to the private `family-documents` bucket (unique key per
 * version) → version via the atomic `upload_family_document` RPC under the
 * dedicated `informe_valoracion_social` tipo (no boolean-cache flip). Throws
 * DocumentValidationError when the family is not ready (missing datum / stale
 * seguimiento) — callers map that to a skip.
 */
async function generateAndPersist(
  db: Db,
  familyId: string,
  actorId: string,
): Promise<{ fileName: string; path: string }> {
  const context = await buildFamilyDataContext(db, familyId, { slug: "informe_social" });
  const rendered = await renderDocument("informe_social", context, { actorId, familyId });

  const path = `${familyId}/-1/informe_valoracion_social/${randomUUID()}.docx`;
  const { error: upErr } = await db.storage
    .from("family-documents")
    .upload(path, rendered.buffer, { contentType: rendered.mime, upsert: false });
  if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);

  // Version directly via service_role (bypasses RLS) rather than the
  // upload_family_document RPC, which is broken in the repo migration state
  // (service_role EXECUTE revoked, get_user_role guard, verified_by UUID vs Manus
  // int id — see docs/informes/informe-valoracion-social-HANDOFF.md, Finding #2).
  // Mark any current family-level informe_valoracion_social not-current, then insert
  // the new current row. The partial-unique index (family_id, documento_tipo) rejects
  // a concurrent double-insert, so a race fails loudly rather than duplicating.
  const { error: updErr } = await db
    .from("family_member_documents")
    .update({ is_current: false })
    .eq("family_id", familyId)
    .eq("documento_tipo", "informe_valoracion_social")
    .eq("member_index", -1)
    .eq("is_current", true)
    .is("deleted_at", null);
  if (updErr) throw new Error(updErr.message);

  const { error: insErr } = await db.from("family_member_documents").insert({
    family_id: familyId,
    member_index: -1,
    member_person_id: null,
    documento_tipo: "informe_valoracion_social",
    documento_url: path,
    fecha_upload: new Date().toISOString(),
    verified_by: null, // Manus id is not a valid auth.users UUID → store null
    is_current: true,
  });
  if (insErr) throw new Error(insErr.message);

  return { fileName: rendered.fileName, path };
}

export const documentsGenRouter = router({
  /** Ephemeral generate (download-only) — unchanged; used by nota_entrega/derivación. */
  generateDocument: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        slug: z.enum(["informe_social", "nota_entrega", "derivacion"] as const),
        session_id: uuidLike.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      let context: Awaited<ReturnType<typeof buildFamilyDataContext>>;
      try {
        context = await buildFamilyDataContext(db, input.family_id, {
          slug: input.slug,
          programSessionId: input.session_id,
        });
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: "NOT_FOUND", message: "Familia no encontrada" });
      }

      try {
        const result = await renderDocument(input.slug, context, {
          actorId: String(ctx.user.id),
          familyId: input.family_id,
        });
        return {
          bufferBase64: result.buffer.toString("base64"),
          fileName: result.fileName,
          mime: result.mime,
        };
      } catch (e) {
        if (e instanceof DocumentValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message, cause: e });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error inesperado al generar el documento",
        });
      }
    }),

  /** Generate + PERSIST the informe valoración social for one family. */
  generateSocialReport: adminProcedure
    .input(z.object({ family_id: uuidLike }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      try {
        return await generateAndPersist(db, input.family_id, String(ctx.user.id));
      } catch (e) {
        if (e instanceof DocumentValidationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message, cause: e });
        }
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al generar o guardar el informe",
        });
      }
    }),

  /** Dry-run: which active families are ready, which are skipped (with reason). */
  bulkPreviewSocialReports: adminProcedure.query(async () => {
    const db = createAdminClient();
    const rows = await fetchActiveFamiliesReadiness(db);
    const ready = rows
      .filter((r) => r.readiness.ready)
      .map((r) => ({ family_id: r.family_id, familia_numero: r.familia_numero }));
    const skipped = rows
      .filter(
        (r): r is typeof r & { readiness: { ready: false; reason: InformeSkipReason } } =>
          !r.readiness.ready,
      )
      .map((r) => ({
        familia_numero: r.familia_numero,
        reason: r.readiness.reason,
        label: INFORME_SKIP_REASON_LABEL[r.readiness.reason],
      }));
    return {
      ready,
      skipped,
      counts: { total: rows.length, ready: ready.length, skipped: skipped.length },
    };
  }),

  /**
   * Generate + persist a CHUNK (≤25) of ready families. Per-family try/catch so
   * one failure never aborts the batch; returns status rows only (never file
   * bytes). Client loops over the preview's ready list in chunks; regeneration
   * is idempotent (each call version-rolls the family's current informe row).
   */
  bulkGenerateChunk: adminProcedure
    .input(z.object({ family_ids: z.array(uuidLike).min(1).max(25) }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const actorId = String(ctx.user.id);
      const results: Array<{
        family_id: string;
        outcome: "generated" | "skipped" | "failed";
        reason?: string;
      }> = [];
      for (const fid of input.family_ids) {
        try {
          await generateAndPersist(db, fid, actorId);
          results.push({ family_id: fid, outcome: "generated" });
        } catch (e) {
          if (e instanceof DocumentValidationError) {
            // Validation messages are fixed Spanish strings — no PII.
            results.push({ family_id: fid, outcome: "skipped", reason: e.message });
          } else {
            // Never surface a raw error (may embed context) — generic + PII-safe.
            results.push({ family_id: fid, outcome: "failed", reason: "Error inesperado al generar" });
          }
        }
      }
      return { processed: results.length, results };
    }),
});
