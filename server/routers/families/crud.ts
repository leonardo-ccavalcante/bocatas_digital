import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  adminProcedure,
  superadminProcedure,
  voluntarioProcedure,
} from "../../_core/trpc";
import { redactHighRiskFields } from "../../_core/rlsRedaction";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { logProcedureAction } from "../../_core/logging-middleware";
import { isMemberAdult } from "../../families-doc-helpers";
import {
  uuidLike,
  programIdSchema,
  FamilyMemberSchema,
  DeactivateFamilyInputSchema,
  resolveMemberPersonId,
  ensureFamiliaEnrollment,
  mirrorMembersToTable,
  insertFamilyRow,
} from "./_shared";

export const crudRouter = router({
  // ─── Job 1: Family List ──────────────────────────────────────────────────
  /** GET /families list with filters */
  getAll: adminProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          estado: z.enum(["activa", "baja", "all"]).default("activa"),
          sin_alta_guf: z.boolean().optional(),
          sin_informe_social: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      let query = db
        .from("families")
        .select(
          `id, familia_numero, estado, num_adultos, num_menores_18,
           persona_recoge, autorizado, alta_en_guf, fecha_alta_guf,
           informe_social, informe_social_fecha, guf_cutoff_day, guf_verified_at,
           created_at, deleted_at,
           persons!titular_id(id, nombre, apellidos, telefono)`
        )
        .is("deleted_at", null);

      if (input?.estado !== "all") {
        query = query.eq("estado", input?.estado ?? "activa");
      }
      if (input?.sin_alta_guf) {
        query = query.eq("alta_en_guf", false);
      }
      if (input?.sin_informe_social) {
        query = query.eq("informe_social", false);
      }
      if (input?.search) {
        const searchNum = parseInt(input.search);
        if (!isNaN(searchNum)) {
          query = query.eq("familia_numero", searchNum);
        } else {
          query = query.or(
            `persons.nombre.ilike.%${input.search}%,persons.apellidos.ilike.%${input.search}%`
          );
        }
      }

      const { data, error } = await query.order("familia_numero", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  // ─── Job 1: Family Detail ────────────────────────────────────────────────
  /** GET /families/:id */
  getById: voluntarioProcedure
    .input(z.object({ id: uuidLike }))
    .query(async ({ input, ctx }) => {
      const db = createAdminClient();

      const { data: family, error } = await db
        .from("families")
        .select(
          `*, persons!titular_id(id, nombre, apellidos, telefono, email, idioma_principal)`
        )
        .eq("id", input.id)
        .is("deleted_at", null)
        .single();

      if (error || !family) {
        ctx.logger.error("Family not found", { familiaId: input.id, error });
        throw new TRPCError({ code: "NOT_FOUND", message: "Familia no encontrada" });
      }

      const { data: miembros = [], error: miembrosError } = await db
        .from("familia_miembros")
        .select("*")
        .eq("familia_id", input.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (miembrosError) {
        ctx.logger.warn("Failed to fetch members", { familiaId: input.id, error: miembrosError });
      }

      // Apply defense-in-depth PII redaction for non-admin callers (voluntarios).
      // RLS is the primary guard; this is the application-layer guarantee.
      const redactedFamily = redactHighRiskFields(ctx.user.role, family as Record<string, unknown>) as typeof family;

      return {
        ...redactedFamily,
        miembros: miembros || [],
      };
    }),

  // ─── Job 1: Create Family (intake submit) ───────────────────────────────
  /** POST /families — create family + enrollment */
  create: adminProcedure
    .input(
      z.object({
        titular_id: uuidLike,
        miembros: z.array(FamilyMemberSchema).default([]),
        num_adultos: z.number().int().min(1),
        num_menores_18: z.number().int().min(0),
        persona_recoge: z.string().min(1),
        autorizado: z.boolean().default(false),
        program_id: programIdSchema,
        consent_bocatas: z.boolean().default(false),
        consent_banco_alimentos: z.boolean().default(false),
        docs_identidad: z.boolean().default(false),
        padron_recibido: z.boolean().default(false),
        justificante_recibido: z.boolean().default(false),
        informe_social: z.boolean().default(false),
        informe_social_fecha: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = createAdminClient();
      const startTime = Date.now();
      const family = await insertFamilyRow(
        db,
        ctx,
        {
          titular_id: input.titular_id,
          // miembros JSON column was dropped (migration 20260505000005);
          // members live in familia_miembros — written by mirrorMembersToTable below.
          num_adultos: input.num_adultos,
          num_menores_18: input.num_menores_18,
          persona_recoge: input.persona_recoge,
          autorizado: input.autorizado,
          estado: "activa",
          consent_bocatas: input.consent_bocatas,
          consent_banco_alimentos: input.consent_banco_alimentos,
          docs_identidad: input.docs_identidad,
          padron_recibido: input.padron_recibido,
          justificante_recibido: input.justificante_recibido,
          informe_social: input.informe_social,
          informe_social_fecha: input.informe_social_fecha ?? null,
        },
        { titularId: input.titular_id, numMiembros: input.miembros.length }
      );

      const duration = Date.now() - startTime;
      logProcedureAction(ctx, "Family created successfully", {
        familyId: family.id,
        titularId: input.titular_id,
        numMiembros: input.miembros.length,
        numAdultos: input.num_adultos,
        numMenores: input.num_menores_18,
        duration,
      });

      // Enroll the titular (member_index 0 by convention).
      await ensureFamiliaEnrollment(db, input.titular_id, input.program_id, family.id, 0);

      // Enroll every adult member (≥14 or unknown DOB — treat unknown as adult to be safe).
      const today = new Date();
      const resolvedMiembros = [...input.miembros];

      for (let i = 0; i < input.miembros.length; i++) {
        const member = input.miembros[i];
        if (!isMemberAdult(member, today)) continue;

        const personId = await resolveMemberPersonId(db, member);
        await ensureFamiliaEnrollment(db, personId, input.program_id, family.id, i + 1);

        if (personId !== member.person_id) {
          resolvedMiembros[i] = { ...member, person_id: personId };
        }
      }

      // Mirror to familia_miembros — now the canonical store for member rows.
      await mirrorMembersToTable(db, ctx, family.id, resolvedMiembros);

      return family;
    }),

  // ─── Job 4: Update docs checklist ────────────────────────────────────────
  /** PATCH one doc field */
  updateDocField: adminProcedure
    .input(
      z.object({
        id: uuidLike,
        field: z.enum([
          "consent_bocatas",
          "consent_banco_alimentos",
          "docs_identidad",
          "padron_recibido",
          "justificante_recibido",
          "informe_social",
        ]),
        value: z.boolean(),
        informe_social_fecha: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = { [input.field]: input.value };
      if (input.field === "informe_social" && input.informe_social_fecha) {
        updateData.informe_social_fecha = input.informe_social_fecha;
      }
      const { error } = await db.from("families").update(updateData).eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // ─── Job 5: GUF panel ────────────────────────────────────────────────────
  /** PATCH GUF status */
  updateGuf: adminProcedure
    .input(
      z.object({
        id: uuidLike,
        alta_en_guf: z.boolean(),
        fecha_alta_guf: z.string().optional(),
        guf_cutoff_day: z.number().int().min(1).max(31).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { error } = await db.from("families").update({
        alta_en_guf: input.alta_en_guf,
        guf_verified_at: new Date().toISOString(),
        ...(input.fecha_alta_guf ? { fecha_alta_guf: input.fecha_alta_guf } : {}),
        ...(input.guf_cutoff_day !== undefined ? { guf_cutoff_day: input.guf_cutoff_day } : {}),
      }).eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  /** GET GUF system default cutoff day from app_settings */
  getGufSystemDefault: adminProcedure.query(async () => {
    const db = createAdminClient();
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "guf_default_cutoff_day")
      .single();
    return { cutoff_day: data ? parseInt(data.value) : 20 };
  }),

  /** PATCH GUF system default cutoff day (superadmin only) */
  updateGufSystemDefault: superadminProcedure
    .input(z.object({ cutoff_day: z.number().int().min(1).max(31) }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { error } = await db
        .from("app_settings")
        .update({ value: String(input.cutoff_day), updated_at: new Date().toISOString() })
        .eq("key", "guf_default_cutoff_day");
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // ─── Job 6: Deactivation + Reactivation ─────────────────────────────────
  /** PATCH deactivate family */
  deactivate: adminProcedure
    .input(DeactivateFamilyInputSchema)
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { error } = await db
        .from("families")
        .update({
          estado: "baja",
          fecha_baja: input.fecha_baja,
          motivo_baja: input.motivo_baja,
        })
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  /** PATCH reactivate family (preserves baja_history in metadata) */
  reactivate: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { data: current, error: fetchError } = await db
        .from("families")
        .select("motivo_baja, fecha_baja, metadata")
        .eq("id", input.id)
        .single();
      if (fetchError) throw new TRPCError({ code: "NOT_FOUND" });

      const meta = (current.metadata as Record<string, unknown>) ?? {};
      const bajaHistory = [
        ...((meta.baja_history as unknown[]) ?? []),
        {
          motivo: current.motivo_baja,
          fecha: current.fecha_baja,
          reactivated_at: new Date().toISOString(),
        },
      ];

      const { error } = await db
        .from("families")
        .update({
          estado: "activa",
          fecha_baja: null,
          motivo_baja: null,
          metadata: JSON.parse(JSON.stringify({ ...meta, baja_history: bajaHistory })),
        })
        .eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),
});
