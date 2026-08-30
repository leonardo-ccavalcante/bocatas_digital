import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { type AudienceRule } from "../../../shared/announcementTypes";
import { uuidLike, AnnouncementTipoEnum } from "./_shared";

type AdminDb = ReturnType<typeof createAdminClient>;

/**
 * Admin y superadmin GESTIONAN las novedades, no sólo las leen: /admin/novedades
 * se alimenta del mismo `getAll` que el feed. Si el filtro de audiencia les
 * ocultara una novedad, esa fila quedaría huérfana — sin forma de editarla,
 * desfijarla ni borrarla desde la interfaz. `getById` ya aplicaba esta excepción;
 * `getAll` no, y por eso una novedad segmentada por programa desaparecía incluso
 * para quien acababa de crearla (FAMILIAS-9).
 */
function seesEveryAudience(userRole: string): boolean {
  return userRole === "admin" || userRole === "superadmin";
}

/** (rol ∈ regla.roles o regla sin roles) Y (algún programa en común o regla sin programas). */
function matchesAudience(
  audiences: readonly AudienceRule[],
  userRole: string,
  userProgramSlugs: readonly string[]
): boolean {
  return audiences.some((rule) => {
    const roleMatch =
      rule.roles.length === 0 || (rule.roles as readonly string[]).includes(userRole);
    const programMatch =
      rule.programs.length === 0 ||
      userProgramSlugs.some((slug) => (rule.programs as readonly string[]).includes(slug));
    return roleMatch && programMatch;
  });
}

/**
 * Slugs de los programas en los que la persona está inscrita.
 *
 * TODO(jwt-migration): `ctx.user.id` es el UUID de `auth.users`
 * (server/_core/authenticateRequest.ts) mientras que `program_enrollments.person_id`
 * referencia `persons.id`. Hoy ninguna cuenta de personal tiene fila en `persons`,
 * así que esto devuelve SIEMPRE [] y la segmentación por programa no puede
 * cumplirse para nadie que no sea admin. Resolverlo exige vincular auth.users↔persons
 * y unificar el catálogo de programas con el enum `programa` (gh #131).
 */
async function fetchUserProgramSlugs(db: AdminDb, personId: string): Promise<string[]> {
  const { data: enrollments } = await db
    .from("program_enrollments")
    .select("program_id")
    .eq("person_id", personId)
    .is("deleted_at", null)
    .eq("estado", "activo");

  const programIds = (enrollments ?? []).map((e: { program_id: string }) => e.program_id);
  if (programIds.length === 0) return [];

  const { data: programs } = await db.from("programs").select("slug").in("id", programIds);
  return (programs ?? []).map((p: { slug: string }) => p.slug);
}

const FEED_COLUMNS = `id, titulo, contenido, tipo, es_urgente, activo,
   fecha_inicio, fecha_fin, fijado, imagen_url,
   published_at, expires_at,
   autor_id, autor_nombre, created_at, updated_at,
   announcement_audiences(id, roles, programs)`;

export const readsRouter = router({
  /**
   * getAll — returns announcements VISIBLE to the caller.
   * Ordered by es_urgente DESC, fijado DESC, fecha_inicio DESC NULLS LAST.
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
      const includeInactive =
        seesEveryAudience(userRole) && (input?.includeInactive ?? false);

      const userProgramSlugs = seesEveryAudience(userRole)
        ? []
        : await fetchUserProgramSlugs(db, String(ctx.user.id));

      const now = new Date().toISOString();

      let query = db
        .from("announcements")
        .select(FEED_COLUMNS)
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

      const visible = (data ?? []).filter((row) => {
        if (seesEveryAudience(userRole)) return true;
        const audiences = (row.announcement_audiences ?? []) as AudienceRule[];
        if (audiences.length === 0) return false;
        return matchesAudience(audiences, userRole, userProgramSlugs);
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
        .select(FEED_COLUMNS)
        .eq("id", input.id)
        .maybeSingle();

      if (error || !data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Novedad no encontrada" });
      }

      const audiences = (data.announcement_audiences ?? []) as AudienceRule[];
      const isVisible =
        seesEveryAudience(userRole) ||
        matchesAudience(
          audiences,
          userRole,
          await fetchUserProgramSlugs(db, String(ctx.user.id))
        );

      if (!isVisible) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Novedad no encontrada" });
      }

      return data;
    }),

  /**
   * getUrgentBannerAnnouncement — most-recent active urgent announcement
   * visible to the caller AND not yet dismissed by them, or null.
   *
   * A diferencia de getAll/getById NO exceptúa a admin: el banner de /inicio es
   * una interrupción, no una superficie de gestión, y mostrarle a cada admin toda
   * novedad urgente segmentada sería un cambio de producto, no la corrección de
   * un fallo. Ver el TODO de fetchUserProgramSlugs.
   */
  getUrgentBannerAnnouncement: protectedProcedure
    .query(async ({ ctx }) => {
      const db = createAdminClient();
      const userRole = (ctx.user.role as string) ?? "beneficiario";
      // TODO(jwt-migration): `announcement_dismissals.person_id` espera el uuid de
      // `persons`, no el de `auth.users`; hoy la consulta no casa con ninguna fila.
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
        .select(FEED_COLUMNS)
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

      const userProgramSlugs = await fetchUserProgramSlugs(db, userId);

      for (const row of data ?? []) {
        if (dismissedIds.has(row.id)) continue;
        const audiences = (row.announcement_audiences ?? []) as AudienceRule[];
        if (matchesAudience(audiences, userRole, userProgramSlugs)) return row;
      }

      return null;
    }),
});
