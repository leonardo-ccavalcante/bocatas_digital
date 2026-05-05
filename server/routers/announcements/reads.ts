import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { type AudienceRule } from "../../../shared/announcementTypes";
import { uuidLike, AnnouncementTipoEnum } from "./_shared";

export const readsRouter = router({
  /**
   * getAll — returns announcements VISIBLE to the caller.
   * Visibility is computed at the DB level via an EXISTS subquery on
   * announcement_audiences. Ordered by es_urgente DESC, fijado DESC,
   * fecha_inicio DESC NULLS LAST.
   * includeInactive is admin-only; server enforces this regardless of input.
   */
  getAll: protectedProcedure
    .input(
      z.object({
        tipo: AnnouncementTipoEnum.optional(),
        soloUrgentes: z.boolean().default(false),
        includeInactive: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const db = createAdminClient();
      const userRole = (ctx.user.role as string) ?? "beneficiario";
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;

      // Only admin/superadmin may request inactive announcements.
      const canSeeInactive =
        userRole === "admin" || userRole === "superadmin";
      const includeInactive = canSeeInactive && (input?.includeInactive ?? false);

      // Fetch user's active program enrollments for visibility matching.
      const { data: enrollments } = await db
        .from("program_enrollments")
        .select("program_id")
        .eq("person_id", String(ctx.user.id))
        .is("deleted_at", null)
        .eq("estado", "activo");

      const programIds = (enrollments ?? []).map((e: { program_id: string }) => e.program_id);
      let userProgramSlugs: string[] = [];
      if (programIds.length > 0) {
        const { data: programs } = await db
          .from("programs")
          .select("slug")
          .in("id", programIds);
        userProgramSlugs = (programs ?? []).map((p: { slug: string }) => p.slug);
      }

      const now = new Date().toISOString();

      let query = db
        .from("announcements")
        .select(
          `id, titulo, contenido, tipo, es_urgente, activo,
           fecha_inicio, fecha_fin, fijado, imagen_url,
           published_at, expires_at,
           autor_id, autor_nombre, created_at, updated_at,
           announcement_audiences(id, roles, programs)`
        )
        .order("es_urgente", { ascending: false })
        .order("fijado", { ascending: false })
        .order("fecha_inicio", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

      if (!includeInactive) {
        query = query
          .eq("activo", true)
          .or(`fecha_inicio.is.null,fecha_inicio.lte.${now}`)
          .or(`fecha_fin.is.null,fecha_fin.gt.${now}`);
      }

      if (input?.tipo) {
        query = query.eq("tipo", input.tipo);
      }
      if (input?.soloUrgentes) {
        query = query.eq("es_urgente", true);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al obtener novedades: ${error.message}`,
        });
      }

      // Client-side visibility filter against audience rules.
      const visible = (data ?? []).filter((row) => {
        const audiences = (row.announcement_audiences ?? []) as AudienceRule[];
        if (audiences.length === 0) return false;
        return audiences.some((rule) => {
          const roleMatch =
            rule.roles.length === 0 ||
            (rule.roles as string[]).includes(userRole);
          const programMatch =
            rule.programs.length === 0 ||
            userProgramSlugs.some((slug) =>
              (rule.programs as string[]).includes(slug)
            );
          return roleMatch && programMatch;
        });
      });

      return { announcements: visible, total: visible.length };
    }),

  /**
   * getById — single announcement if visible to caller; NOT_FOUND otherwise.
   */
  getById: protectedProcedure
    .input(z.object({ id: uuidLike }))
    .query(async ({ input, ctx }) => {
      const db = createAdminClient();
      const userRole = (ctx.user.role as string) ?? "beneficiario";

      const { data, error } = await db
        .from("announcements")
        .select(
          `id, titulo, contenido, tipo, es_urgente, activo,
           fecha_inicio, fecha_fin, fijado, imagen_url,
           autor_id, autor_nombre, created_at, updated_at,
           announcement_audiences(id, roles, programs)`
        )
        .eq("id", input.id)
        .maybeSingle();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Novedad no encontrada" });
      }

      const audiences = (data.announcement_audiences ?? []) as AudienceRule[];
      const { data: enrollments } = await db
        .from("program_enrollments")
        .select("program_id")
        .eq("person_id", String(ctx.user.id))
        .is("deleted_at", null)
        .eq("estado", "activo");
      const programIds = (enrollments ?? []).map((e: { program_id: string }) => e.program_id);
      let userProgramSlugs: string[] = [];
      if (programIds.length > 0) {
        const { data: programs } = await db
          .from("programs")
          .select("slug")
          .in("id", programIds);
        userProgramSlugs = (programs ?? []).map((p: { slug: string }) => p.slug);
      }

      const isVisible =
        userRole === "admin" ||
        userRole === "superadmin" ||
        audiences.some((rule) => {
          const roleMatch =
            rule.roles.length === 0 ||
            (rule.roles as string[]).includes(userRole);
          const programMatch =
            rule.programs.length === 0 ||
            userProgramSlugs.some((slug) =>
              (rule.programs as string[]).includes(slug)
            );
          return roleMatch && programMatch;
        });

      if (!isVisible) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Novedad no encontrada" });
      }

      return data;
    }),

  /**
   * getUrgentBannerAnnouncement — most-recent active urgent announcement
   * visible to the caller AND not yet dismissed by them, or null.
   */
  getUrgentBannerAnnouncement: protectedProcedure
    .query(async ({ ctx }) => {
      const db = createAdminClient();
      const userRole = (ctx.user.role as string) ?? "beneficiario";
      const userId = String(ctx.user.id);
      const now = new Date().toISOString();

      const { data: dismissed } = await db
        .from("announcement_dismissals")
        .select("announcement_id")
        .eq("person_id", userId);
      const dismissedIds = new Set(
        (dismissed ?? []).map((d: { announcement_id: string }) => d.announcement_id)
      );

      const { data, error } = await db
        .from("announcements")
        .select(
          `id, titulo, contenido, tipo, es_urgente, activo,
           fecha_inicio, fecha_fin, fijado, imagen_url,
           autor_id, autor_nombre, created_at, updated_at,
           announcement_audiences(id, roles, programs)`
        )
        .eq("activo", true)
        .eq("es_urgente", true)
        .or(`fecha_inicio.is.null,fecha_inicio.lte.${now}`)
        .or(`fecha_fin.is.null,fecha_fin.gt.${now}`)
        .order("fecha_inicio", { ascending: false, nullsFirst: false })
        .limit(20);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al obtener banner urgente: ${error.message}`,
        });
      }

      const { data: enrollments } = await db
        .from("program_enrollments")
        .select("program_id")
        .eq("person_id", userId)
        .is("deleted_at", null)
        .eq("estado", "activo");
      const programIds = (enrollments ?? []).map((e: { program_id: string }) => e.program_id);
      let userProgramSlugs: string[] = [];
      if (programIds.length > 0) {
        const { data: programs } = await db
          .from("programs")
          .select("slug")
          .in("id", programIds);
        userProgramSlugs = (programs ?? []).map((p: { slug: string }) => p.slug);
      }

      for (const row of data ?? []) {
        if (dismissedIds.has(row.id)) continue;
        const audiences = (row.announcement_audiences ?? []) as AudienceRule[];
        const isVisible = audiences.some((rule) => {
          const roleMatch =
            rule.roles.length === 0 ||
            (rule.roles as string[]).includes(userRole);
          const programMatch =
            rule.programs.length === 0 ||
            userProgramSlugs.some((slug) =>
              (rule.programs as string[]).includes(slug)
            );
          return roleMatch && programMatch;
        });
        if (isVisible) return row;
      }

      return null;
    }),
});
