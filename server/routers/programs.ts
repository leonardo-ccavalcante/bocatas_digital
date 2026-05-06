import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import type { Database } from "../../client/src/lib/database.types";

type ProgramInsert = Database["public"]["Tables"]["programs"]["Insert"];
type ProgramUpdate = Database["public"]["Tables"]["programs"]["Update"];
const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID format");

const slugSchema = z.string().regex(
  /^[a-z_]+$/,
  "El identificador solo puede contener letras minúsculas y guiones bajos"
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
});

const EnrollmentInputSchema = z.object({
  personId: uuidLike,
  programId: uuidLike,
  notas: z.string().max(500).optional(),
});

/** Validates shape of get_programs_with_counts RPC response */
const ProgramWithCountsSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  icon: z.string().nullable(),
  is_default: z.boolean(),
  is_active: z.boolean(),
  display_order: z.number(),
  volunteer_can_access: z.boolean(),
  active_enrollments: z.number().nullable().transform(v => v ?? 0),
  total_enrollments: z.number().nullable().transform(v => v ?? 0),
}).passthrough();

export const programsRouter = router({
  // ─── Job 1: Programs Catalog ─────────────────────────────────────────────

  /** Returns active programs. Voluntarios only see volunteer_can_access=true */
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const supabase = createAdminClient();
    const role = ctx.user.role;

    let query = supabase
      .from("programs")
      .select("id, slug, name, description, icon, is_default, is_active, display_order, volunteer_can_access, requires_consents, fecha_inicio, fecha_fin, config")
      .eq("is_active", true)
      .order("display_order");

    if (role === "user") {
      // voluntario role maps to "user" in Manus OAuth
      query = query.eq("volunteer_can_access", true);
    }

    const { data, error } = await query;
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return data ?? [];
  }),

  /** Returns all programs with enrollment counts (admin+) */
  getAllWithCounts: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Solo administradores pueden ver los conteos" });
    }
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
  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
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
  create: protectedProcedure
    .input(ProgramInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const supabase = createAdminClient();
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
  update: protectedProcedure
    .input(z.object({ id: uuidLike, data: ProgramInputSchema.partial() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("programs")
        .update({ ...(input.data as ProgramUpdate), updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .select()
        .single();

      if (error) {
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
  deactivate: protectedProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
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
  getEnrollments: protectedProcedure
    .input(z.object({
      programId: uuidLike,
      estado: z.enum(["activo", "completado", "rechazado"]).optional(),
      search: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
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
  enrollPerson: protectedProcedure
    .input(EnrollmentInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const supabase = createAdminClient();

      // Get program requires_consents
      const { data: program } = await supabase
        .from("programs")
        .select("requires_consents, name")
        .eq("id", input.programId)
        .single();

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

      // Insert enrollment
      const { data, error } = await supabase
        .from("program_enrollments")
        .insert({
          person_id: input.personId,
          program_id: input.programId,
          estado: "activo",
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

      return { enrollment: data, consentWarning };
    }),

  /** Gets all enrollments for a specific person (admin+) */
  getPersonEnrollments: protectedProcedure
    .input(z.object({ personId: uuidLike }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
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

  /** Unenrolls a person from a program (sets estado='completado') (admin+) */
  unenrollPerson: protectedProcedure
    .input(z.object({ enrollmentId: uuidLike, notas: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("program_enrollments")
        .update({
          estado: "completado",
          fecha_fin: new Date().toISOString().split("T")[0],
          notas: input.notas ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.enrollmentId)
        .select()
        .single();

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),
});
