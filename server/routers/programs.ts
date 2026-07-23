import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, voluntarioProcedure, adminProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import type { Database } from "../../client/src/lib/database.types";
import {
  ESTADOS_CATALOGO,
  ESTADOS_INSCRIPCION,
  TIPOS_PROGRAMA,
  estadoInicial,
} from "../../shared/programEstados";
import {
  applyEstadoChange,
  assertParentDepthOk,
  logEnrollmentEvent,
} from "./programs.enrollmentEstado";
import { getListadoMensual } from "./programs.listado";

type ProgramInsert = Database["public"]["Tables"]["programs"]["Insert"];
type ProgramUpdate = Database["public"]["Tables"]["programs"]["Update"];
const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID format");

// Digits are required: editions carry a year (e.g. "cocina_enero_2026",
// "esp_2025_09"), which is the whole point of the program tree (ADR-0013).
const slugSchema = z.string().regex(
  /^[a-z0-9_]+$/,
  "El identificador solo puede contener minúsculas, números y guiones bajos"
);

const ProgramInputSchema = z.object({
  slug: slugSchema,
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).default("🏠"),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  display_order: z.number().int().min(1).max(99).default(99),
  volunteer_can_access: z.boolean().default(true),
  volunteer_can_write: z.boolean().default(true),
  volunteer_visible_fields: z.array(z.string()).default([]),
  requires_consents: z.array(z.string()).default([]),
  fecha_inicio: z.string().nullable().optional(),
  fecha_fin: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  responsable_id: uuidLike.nullable().optional(),
  // Tree fields (ADR-0013)
  parent_id: uuidLike.nullable().optional(),
  tipo: z.enum(TIPOS_PROGRAMA).default("basico"),
  inscribible: z.boolean().default(true),
  estados_habilitados: z
    .array(z.string())
    .default(["activo", "pausado", "baja", "terminado"])
    .refine((vals) => vals.every((v) => (ESTADOS_CATALOGO as readonly string[]).includes(v)), {
      message: "Estado fuera del catálogo global",
    }),
  plazas: z.number().int().min(1).nullable().optional(),
  etiquetas: z.array(z.string().regex(/^[a-z_]+$/)).default([]),
});

const EnrollmentInputSchema = z.object({
  personId: uuidLike,
  programId: uuidLike,
  notas: z.string().max(500).optional(),
});

/** Validates shape of get_programs_with_counts RPC response.
 * The RPC returns `name` (not `nombre`) — the DB column was never renamed.
 * This schema must match the RPC output exactly.
 */
const ProgramWithCountsSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  display_order: z.number(),
  is_active: z.boolean(),
  requires_fields: z.unknown().optional(),
  volunteer_can_access: z.boolean(),
  requires_consents: z.unknown().optional(),
  fecha_inicio: z.string().nullable().optional(),
  fecha_fin: z.string().nullable().optional(),
  config: z.unknown().optional(),
  responsable_id: z.string().nullable().optional(),
  active_enrollments: z.number().nullable().transform(v => v ?? 0),
  total_enrollments: z.number().nullable().transform(v => v ?? 0),
  new_this_month: z.number().nullable().transform(v => v ?? 0),
  // Tree columns (appended by 20260723100003; optional so an older RPC shape
  // still parses during rollout)
  parent_id: z.string().nullable().optional(),
  tipo: z.string().optional(),
  inscribible: z.boolean().optional(),
  estados_habilitados: z.array(z.string()).optional(),
  plazas: z.number().nullable().optional(),
  etiquetas: z.array(z.string()).optional(),
  children_count: z.number().nullable().optional(),
  subtree_active_persons: z.number().nullable().optional(),
  subtree_total_persons: z.number().nullable().optional(),
}).passthrough();

