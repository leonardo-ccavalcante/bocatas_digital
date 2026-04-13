/**
 * announcements.ts — tRPC router for Novedades (Announcements) feature.
 *
 * Procedures:
 *   - getAll         (public): list active announcements filtered by role
 *   - getById        (public): single announcement
 *   - create         (admin+): create announcement
 *   - update         (admin+): update announcement
 *   - delete         (admin+): soft-delete (activo = false)
 *   - togglePin      (admin+): toggle fijado
 *
 * Task 7 — Phase F
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";

const AnnouncementTipoEnum = z.enum(["info", "urgente", "evento", "cierre"]);
const RoleEnum = z.enum(["beneficiario", "voluntario", "admin", "superadmin"]);

const CreateAnnouncementSchema = z.object({
  titulo: z.string().min(1).max(200),
  contenido: z.string().min(1).max(5000),
  tipo: AnnouncementTipoEnum.default("info"),
  roles_visibles: z.array(RoleEnum).min(1).default(["beneficiario", "voluntario", "admin", "superadmin"]),
  fijado: z.boolean().default(false),
  imagen_url: z.string().url().optional().nullable(),
  fecha_inicio: z.string().datetime().optional(),
  fecha_fin: z.string().datetime().optional().nullable(),
});

const UpdateAnnouncementSchema = z.object({
  id: z.string().uuid(),
  titulo: z.string().min(1).max(200).optional(),
  contenido: z.string().min(1).max(5000).optional(),
  tipo: AnnouncementTipoEnum.optional(),
  roles_visibles: z.array(RoleEnum).min(1).optional(),
  fijado: z.boolean().optional(),
  imagen_url: z.string().url().optional().nullable(),
  fecha_inicio: z.string().datetime().optional(),
  fecha_fin: z.string().datetime().optional().nullable(),
  activo: z.boolean().optional(),
});

export const announcementsRouter = router({
  /**
   * Get all active announcements visible to the current user's role.
   */
  getAll: publicProcedure
    .input(
      z.object({
        role: RoleEnum.optional(),
        tipo: AnnouncementTipoEnum.optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
        includeInactive: z.boolean().default(false),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const db = createAdminClient();
      const userRole = (ctx.user?.role as string | undefined) ?? "beneficiario";
      const role = input?.role ?? userRole;
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;
      const includeInactive = input?.includeInactive ?? false;

      // Build base query
      let query = db
        .from("announcements")
        .select("*")
        .contains("roles_visibles", [role])
        .order("fijado", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (!includeInactive) {
        const now = new Date().toISOString();
        query = query.eq("activo", true).lte("fecha_inicio", now);
      }

      if (input?.tipo) {
        query = query.eq("tipo", input.tipo);
      }

      const { data, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al obtener novedades: ${error.message}`,
        });
      }

      return { announcements: data ?? [], total: (data ?? []).length };
    }),

  /**
   * Get single announcement by ID.
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("announcements")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();

      if (error || !data) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Novedad no encontrada",
        });
      }

      return data;
    }),

  /**
   * Create announcement — admin+
   */
  create: adminProcedure
    .input(CreateAnnouncementSchema)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("announcements")
        .insert({
          titulo: input.titulo,
          contenido: input.contenido,
          tipo: input.tipo,
          roles_visibles: input.roles_visibles,
          fijado: input.fijado,
          imagen_url: input.imagen_url ?? null,
          fecha_inicio: input.fecha_inicio ?? new Date().toISOString(),
          fecha_fin: input.fecha_fin ?? null,
          autor_id: ctx.user?.id ? String(ctx.user.id) : null,
          autor_nombre: ctx.user?.name ?? null,
          activo: true,
        })
        .select()
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al crear novedad: ${error?.message ?? "unknown"}`,
        });
      }

      return data;
    }),

  /**
   * Update announcement — admin+
   */
  update: adminProcedure
    .input(UpdateAnnouncementSchema)
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { id, ...updates } = input;

      const { data, error } = await db
        .from("announcements")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al actualizar novedad: ${error?.message ?? "unknown"}`,
        });
      }

      return data;
    }),

  /**
   * Soft-delete announcement (activo = false) — admin+
   */
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { error } = await db
        .from("announcements")
        .update({ activo: false })
        .eq("id", input.id);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al eliminar novedad: ${error.message}`,
        });
      }

      return { success: true, id: input.id };
    }),

  /**
   * Toggle fijado (pinned) — admin+
   */
  togglePin: adminProcedure
    .input(z.object({ id: z.string().uuid(), fijado: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("announcements")
        .update({ fijado: input.fijado })
        .eq("id", input.id)
        .select("id, fijado")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al fijar novedad: ${error?.message ?? "unknown"}`,
        });
      }

      return data;
    }),
});
