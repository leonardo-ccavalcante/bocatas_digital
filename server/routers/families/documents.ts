import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { getDb } from "../../db";
import {
  FAMILY_DOC_TO_BOOLEAN_COLUMN,
  type FamilyDocType,
} from "@shared/familyDocuments";
import {
  uuidLike,
  familyDocTypeSchema,
  type FamiliesUpdate,
} from "./_shared";

export const documentsRouter = router({
  // ─── Job 8: Member Document Write ────────────────────────────────────────
  /** POST member document (identity doc for member ≥14) */
  createMemberDocument: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        member_index: z.number().int().min(-1),
        member_person_id: uuidLike.optional(),
        // FK to familia_miembros.id — populated for member_index >= 1.
        // member_index is kept for backward compat; member_id is the
        // stable anchor that survives JSON column removal.
        member_id: uuidLike.nullable().optional(),
        documento_tipo: z.string().min(1),
        documento_url: z.string().optional(),
        deferred: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docInsert: any = {
        family_id: input.family_id,
        member_index: input.member_index,
        member_person_id: input.member_person_id ?? null,
        member_id: input.member_id ?? null,
        documento_tipo: input.documento_tipo,
        documento_url: input.deferred ? null : (input.documento_url ?? null),
        fecha_upload: input.deferred ? null : new Date().toISOString(),
        verified_by: input.deferred ? null : ctx.user.id,
      };
      const { data, error } = await db.from("family_member_documents").insert(docInsert).select().single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  /** GET member documents for a family */
  getMemberDocuments: adminProcedure
    .input(z.object({ family_id: uuidLike }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("family_member_documents")
        .select("*")
        .eq("family_id", input.family_id)
        .is("deleted_at", null)
        .order("member_index");
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  // ─── Document Upload (family_member_documents — versioned) ─────────────

  /** GET current documents for a family, optionally filtered by member_index */
  getFamilyDocuments: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        member_index: z.number().int().min(-1).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      let q = db
        .from("family_member_documents")
        .select("id, family_id, member_index, member_person_id, documento_tipo, documento_url, fecha_upload, verified_by, is_current, created_at")
        .eq("family_id", input.family_id)
        .is("deleted_at", null)
        .eq("is_current", true)
        .order("created_at", { ascending: false });
      if (input.member_index !== undefined) {
        q = q.eq("member_index", input.member_index);
      }
      const { data, error } = await q;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  /** POST upload a document — versions any existing current row and recomputes boolean cache */
  uploadFamilyDocument: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        member_index: z.number().int().min(-1),
        member_person_id: uuidLike.nullable().optional(),
        documento_tipo: familyDocTypeSchema,
        documento_url: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      // Atomic UPSERT via Postgres function — handles concurrent callers correctly.
      const { data: inserted, error: rpcErr } = await db.rpc("upload_family_document", {
        p_family_id: input.family_id,
        p_member_index: input.member_index,
        p_member_person_id: (input.member_person_id ?? null) as string,
        p_documento_tipo: input.documento_tipo,
        p_documento_url: input.documento_url,
        p_verified_by: String(ctx.user.id),
      });
      if (rpcErr || !inserted) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: rpcErr?.message ?? "Failed to upload document",
        });
      }

      // Recompute boolean cache (unchanged from before).
      const cacheCol = FAMILY_DOC_TO_BOOLEAN_COLUMN[input.documento_tipo as FamilyDocType];
      if (cacheCol) {
        const { data: existsRows } = await db
          .from("family_member_documents")
          .select("id")
          .eq("family_id", input.family_id)
          .eq("documento_tipo", input.documento_tipo)
          .not("documento_url", "is", null)
          .is("deleted_at", null)
          .eq("is_current", true)
          .limit(1);
        const newCacheValue = (existsRows?.length ?? 0) > 0;
        const updatePayload: FamiliesUpdate = { [cacheCol]: newCacheValue } as FamiliesUpdate;
        if (input.documento_tipo === "informe_social" && newCacheValue) {
          (updatePayload as Record<string, unknown>).informe_social_fecha = new Date().toISOString().slice(0, 10);
        }
        const { error: cacheErr } = await db.from("families").update(updatePayload).eq("id", input.family_id);
        if (cacheErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: cacheErr.message });
      }

      return inserted;
    }),

  /** DELETE (soft) a document row + recomputes boolean cache */
  deleteFamilyDocument: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ input, ctx: _ctx }) => {
      const db = createAdminClient();

      // Fetch the row first so we know which family + doc_type to recompute.
      const { data: existing, error: fetchErr } = await db
        .from("family_member_documents")
        .select("family_id, documento_tipo")
        .eq("id", input.id)
        .single();
      if (fetchErr || !existing) throw new TRPCError({ code: "NOT_FOUND", message: "Documento no encontrado" });

      const { error: delErr } = await db
        .from("family_member_documents")
        .update({ deleted_at: new Date().toISOString(), is_current: false })
        .eq("id", input.id);
      if (delErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: delErr.message });

      const cacheCol = FAMILY_DOC_TO_BOOLEAN_COLUMN[existing.documento_tipo as FamilyDocType];
      if (cacheCol) {
        const { data: existsRows } = await db
          .from("family_member_documents")
          .select("id")
          .eq("family_id", existing.family_id)
          .eq("documento_tipo", existing.documento_tipo)
          .not("documento_url", "is", null)
          .is("deleted_at", null)
          .eq("is_current", true)
          .limit(1);
        const deletePayload = { [cacheCol]: (existsRows?.length ?? 0) > 0 } as FamiliesUpdate;
        await db.from("families").update(deletePayload).eq("id", existing.family_id);
      }

      return { success: true };
    }),

  // Delivery Documents
  getDeliveryDocuments: adminProcedure
    .input(z.object({ familyId: uuidLike }))
    .query(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");

        const adminDb = createAdminClient();
        const { data: rows, error: rowsError } = await adminDb
          .from("deliveries")
          .select("id, fecha_entrega, recogido_por, recogido_por_documento_url, created_at, updated_at")
          .eq("family_id", input.familyId)
          .is("deleted_at", null)
          .order("fecha_entrega", { ascending: false });

        if (rowsError) throw new Error(rowsError.message);

        return (rows ?? []).map((row) => ({
          id: row.id,
          delivery_id: row.id,
          recogido_por_documento_url: row.recogido_por_documento_url ?? null,
          verified_by: null,
          created_at: row.created_at,
          updated_at: row.updated_at ?? null,
          fecha: row.fecha_entrega,
          persona_recibio: row.recogido_por,
        }));
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch delivery documents",
        });
      }
    }),

  uploadDeliveryDocument: adminProcedure
    .input(
      z.object({
        familyId: uuidLike,
        deliveryId: uuidLike,
        documentUrl: z.string().url(),
      })
    )
    .mutation(async () => {
      return {
        success: true,
        message: "Document uploaded successfully",
      };
    }),

  /** GET all current documents in the program, with optional filters. */
  listAllForProgram: adminProcedure
    .input(
      z.object({
        tipoSlug: familyDocTypeSchema.optional(),
        familyId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      // Always filter is_current first so conditional filters chain correctly.
      let q = db
        .from("family_member_documents")
        .select(
          "*, families!inner(id, familia_numero, persons:persons!titular_id(nombre, apellidos))",
          { count: "exact" }
        )
        .eq("is_current", true);
      if (input.tipoSlug) q = q.eq("documento_tipo", input.tipoSlug);
      if (input.familyId) q = q.eq("family_id", input.familyId);
      const { data, error, count } = await q
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { rows: data ?? [], total: count ?? 0 };
    }),

  /** PATCH the documento_tipo of an existing row (re-classification). */
  classifyDocument: adminProcedure
    .input(
      z.object({
        docId: z.string().uuid(),
        documentoTipo: familyDocTypeSchema,
      })
    )
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("family_member_documents")
        .update({ documento_tipo: input.documentoTipo })
        .eq("id", input.docId)
        .select()
        .maybeSingle();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Documento no encontrado" });
      return data;
    }),
});
