import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, protectedProcedure, superadminProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";

const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID format");

// ─── Input Schemas ─────────────────────────────────────────────────────────

const FamilyMemberSchema = z.object({
  nombre: z.string().min(1).max(100),
  apellidos: z.string().min(1).max(100),
  parentesco: z.enum(["esposo_a", "hijo_a", "madre", "padre", "suegro_a", "hermano_a", "abuelo_a", "otro"]),
  fecha_nacimiento: z.string().optional(),
  documento: z.string().optional(),
  person_id: uuidLike.optional(),
});

const DeactivateFamilyInputSchema = z
  .object({
    id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    motivo_baja: z.enum([
      "no_recogida_consecutiva",
      "voluntaria",
      "fraude",
      "cambio_circunstancias",
      "otros",
    ]),
    fecha_baja: z.string(),
    otros_detalle: z.string().min(1).optional(),
  })
  .refine((data) => data.motivo_baja !== "otros" || Boolean(data.otros_detalle), {
    message: "Debe especificar el motivo",
    path: ["otros_detalle"],
  });

// ─── Families Router ────────────────────────────────────────────────────────

export const familiesRouter = router({
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
          // Search by titular name — use textSearch on persons join
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
  getById: adminProcedure
    .input(z.object({ id: uuidLike }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("families")
        .select(
          `*, persons!titular_id(id, nombre, apellidos, telefono, email, idioma_principal)`
        )
        .eq("id", input.id)
        .is("deleted_at", null)
        .single();
      if (error || !data)
        throw new TRPCError({ code: "NOT_FOUND", message: "Familia no encontrada" });
      return data;
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
        program_id: uuidLike,
        consent_bocatas: z.boolean().default(false),
        consent_banco_alimentos: z.boolean().default(false),
        docs_identidad: z.boolean().default(false),
        padron_recibido: z.boolean().default(false),
        justificante_recibido: z.boolean().default(false),
        informe_social: z.boolean().default(false),
        informe_social_fecha: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { data: family, error: familyError } = await db
        .from("families")
        .insert({
          titular_id: input.titular_id,
          miembros: input.miembros,
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
        })
        .select()
        .single();

      if (familyError) {
        if (familyError.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta persona ya es titular de una familia activa",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: familyError.message });
      }

      // Insert program enrollment
      await db.from("program_enrollments").insert({
        person_id: input.titular_id,
        program_id: input.program_id,
        estado: "activo",
      });

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
    .input(
      DeactivateFamilyInputSchema
    )
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

  // ─── Job 3: Delivery Recording ───────────────────────────────────────────
  /** GET deliveries for a family */
  getDeliveries: adminProcedure
    .input(z.object({ family_id: uuidLike }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("deliveries")
        .select("*")
        .eq("family_id", input.family_id)
        .is("deleted_at", null)
        .order("fecha_entrega", { ascending: false });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  /** POST delivery (firma_url already uploaded by client) */
  createDelivery: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        fecha_entrega: z.string(),
        kg_frutas_hortalizas: z.number().min(0),
        kg_carne: z.number().min(0),
        kg_infantil: z.number().min(0).default(0),
        kg_otros: z.number().min(0).default(0),
        recogido_por: z.string().min(1),
        es_autorizado: z.boolean().default(false),
        firma_url: z.string().optional(),
        recogido_por_documento_url: z.string().optional(),
        session_id: uuidLike.optional(),
        notas: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deliveryInsert: any = {
        family_id: input.family_id,
        fecha_entrega: input.fecha_entrega,
        kg_frutas_hortalizas: input.kg_frutas_hortalizas,
        kg_carne: input.kg_carne,
        kg_infantil: input.kg_infantil,
        kg_otros: input.kg_otros,
        recogido_por: input.recogido_por,
        es_autorizado: input.es_autorizado,
        firma_url: input.firma_url ?? null,
        recogido_por_documento_url: input.recogido_por_documento_url ?? null,
        session_id: input.session_id ?? null,
        notas: input.notas ?? null,
        registrado_por: ctx.user.id,
      };
      const { data, error } = await db.from("deliveries").insert(deliveryInsert).select().single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  // ─── Job 7: Volunteer Identity Verifier ─────────────────────────────────
  /** Search families for volunteer identity verification (field-level redaction) */
  verifyIdentity: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const queryNum = parseInt(input.query);

      let query = db
        .from("families")
        .select(
          `id, familia_numero, estado, persona_recoge, autorizado,
           autorizado_documento_url, num_adultos, num_menores_18,
           persons!titular_id(nombre, apellidos)`
        )
        .eq("estado", "activa")
        .is("deleted_at", null);

      if (!isNaN(queryNum)) {
        query = query.eq("familia_numero", queryNum);
      } else {
        query = query.ilike("persons.nombre", `%${input.query}%`);
      }

      const { data, error } = await query.limit(5);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!data?.length) return [];

      // Field-level redaction — high-risk PII NEVER exposed via this endpoint regardless of role
      return data.map((f) => {
        const persons = f.persons as { nombre: string; apellidos: string } | null;
        return {
          id: f.id,
          familia_numero: f.familia_numero,
          titular_nombre: persons
            ? `${persons.nombre} ${persons.apellidos}`.trim()
            : "",
          num_miembros: (f.num_adultos ?? 0) + (f.num_menores_18 ?? 0),
          persona_recoge: f.persona_recoge,
          autorizado: f.autorizado,
          autorizado_documento_url: f.autorizado_documento_url ?? null,
          // NOT included: situacion_legal, foto_documento_url, recorrido_migratorio
        };
      });
    }),

  // ─── Job 8: Per-member Pending Items ────────────────────────────────────
  /** GET pending consent + doc items per member (for Job 8 + Job 9 Layer B) */
  getPendingItems: adminProcedure
    .input(z.object({ family_id: uuidLike.optional() }))
    .query(async ({ input }) => {
      const db = createAdminClient();

      let familiesQuery = db
        .from("families")
        .select(
          "id, familia_numero, miembros, created_at, persons!titular_id(nombre, apellidos, telefono)"
        )
        .eq("estado", "activa")
        .is("deleted_at", null);

      if (input.family_id) {
        familiesQuery = familiesQuery.eq("id", input.family_id);
      }

      const { data: families } = await familiesQuery;
      if (!families?.length) return [];

      const { data: consents } = await db
        .from("consents")
        .select("person_id, purpose, granted, revoked_at")
        .eq("purpose", "tratamiento_datos_banco_alimentos")
        .is("revoked_at", null);

      const { data: memberDocs } = await db
        .from("family_member_documents")
        .select("family_id, member_index, documento_url")
        .is("deleted_at", null);

      const consentPersonIds = new Set(
        (consents ?? []).map((c: { person_id: string }) => c.person_id)
      );
      const docsByFamilyMember = new Map(
        (memberDocs ?? []).map((d: { family_id: string; member_index: number }) => [
          `${d.family_id}:${d.member_index}`,
          d,
        ])
      );

      const today = new Date();
      const result: {
        family_id: string;
        familia_numero: number;
        member_index: number;
        member_name: string;
        parentesco: string;
        person_id: string | null;
        missing: string[];
        days_pending: number;
      }[] = [];

      for (const family of families) {
        const miembros = (family.miembros as unknown[]) ?? [];
        const familyCreatedAt = new Date(family.created_at);
        const daysPending = Math.floor(
          (today.getTime() - familyCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        miembros.forEach((m, idx) => {
          const member = m as Record<string, unknown>;
          const dob = member.fecha_nacimiento as string | undefined;
          const age = dob
            ? Math.floor(
                (today.getTime() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000)
              )
            : 99;
          if (age < 14) return; // skip members under 14

          const missing: string[] = [];
          const personId = member.person_id as string | undefined;
          if (!personId || !consentPersonIds.has(personId)) missing.push("consent");
          if (!docsByFamilyMember.has(`${family.id}:${idx}`)) missing.push("doc");

          if (missing.length > 0) {
            result.push({
              family_id: family.id,
              familia_numero: family.familia_numero,
              member_index: idx,
              member_name: `${member.nombre ?? ""} ${member.apellidos ?? ""}`.trim(),
              parentesco: (member.parentesco as string) ?? "",
              person_id: personId ?? null,
              missing,
              days_pending: daysPending,
            });
          }
        });
      }
      return result;
    }),

  // ─── Job 9: Compliance Dashboard ────────────────────────────────────────
  /** GET compliance stats (CM-1 to CM-5) */
  getComplianceStats: adminProcedure.query(async () => {
    const db = createAdminClient();
    const today = new Date();

    const cutoff330 = new Date(today);
    cutoff330.setDate(cutoff330.getDate() - 330);
    const cutoff60 = new Date(today);
    cutoff60.setDate(cutoff60.getDate() - 60);
    const cutoff30 = new Date(today);
    cutoff30.setDate(cutoff30.getDate() - 30);

    // CM-1: active families missing BdeA consent
    const { count: cm1 } = await db
      .from("families")
      .select("*", { count: "exact", head: true })
      .eq("estado", "activa")
      .is("deleted_at", null)
      .eq("consent_banco_alimentos", false);

    // CM-2: informes sociales >330d old
    const { count: cm2 } = await db
      .from("families")
      .select("*", { count: "exact", head: true })
      .eq("estado", "activa")
      .is("deleted_at", null)
      .eq("informe_social", true)
      .lt("informe_social_fecha", cutoff330.toISOString().split("T")[0]);

    // CM-3: GUF stale >30d or not registered
    const { count: cm3 } = await db
      .from("families")
      .select("*", { count: "exact", head: true })
      .eq("estado", "activa")
      .is("deleted_at", null)
      .or(`alta_en_guf.eq.false,guf_verified_at.lt.${cutoff30.toISOString()}`);

    // CM-4: open sessions (no closed_at, fecha < today)
    const { count: cm4 } = await db
      .from("program_sessions")
      .select("*", { count: "exact", head: true })
      .is("closed_at", null)
      .lt("fecha", today.toISOString().split("T")[0]);

    // CM-5: no delivery in 60+ days
    const { data: allActiveFamilies } = await db
      .from("families")
      .select("id, familia_numero, persons!titular_id(nombre, apellidos, telefono)")
      .eq("estado", "activa")
      .is("deleted_at", null);

    const { data: recentDeliveries } = await db
      .from("deliveries")
      .select("family_id")
      .gte("fecha_entrega", cutoff60.toISOString().split("T")[0]);

    const recentFamilyIds = new Set(
      (recentDeliveries ?? []).map((d: { family_id: string }) => d.family_id)
    );
    const cm5List = (allActiveFamilies ?? []).filter(
      (f: { id: string }) => !recentFamilyIds.has(f.id)
    );

    return {
      cm1: cm1 ?? 0,
      cm2: cm2 ?? 0,
      cm3: cm3 ?? 0,
      cm4: cm4 ?? 0,
      cm5: cm5List.length,
      cm5List,
    };
  }),

  // ─── Job 10: Session Close ───────────────────────────────────────────────
  /** POST close a program session */
  closeSession: adminProcedure
    .input(
      z.object({
        program_id: uuidLike,
        fecha: z.string(),
        location_id: uuidLike.optional(),
        session_data: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionInsert: any = {
        program_id: input.program_id,
        fecha: input.fecha,
        location_id: input.location_id ?? null,
        opened_by: ctx.user.id,
        closed_by: ctx.user.id,
        session_data: input.session_data,
        closed_at: new Date().toISOString(),
      };
      const { data, error } = await db.from("program_sessions").insert(sessionInsert).select().single();

      if (error) {
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Ya existe una sesión cerrada para este programa hoy en esta sede",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return data;
    }),

  /** GET open session for a program today */
  getOpenSession: adminProcedure
    .input(
      z.object({
        program_id: uuidLike,
        fecha: z.string().optional(),
        location_id: uuidLike.optional(),
      })
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      const fecha = input.fecha ?? new Date().toISOString().split("T")[0];
      const { data } = await db
        .from("program_sessions")
        .select("*")
        .eq("program_id", input.program_id)
        .eq("fecha", fecha)
        .is("closed_at", null)
        .maybeSingle();
      return data ?? null;
    }),

  // ─── Job 2: Batch Informes Sociales ─────────────────────────────────────
  /** GET families for batch informe social view */
  getInformesSociales: adminProcedure
    .input(
      z
        .object({
          filter: z.enum(["all", "pendientes", "por_renovar", "al_dia"]).default("all"),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      const today = new Date();
      const cutoff330 = new Date(today);
      cutoff330.setDate(cutoff330.getDate() - 330);
      const cutoff300 = new Date(today);
      cutoff300.setDate(cutoff300.getDate() - 300);

      let query = db
        .from("families")
        .select(
          `id, familia_numero, informe_social, informe_social_fecha,
           persons!titular_id(nombre, apellidos, telefono)`
        )
        .eq("estado", "activa")
        .is("deleted_at", null);

      const filter = input?.filter ?? "all";
      if (filter === "pendientes") {
        query = query.eq("informe_social", false);
      } else if (filter === "por_renovar") {
        query = query
          .eq("informe_social", true)
          .lt("informe_social_fecha", cutoff300.toISOString().split("T")[0]);
      } else if (filter === "al_dia") {
        query = query
          .eq("informe_social", true)
          .gte("informe_social_fecha", cutoff300.toISOString().split("T")[0]);
      }

      const { data, error } = await query.order("familia_numero");
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  // ─── Job 8: Member Document Write ────────────────────────────────────────
  /** POST member document (identity doc for member ≥14) */
  createMemberDocument: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        member_index: z.number().int().min(0),
        member_person_id: uuidLike.optional(),
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

  // ─── Member Management (familia_miembros) ──────────────────────────────────

  /** GET all members for a family */
  getMembers: adminProcedure
    .input(z.object({ familiaId: uuidLike }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("familia_miembros")
        .select("*")
        .eq("familia_id", input.familiaId)
        .order("created_at", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data ?? [];
    }),

  /** ADD a new member to family */
  addMember: adminProcedure
    .input(
      z.object({
        familiaId: uuidLike,
        nombre: z.string().min(1).max(100),
        rol: z.enum(["head_of_household", "dependent", "other"]),
        relacion: z.enum(["parent", "child", "sibling", "other"]).optional(),
        estado: z.enum(["activo", "inactivo"]).default("activo"),
        fechaNacimiento: z.string().date().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("familia_miembros")
        .insert({
          familia_id: input.familiaId,
          nombre: input.nombre,
          rol: input.rol,
          relacion: input.relacion ?? null,
          estado: input.estado,
          fecha_nacimiento: input.fechaNacimiento ?? null,
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  /** UPDATE a family member */
  updateMember: adminProcedure
    .input(
      z.object({
        id: uuidLike,
        nombre: z.string().min(1).max(100).optional(),
        rol: z.enum(["head_of_household", "dependent", "other"]).optional(),
        relacion: z.enum(["parent", "child", "sibling", "other"]).optional(),
        estado: z.enum(["activo", "inactivo"]).optional(),
        fechaNacimiento: z.string().date().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const updateData: any = {};
      if (input.nombre !== undefined) updateData.nombre = input.nombre;
      if (input.rol !== undefined) updateData.rol = input.rol;
      if (input.relacion !== undefined) updateData.relacion = input.relacion;
      if (input.estado !== undefined) updateData.estado = input.estado;
      if (input.fechaNacimiento !== undefined) updateData.fecha_nacimiento = input.fechaNacimiento;
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await db
        .from("familia_miembros")
        .update(updateData)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  /** DELETE a family member */
  deleteMember: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { error } = await db.from("familia_miembros").delete().eq("id", input.id);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),
});