export const programsRouter = router({
  // ─── Job 1: Programs Catalog ─────────────────────────────────────────────

  /** Returns active programs. Voluntarios only see volunteer_can_access=true */
  getAll: voluntarioProcedure.query(async ({ ctx }) => {
    const supabase = createAdminClient();
    const role = ctx.user.role;

    let query = supabase
      .from("programs")
      .select("id, slug, name, description, icon, is_default, is_active, display_order, volunteer_can_access, requires_consents, fecha_inicio, fecha_fin, config, parent_id, tipo, inscribible, estados_habilitados, plazas, etiquetas")
      .eq("is_active", true)
      .order("display_order");

    // Voluntarios (non-elevated) only see programs flagged volunteer_can_access.
    // Admin/superadmin see every active program.
    if (role !== "admin" && role !== "superadmin") {
      query = query.eq("volunteer_can_access", true);
    }

    const { data, error } = await query;
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return data ?? [];
  }),

  /** Returns all programs with enrollment counts (admin+) */
  getAllWithCounts: adminProcedure.query(async () => {
    const supabase = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("get_programs_with_counts");
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    // Validate and coerce RPC response shape (null counts → 0)
    const parsed = z.array(ProgramWithCountsSchema).safeParse(data ?? []);
    if (!parsed.success) {
      console.error("[programs.getAllWithCounts] RPC shape mismatch:", parsed.error.flatten());
      return [];
    }
    return parsed.data;
  }),

  /** Returns single program by slug (admin+) */
  getBySlug: adminProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("programs")
        .select("*")
        .eq("slug", input.slug)
        .single();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Programa '${input.slug}' no encontrado` });
      }
      return data;
    }),

  /** Creates a new program (admin+) */
  create: adminProcedure
    .input(ProgramInputSchema)
    .mutation(async ({ ctx, input }) => {
      const supabase = createAdminClient();
      if (input.parent_id) {
        await assertParentDepthOk(supabase, input.parent_id);
      }
      const { data, error } = await supabase
        .from("programs")
        .insert({
          slug: input.slug,
          name: input.name,
          description: input.description,
          icon: input.icon,
          is_default: input.is_default,
          is_active: input.is_active,
          display_order: input.display_order,
          volunteer_can_access: input.volunteer_can_access,
          requires_consents: input.requires_consents,
          fecha_inicio: input.fecha_inicio ?? null,
          fecha_fin: input.fecha_fin ?? null,
          config: (input.config ?? {}) as ProgramInsert["config"],
          responsable_id: input.responsable_id ?? null,
          parent_id: input.parent_id ?? null,
          tipo: input.tipo,
          inscribible: input.inscribible,
          estados_habilitados: input.estados_habilitados,
          plazas: input.plazas ?? null,
          etiquetas: input.etiquetas,
          created_by: String(ctx.user.id),
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este identificador ya está en uso. Elige un slug diferente.",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return data;
    }),

  /** Updates an existing program (admin+) */
  update: adminProcedure
    .input(z.object({ id: uuidLike, data: ProgramInputSchema.partial() }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();
      if (input.data.parent_id) {
        if (input.data.parent_id === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Un programa no puede ser su propio padre" });
        }
        await assertParentDepthOk(supabase, input.data.parent_id);
      }
      const { data, error } = await supabase
        .from("programs")
        .update({ ...(input.data as ProgramUpdate), updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .select()
        .single();

      if (error) {
        // P0001 = raise_exception from the anti-cycle trigger
        if (error.code === "P0001") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Movimiento rechazado: crearía un ciclo en el árbol de programas",
          });
        }
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este identificador ya está en uso.",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return data;
    }),

  /** Deactivates a program, returns active enrollment count as warning (admin+) */
  deactivate: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ input }) => {
      const supabase = createAdminClient();

      // Count active enrollments first
      const { count } = await supabase
        .from("program_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("program_id", input.id)
        .eq("estado", "activo")
        .is("deleted_at", null);

      const { error } = await supabase
        .from("programs")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", input.id);

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return { success: true, activeEnrollmentsCount: count ?? 0 };
    }),

  // ─── Job 2: Enrollment Management ────────────────────────────────────────

  /** Returns enrolled persons for a program (admin+) */
  getEnrollments: adminProcedure
    .input(z.object({
      programId: uuidLike,
      estado: z.enum(ESTADOS_CATALOGO).optional(),
      search: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      let query = supabase
        .from("program_enrollments")
        .select(`
          id, estado, fecha_inicio, fecha_fin, notas, created_at,
          persons!inner(id, nombre, apellidos, foto_perfil_url, restricciones_alimentarias)
        `, { count: "exact" })
        .eq("program_id", input.programId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.estado) {
        query = query.eq("estado", input.estado);
      }

      const { data, error, count } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      return { enrollments: data ?? [], total: count ?? 0 };
    }),

  /** Enrolls a person in a program with consent pre-check (admin+) */
  enrollPerson: adminProcedure
    .input(EnrollmentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const supabase = createAdminClient();

      const { data: program } = await supabase
        .from("programs")
        .select("requires_consents, name, inscribible, estados_habilitados, plazas")
        .eq("id", input.programId)
        .single();

      if (!program) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });
      }
      // Contenedores/actividades don't take direct enrollments (ADR-0013)
      if (program.inscribible === false) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `'${program.name}' no admite inscripciones directas — inscribe en uno de sus programas hijos`,
        });
      }

      // Cupo check — non-blocking warning, like the consent pre-check
      let cupoWarning: string | null = null;
      if (program.plazas != null) {
        const { count: ocupadas } = await supabase
          .from("program_enrollments")
          .select("id", { count: "exact", head: true })
          .eq("program_id", input.programId)
          .in("estado", ["activo", "admitido"])
          .is("deleted_at", null);
        if ((ocupadas ?? 0) >= program.plazas) {
          cupoWarning = `Cupo completo (${ocupadas}/${program.plazas}). Puedes inscribir igualmente, p. ej. en lista de espera.`;
        }
      }

      let consentWarning: string | null = null;

      // Consent pre-check (non-blocking per spec BR-C2)
      if (program?.requires_consents && program.requires_consents.length > 0) {
        for (const purpose of program.requires_consents) {
          const { data: consent } = await supabase
            .from("consents")
            .select("id")
            .eq("person_id", input.personId)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .eq("purpose", purpose as any)
            .eq("granted", true)
            .is("revoked_at", null)
            .is("deleted_at", null)
            .single();

          if (!consent) {
            const purposeLabel = purpose.replace(/_/g, " ");
            consentWarning = `Esta persona no tiene el consentimiento '${purposeLabel}'. Puede inscribirla, pero deberá capturar el consentimiento en su ficha.`;
            break;
          }
        }
      }

      // Insert enrollment with the program's initial estado (funnel-aware:
      // an edición starts people at 'inscrito', a continuo at 'activo')
      const estado = estadoInicial(program.estados_habilitados ?? ["activo"]);
      const { data, error } = await supabase
        .from("program_enrollments")
        .insert({
          person_id: input.personId,
          program_id: input.programId,
          estado,
          fecha_inicio: new Date().toISOString().split("T")[0],
          notas: input.notas ?? null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta persona ya está inscrita en este programa",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      await logEnrollmentEvent(supabase, {
        enrollmentId: data.id,
        anterior: null,
        nuevo: estado,
        actorId: String(ctx.user.id),
      });

      return { enrollment: data, consentWarning, cupoWarning };
    }),

  /** Gets all enrollments for a specific person (admin+) */
  getPersonEnrollments: adminProcedure
    .input(z.object({ personId: uuidLike }))
    .query(async ({ input }) => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("program_enrollments")
        .select(`
          id, estado, fecha_inicio, fecha_fin, notas, created_at, program_id,
          programs!program_enrollments_program_id_fkey(id, name, slug, icon)
        `)
        .eq("person_id", input.personId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    }),

  /** Derived monthly list (ADR-0013): enrollments overlapping the month +
   * per-person attendance counts. Replaces Notion's hand-built "26/1" lists. */
  getListadoMensual: adminProcedure
    .input(
      z.object({
        programId: uuidLike,
        year: z.number().int().min(2020).max(2100),
        month: z.number().int().min(1).max(12),
      })
    )
    .query(async ({ input }) => {
      const supabase = createAdminClient();
      return getListadoMensual(supabase, input.programId, input.year, input.month);
    }),

  /** Changes an enrollment's estado within the program's enabled set (admin+).
   * baja requires a motivo; every transition is appended to enrollment_events. */
  updateEnrollmentEstado: adminProcedure
    .input(
      z.object({
        enrollmentId: uuidLike,
        estado: z.enum(ESTADOS_INSCRIPCION),
        motivo: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const supabase = createAdminClient();
      const { data: row, error } = await supabase
        .from("program_enrollments")
        .select("id, estado, programs!program_enrollments_program_id_fkey(estados_habilitados)")
        .eq("id", input.enrollmentId)
        .single();
      if (error || !row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Inscripción no encontrada" });
      }
      const enrollment = {
        id: row.id,
        estado: row.estado,
        estados_habilitados: row.programs?.estados_habilitados ?? [],
      };
      return applyEstadoChange(supabase, String(ctx.user.id), enrollment, input.estado, input.motivo);
    }),

  /** Unenrolls a person = baja with a mandatory motivo (admin+). */
  unenrollPerson: adminProcedure
    .input(z.object({ enrollmentId: uuidLike, motivo: z.string().min(1).max(500), notas: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = createAdminClient();
      const { data: row, error } = await supabase
        .from("program_enrollments")
        .select("id, estado, programs!program_enrollments_program_id_fkey(estados_habilitados)")
        .eq("id", input.enrollmentId)
        .single();
      if (error || !row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Inscripción no encontrada" });
      }
      const enrollment = {
        id: row.id,
        estado: row.estado,
        // Baja must always be reachable, even on legacy rows whose program
        // never enabled it explicitly
        estados_habilitados: [...(row.programs?.estados_habilitados ?? []), "baja"],
      };
      return applyEstadoChange(supabase, String(ctx.user.id), enrollment, "baja", input.motivo);
    }),
});
