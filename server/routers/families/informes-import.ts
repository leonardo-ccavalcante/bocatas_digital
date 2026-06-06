import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import {
  createAdminClient,
  createUserImpersonationClient,
} from "../../../client/src/lib/supabase/server";
import { parseInformesDocument } from "../../csvInformesParser";
import { matchInformesMembers, type ExistingMember } from "../../csvInformesMatch";
import {
  type InformesFamily,
  type InformesPreviewResponse,
  type InformesConfirmResponse,
  type InformesStashPayload,
  InformesConfirmResponseSchema,
} from "../../../shared/legacyFamiliasTypes";
import { uuidLike } from "./_shared";
import { safeFilename } from "./legacy-import";

const MAX_FILENAME_LENGTH = 255;
const PROBE_CHUNK_SIZE = 500;
// The bulk_import_previews row cap CHECK keys on `parsed_rows->'groups'`, which
// the INFORMES stash (`families[]`) doesn't have — so enforce the cap here.
const MAX_FAMILIES = 10_000;

export const informesImportRouter = router({
  /**
   * previewInformesImport — parse the wide INFORMES SOCIALES sheet, resolve each
   * family against the roster (families.legacy_numero), stash, return a summary.
   * Enrichment is backfill-only and never creates families: a family not found
   * in the roster is surfaced as `family_missing`.
   */
  previewInformesImport: adminProcedure
    .input(
      z.object({
        csv: z.string().min(1).max(10_000_000),
        src_filename: z.string().max(MAX_FILENAME_LENGTH).optional(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<InformesPreviewResponse> => {
      const parsed = parseInformesDocument(input.csv);
      if (!parsed.header_found) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Encabezado INFORMES no encontrado. Se requieren NUMERO FAMILIA BOCATAS, NOMBRE y DESCRIPCIÓN SITUACIÓN FAMILIAR.",
        });
      }
      const families = parsed.families;
      if (families.length === 0 && parsed.parse_errors.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El CSV no contiene filas de datos válidas.",
        });
      }
      if (families.length > MAX_FAMILIES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `El CSV tiene ${families.length} familias; el máximo por importación es ${MAX_FAMILIES}.`,
        });
      }

      // Resolve each family against the roster by legacy_numero (chunked .in()).
      const db = createAdminClient();
      const numeros = [...new Set(families.map((f) => f.legacy_numero_familia))];
      const existing = new Map<string, { id: string; titular_id: string | null }>();
      // Guard: PostgREST .in() with an empty array returns an error.
      for (let start = 0; numeros.length > 0 && start < numeros.length; start += PROBE_CHUNK_SIZE) {
        const chunk = numeros.slice(start, start + PROBE_CHUNK_SIZE);
        const { data, error } = await db
          .from("families")
          .select("id, titular_id, legacy_numero")
          .in("legacy_numero", chunk)
          .is("deleted_at", null);
        if (error) {
          ctx.logger.error("[informes-import] families probe failed", {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
            correlationId: ctx.correlationId,
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error consultando familias existentes.",
          });
        }
        for (const row of data ?? []) {
          if (row.legacy_numero !== null) {
            existing.set(row.legacy_numero, { id: row.id, titular_id: row.titular_id });
          }
        }
      }

      let families_to_enrich = 0;
      let family_missing = 0;
      let warning_families = 0;
      for (const f of families) {
        const hit = existing.get(f.legacy_numero_familia);
        if (hit) {
          f.family_id = hit.id;
          f.titular_id = hit.titular_id;
          families_to_enrich++;
        } else {
          family_missing++;
        }
        const hasWarning =
          f.warnings.length > 0 ||
          f.members_truncated ||
          f.titular.warnings.length > 0 ||
          f.members.some((m) => m.warnings.length > 0);
        if (hit && hasWarning) warning_families++;
      }

      // 2b — family-scoped member matching. Batch-fetch existing members for the
      // resolved families, then align each INFORMES member (refuse-on-ambiguity).
      const foundIds = families
        .map((f) => f.family_id)
        .filter((id): id is string => id !== null);
      const membersByFamily = new Map<string, ExistingMember[]>();
      // Guard: PostgREST .in() with an empty array returns an error. Skip the
      // loop entirely when no families were resolved against the roster.
      for (let start = 0; foundIds.length > 0 && start < foundIds.length; start += PROBE_CHUNK_SIZE) {
        const chunk = foundIds.slice(start, start + PROBE_CHUNK_SIZE);
        const { data, error } = await db
          .from("familia_miembros")
          .select("id, person_id, nombre, apellidos, fecha_nacimiento, documento, familia_id")
          .in("familia_id", chunk)
          .is("deleted_at", null);
        if (error) {
          ctx.logger.error("[informes-import] familia_miembros probe failed", {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
            correlationId: ctx.correlationId,
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Error consultando miembros existentes.",
          });
        }
        for (const row of data ?? []) {
          const arr = membersByFamily.get(row.familia_id) ?? [];
          arr.push({
            id: row.id,
            person_id: row.person_id,
            nombre: row.nombre,
            apellidos: row.apellidos,
            fecha_nacimiento: row.fecha_nacimiento,
            documento: row.documento,
          });
          membersByFamily.set(row.familia_id, arr);
        }
      }
      for (const f of families) {
        if (f.family_id) {
          f.member_matches = matchInformesMembers(
            f.members,
            membersByFamily.get(f.family_id) ?? []
          );
        }
      }

      const stash: InformesStashPayload = {
        kind: "informes_enrich_v1",
        families,
        src_filename: safeFilename(input.src_filename),
      };
      const { data: preview, error: insertErr } = await db
        .from("bulk_import_previews")
        .insert({
          parsed_rows: stash as unknown as never,
          created_by: String(ctx.user.id),
        })
        .select("token")
        .single();
      if (insertErr || !preview) {
        ctx.logger.error("[informes-import] preview stash failed", {
          code: insertErr?.code,
          correlationId: ctx.correlationId,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error guardando previsualización.",
        });
      }

      return {
        preview_token: (preview as { token: string }).token,
        total_rows: families.length,
        total_families: families.length,
        families_to_enrich,
        family_missing,
        warning_families,
        families: families as InformesFamily[],
        parse_errors: parsed.parse_errors,
      };
    }),

  /**
   * confirmInformesImport — call enrich_families_from_informes. Backfill-only;
   * per-family savepoints + audit handled inside the SECURITY DEFINER RPC.
   */
  confirmInformesImport: adminProcedure
    .input(
      z.object({
        preview_token: uuidLike,
        src_filename: z.string().max(MAX_FILENAME_LENGTH).optional(),
      })
    )
    .mutation(async ({ input, ctx }): Promise<InformesConfirmResponse> => {
      const adminDb = createAdminClient();
      const actorId = String(ctx.user.id);
      const safeName = safeFilename(input.src_filename);

      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: preview, error: fetchErr } = await adminDb
        .from("bulk_import_previews")
        .select("token, created_by, created_at")
        .eq("token", input.preview_token)
        .eq("created_by", actorId)
        .gte("created_at", thirtyMinAgo)
        .maybeSingle();
      if (fetchErr || !preview) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Previsualización expirada o no encontrada.",
        });
      }

      // Sign a short-lived user JWT so the RPC's get_user_role()/auth.uid()
      // resolve (sub must equal actorId — the RPC checks created_by ownership).
      const userDb = await createUserImpersonationClient(actorId, ctx.user.role);
      const { data: result, error: rpcErr } = await userDb.rpc(
        "enrich_families_from_informes",
        { p_token: input.preview_token, p_src_filename: safeName ?? undefined }
      );
      if (rpcErr) {
        await adminDb
          .from("bulk_import_previews")
          .delete()
          .eq("token", input.preview_token);
        ctx.logger.error("[informes-import] enrich RPC failed", {
          code: rpcErr.code,
          correlationId: ctx.correlationId,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al confirmar la importación de informes.",
        });
      }

      const validated = InformesConfirmResponseSchema.safeParse(result);
      if (!validated.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Respuesta del RPC con shape inválido.",
        });
      }
      return validated.data;
    }),
});
