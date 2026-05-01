/**
 * announcements.ts — tRPC router for Novedades (Announcements) feature.
 *
 * Wave 1 + Wave 2A helpers are in server/announcements-helpers.ts.
 * Wave 2B (this file): audiences model, audit log, webhook, bulk import, auto author.
 *
 * Procedures:
 *   Reads (protectedProcedure — any authenticated user):
 *     - getAll                    list announcements visible to caller
 *     - getById                   single announcement visible to caller
 *     - getUrgentBannerAnnouncement  active urgent, not dismissed, for /inicio banner
 *   Reads (adminProcedure — admin/superadmin only):
 *     - getAudiencesByAnnouncementId  audience rules for admin form
 *     - getAuditLog               per-field edit history
 *     - getDismissalStats         who has/hasn't seen an urgent announcement
 *   Writes (adminProcedure):
 *     - create                    insert announcement + audiences, fire webhook if urgent
 *     - update                    diff + audit log + optional audiences replace
 *     - delete                    soft-delete (activo=false) + audit row
 *     - togglePin                 flip fijado + audit row
 *     - previewBulkImport         parse CSV → bulk_import_previews
 *     - confirmBulkImport         call pg function → announcements + audiences
 *   Writes (protectedProcedure):
 *     - dismissUrgent             write announcement_dismissals for caller
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, protectedProcedure } from "../_core/trpc";
import { ENV } from "../_core/env";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import {
  ANNOUNCEMENT_TYPES,
  type TipoAnnouncement,
  type AudienceRule,
  type AnnouncementRole,
  type AnnouncementProgram,
} from "../../shared/announcementTypes";
import {
  diffForAudit,
  shouldFireWebhook,
  validateBulkRow,
  parseAudienciasDSL,
  type ParsedBulkRow,
  type BulkRowError,
  type AuditChange,
} from "../announcements-helpers";
import { uploadImageProcedure } from "./announcements.uploadImage";

// ─── Shared Zod primitives ─────────────────────────────────────────────────────

const uuidLike = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID format"
  );

/** Only the 4 current tipo values — legacy values blocked by CHECK constraint in DB */
const AnnouncementTipoEnum = z.enum(
  [...ANNOUNCEMENT_TYPES] as [TipoAnnouncement, ...TipoAnnouncement[]]
);

const AudienceRuleSchema = z.object({
  roles: z.array(
    z.enum(["superadmin", "admin", "voluntario", "beneficiario"] as const)
  ),
  programs: z.array(
    z.enum([
      "comedor",
      "familia",
      "formacion",
      "atencion_juridica",
      "voluntariado",
      "acompanamiento",
    ] as const)
  ),
});

// ─── Webhook types ────────────────────────────────────────────────────────────

interface WebhookPayload {
  event: "announcement.urgent.created";
  announcement_id: string;
  titulo: string;
  contenido_preview: string;
  tipo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  audiences: AudienceRule[];
  autor_nombre: string | null;
  app_url: string;
}

// ─── Fire-and-forget webhook ──────────────────────────────────────────────────

async function fireUrgentWebhook(payload: WebhookPayload): Promise<void> {
  const url = process.env.URGENT_WEBHOOK_URL;
  const db = createAdminClient();
  if (!url) {
    await db.from("announcement_webhook_log").insert({
      announcement_id: payload.announcement_id,
      attempted_at: new Date().toISOString(),
      status_code: null,
      response_body: null,
      error: "no webhook configured",
    });
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.text().catch(() => "");
    await db.from("announcement_webhook_log").insert({
      announcement_id: payload.announcement_id,
      attempted_at: new Date().toISOString(),
      status_code: res.status,
      response_body: body.slice(0, 500),
      error: res.ok ? null : `HTTP ${res.status}`,
    });
  } catch (err: unknown) {
    await db.from("announcement_webhook_log").insert({
      announcement_id: payload.announcement_id,
      attempted_at: new Date().toISOString(),
      status_code: null,
      response_body: null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Inline CSV parser (RFC 4180 quoted-field aware) ─────────────────────────
// Reuses the same logic as csvFamiliesWithMembers.ts — robust enough for
// quoted fields containing commas or line-break-free content.

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// ─── Input schemas ─────────────────────────────────────────────────────────────

const CreateAnnouncementSchema = z.object({
  titulo: z.string().min(1).max(200),
  contenido: z.string().min(1).max(5000),
  tipo: AnnouncementTipoEnum.default("info"),
  es_urgente: z.boolean().default(false),
  fecha_inicio: z.string().datetime().optional(),
  fecha_fin: z.string().datetime().optional().nullable(),
  published_at: z.string().date().optional(),
  expires_at: z.string().date().optional(),
  fijado: z.boolean().default(false),
  imagen_url: z.string().url().optional().nullable(),
  audiences: z.array(AudienceRuleSchema).min(1),
});

// NOTE: autor_id and autor_nombre are intentionally absent — defense in depth
// against the Postgres trigger that blocks UPDATEs changing those columns.
const UpdateAnnouncementSchema = z.object({
  id: uuidLike,
  titulo: z.string().min(1).max(200).optional(),
  contenido: z.string().min(1).max(5000).optional(),
  tipo: AnnouncementTipoEnum.optional(),
  es_urgente: z.boolean().optional(),
  fecha_inicio: z.string().datetime().optional(),
  fecha_fin: z.string().datetime().optional().nullable(),
  published_at: z.string().date().optional(),
  expires_at: z.string().date().optional(),
  fijado: z.boolean().optional(),
  imagen_url: z.string().url().optional().nullable(),
  audiences: z.array(AudienceRuleSchema).min(1).optional(),
});

// ─── Row shape used for diffForAudit ──────────────────────────────────────────

interface AnnouncementMutableSnapshot {
  titulo: string;
  contenido: string;
  tipo: TipoAnnouncement;
  es_urgente: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fijado: boolean;
  imagen_url: string | null;
}

// ─── Helper: write N audit rows atomically (non-transactional — Supabase REST
// does not expose multi-statement transactions. We do a bulk INSERT instead.) ──

async function writeAuditRows(
  db: ReturnType<typeof createAdminClient>,
  announcement_id: string,
  edited_by: string,
  changes: AuditChange[]
): Promise<void> {
  if (changes.length === 0) return;
  const rows = changes.map((c) => ({
    announcement_id,
    edited_by,
    edited_at: new Date().toISOString(),
    field: c.field,
    old_value: c.old_value !== undefined ? JSON.stringify(c.old_value) : null,
    new_value: c.new_value !== undefined ? JSON.stringify(c.new_value) : null,
  }));
  const { error } = await db.from("announcement_audit_log").insert(rows);
  if (error) {
    // Audit failure must NOT block the write — log and continue.
    console.error("[announcements] audit log write failed:", error.message);
  }
}

// ─── Helper: replace all audience rules for an announcement ──────────────────

async function replaceAudiences(
  db: ReturnType<typeof createAdminClient>,
  announcement_id: string,
  audiences: readonly AudienceRule[]
): Promise<void> {
  const { error: delErr } = await db
    .from("announcement_audiences")
    .delete()
    .eq("announcement_id", announcement_id);
  if (delErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: delErr.message });

  const rows = audiences.map((a) => ({
    announcement_id,
    roles: [...a.roles] as AnnouncementRole[],
    programs: [...a.programs] as AnnouncementProgram[],
  }));
  const { error: insErr } = await db.from("announcement_audiences").insert(rows);
  if (insErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: insErr.message });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const announcementsRouter = router({
  // ──────────────────────────────────────────────────────────────────────────
  // READS (protectedProcedure)
  // ──────────────────────────────────────────────────────────────────────────

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

      // We need program slugs. program_enrollments has program_id (UUID),
      // but announcement_audiences stores programs as programa enum (slug).
      // Fetch the slugs via programs table.
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

      // Build query — visibility filter via RPC or manual EXISTS.
      // Since Supabase JS SDK does not support subquery EXISTS directly,
      // we pull all announcements that are active/visible and filter in JS
      // using isVisibleToUser from the helpers. This is fine for the expected
      // record count (hundreds, not millions). For scale, move to a PG view.
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

      // Visibility check
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

  // ──────────────────────────────────────────────────────────────────────────
  // READS (adminProcedure)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * getAudiencesByAnnouncementId — audience rules for admin edit form.
   */
  getAudiencesByAnnouncementId: adminProcedure
    .input(z.object({ announcement_id: uuidLike }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("announcement_audiences")
        .select("id, roles, programs")
        .eq("announcement_id", input.announcement_id);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data ?? [];
    }),

  /**
   * getAuditLog — per-field edit history joined to persons.nombre.
   */
  getAuditLog: adminProcedure
    .input(
      z.object({
        announcement_id: uuidLike,
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("announcement_audit_log")
        .select("id, announcement_id, edited_by, edited_at, field, old_value, new_value")
        .eq("announcement_id", input.announcement_id)
        .order("edited_at", { ascending: false })
        .limit(input.limit);
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      // Enrich with editor name from persons table.
      const editorIds = Array.from(
        new Set(
          (data ?? [])
            .map((r: { edited_by: string | null }) => r.edited_by)
            .filter((id): id is string => id !== null)
        )
      );
      let editorNames: Record<string, string> = {};
      if (editorIds.length > 0) {
        const { data: persons } = await db
          .from("persons")
          .select("id, nombre")
          .in("id", editorIds);
        editorNames = Object.fromEntries(
          (persons ?? []).map((p: { id: string; nombre: string }) => [p.id, p.nombre])
        );
      }
      return (data ?? []).map(
        (r: {
          id: string;
          announcement_id: string;
          edited_by: string | null;
          edited_at: string;
          field: string;
          old_value: string | null;
          new_value: string | null;
        }) => ({
          ...r,
          editor_nombre: r.edited_by ? (editorNames[r.edited_by] ?? r.edited_by) : null,
        })
      );
    }),

  /**
   * getDismissalStats — how many in the audience have dismissed vs pending.
   */
  getDismissalStats: adminProcedure
    .input(z.object({ announcement_id: uuidLike }))
    .query(async ({ input }) => {
      const db = createAdminClient();

      // Get audience rules.
      const { data: audienceRows, error: audErr } = await db
        .from("announcement_audiences")
        .select("roles, programs")
        .eq("announcement_id", input.announcement_id);
      if (audErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: audErr.message });

      // Get all dismissals for this announcement.
      const { data: dismissals, error: disErr } = await db
        .from("announcement_dismissals")
        .select("person_id")
        .eq("announcement_id", input.announcement_id);
      if (disErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: disErr.message });

      const dismissedPersonIds = new Set(
        (dismissals ?? []).map((d: { person_id: string }) => d.person_id)
      );

      // Total audience = distinct persons matching any rule.
      // For simplicity: query persons + their active program enrollments,
      // then apply the same audience matching logic.
      const { data: persons, error: pErr } = await db
        .from("persons")
        .select("id, nombre, apellidos, role")
        .is("deleted_at", null);
      if (pErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: pErr.message });

      const { data: enrollments, error: enrErr } = await db
        .from("program_enrollments")
        .select("person_id, program_id")
        .is("deleted_at", null)
        .eq("estado", "activo");
      if (enrErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: enrErr.message });

      // Build person → program slug set.
      const programIdToSlugMap: Record<string, string> = {};
      const programIds = Array.from(
        new Set(
          (enrollments ?? []).map((e: { program_id: string }) => e.program_id)
        )
      );
      if (programIds.length > 0) {
        const { data: progs } = await db
          .from("programs")
          .select("id, slug")
          .in("id", programIds);
        (progs ?? []).forEach((p: { id: string; slug: string }) => {
          programIdToSlugMap[p.id] = p.slug;
        });
      }
      const personPrograms: Record<string, string[]> = {};
      (enrollments ?? []).forEach(
        (e: { person_id: string; program_id: string }) => {
          const slug = programIdToSlugMap[e.program_id];
          if (!slug) return;
          if (!personPrograms[e.person_id]) personPrograms[e.person_id] = [];
          personPrograms[e.person_id].push(slug);
        }
      );

      const audiences = (audienceRows ?? []) as AudienceRule[];

      const audiencePersonIds: string[] = [];
      for (const person of persons ?? []) {
        const userRole = person.role as string;
        const userPrograms = personPrograms[person.id] ?? [];
        const inAudience = audiences.some((rule) => {
          const roleMatch =
            rule.roles.length === 0 ||
            (rule.roles as string[]).includes(userRole);
          const programMatch =
            rule.programs.length === 0 ||
            userPrograms.some((slug) =>
              (rule.programs as string[]).includes(slug)
            );
          return roleMatch && programMatch;
        });
        if (inAudience) audiencePersonIds.push(person.id);
      }

      const total_audience = audiencePersonIds.length;
      const dismissed = audiencePersonIds.filter((id) =>
        dismissedPersonIds.has(id)
      ).length;

      const pendingIds = audiencePersonIds.filter(
        (id) => !dismissedPersonIds.has(id)
      );
      const pendingPersons = (persons ?? [])
        .filter((p: { id: string }) => pendingIds.includes(p.id))
        .map((p: { id: string; nombre: string; apellidos: string | null }) => ({
          person_id: p.id,
          nombre: p.nombre,
          apellidos: p.apellidos,
        }));

      return { total_audience, dismissed, pending_names: pendingPersons };
    }),

  // ──────────────────────────────────────────────────────────────────────────
  // WRITES (adminProcedure)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * create — insert announcement + N audience rows + webhook if urgent.
   * autor_id = String(ctx.user.id), autor_nombre = ctx.user.name
   * (Manus user fields — trustworthy because they come from the session,
   * not from user-supplied input. A Supabase-linked persons lookup would
   * require a join table that does not exist in this auth model.)
   */
  create: adminProcedure
    .input(CreateAnnouncementSchema)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      const autor_id = String(ctx.user.id);
      const autor_nombre = ctx.user.name ?? null;

      const { data, error } = await db
        .from("announcements")
        .insert({
          titulo: input.titulo,
          contenido: input.contenido,
          tipo: input.tipo,
          es_urgente: input.es_urgente,
          fijado: input.fijado,
          imagen_url: input.imagen_url ?? null,
          fecha_inicio: input.fecha_inicio ?? new Date().toISOString(),
          fecha_fin: input.fecha_fin ?? null,
          autor_id,
          autor_nombre,
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

      // Insert audience rows.
      const audienceRows = input.audiences.map((a) => ({
        announcement_id: data.id,
        roles: [...a.roles] as AnnouncementRole[],
        programs: [...a.programs] as AnnouncementProgram[],
      }));
      const { error: audErr } = await db
        .from("announcement_audiences")
        .insert(audienceRows);
      if (audErr) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al crear audiencias: ${audErr.message}`,
        });
      }

      // Write audit row for creation.
      await writeAuditRows(db, data.id, autor_id, [
        { field: "created", old_value: null, new_value: "announcement" },
      ]);

      // Fire webhook fire-and-forget.
      if (shouldFireWebhook(null, input.es_urgente, true)) {
        const payload: WebhookPayload = {
          event: "announcement.urgent.created",
          announcement_id: data.id,
          titulo: data.titulo,
          contenido_preview: data.contenido.slice(0, 280),
          tipo: data.tipo,
          fecha_inicio: data.fecha_inicio ?? null,
          fecha_fin: data.fecha_fin ?? null,
          audiences: input.audiences as AudienceRule[],
          autor_nombre,
          app_url: `${ENV.appUrl}/novedades/${data.id}`,
        };
        void fireUrgentWebhook(payload).catch(() => undefined);
      }

      return { ...data, audiences: input.audiences };
    }),

  /**
   * update — compute diff, write audit log, optionally replace audiences.
   */
  update: adminProcedure
    .input(UpdateAnnouncementSchema)
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      // Fetch current row.
      const { data: current, error: fetchErr } = await db
        .from("announcements")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (fetchErr || !current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Novedad no encontrada" });
      }

      // Build next-state snapshot for diff.
      const prev: AnnouncementMutableSnapshot = {
        titulo: current.titulo,
        contenido: current.contenido,
        tipo: current.tipo as TipoAnnouncement,
        es_urgente: (current as Record<string, unknown>).es_urgente as boolean ?? false,
        fecha_inicio: current.fecha_inicio ?? null,
        fecha_fin: current.fecha_fin ?? null,
        fijado: current.fijado,
        imagen_url: current.imagen_url ?? null,
      };

      const next: AnnouncementMutableSnapshot = {
        titulo: input.titulo ?? prev.titulo,
        contenido: input.contenido ?? prev.contenido,
        tipo: input.tipo ?? prev.tipo,
        es_urgente: input.es_urgente ?? prev.es_urgente,
        fecha_inicio: input.fecha_inicio !== undefined ? (input.fecha_inicio ?? null) : prev.fecha_inicio,
        fecha_fin: input.fecha_fin !== undefined ? (input.fecha_fin ?? null) : prev.fecha_fin,
        fijado: input.fijado ?? prev.fijado,
        imagen_url: input.imagen_url !== undefined ? (input.imagen_url ?? null) : prev.imagen_url,
      };

      const changes = diffForAudit(prev, next);

      // Build the DB update object (only changed fields).
      const updatePayload: Record<string, unknown> = {};
      for (const change of changes) {
        updatePayload[change.field] = change.new_value;
      }

      if (Object.keys(updatePayload).length > 0) {
        const { data: updated, error: updErr } = await db
          .from("announcements")
          // Supabase's generated types reject Record<string, unknown> because
          // they enforce a closed shape per column. The fields we set are
          // guaranteed to exist by diffForAudit, so a cast is safe.
          .update(updatePayload as never)
          .eq("id", input.id)
          .select()
          .single();
        if (updErr || !updated) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Error al actualizar novedad: ${updErr?.message ?? "unknown"}`,
          });
        }
      }

      // Replace audiences if provided.
      if (input.audiences !== undefined) {
        await replaceAudiences(db, input.id, input.audiences as AudienceRule[]);
      }

      // Write audit rows.
      await writeAuditRows(db, input.id, String(ctx.user.id), changes);

      // Webhook fire-and-forget.
      if (shouldFireWebhook(prev.es_urgente, next.es_urgente, false)) {
        const { data: freshRow } = await db
          .from("announcements")
          .select("*")
          .eq("id", input.id)
          .maybeSingle();
        if (freshRow) {
          const { data: audRows } = await db
            .from("announcement_audiences")
            .select("roles, programs")
            .eq("announcement_id", input.id);
          const payload: WebhookPayload = {
            event: "announcement.urgent.created",
            announcement_id: freshRow.id,
            titulo: freshRow.titulo,
            contenido_preview: freshRow.contenido.slice(0, 280),
            tipo: freshRow.tipo,
            fecha_inicio: freshRow.fecha_inicio ?? null,
            fecha_fin: freshRow.fecha_fin ?? null,
            audiences: (audRows ?? []) as AudienceRule[],
            autor_nombre: freshRow.autor_nombre ?? null,
            app_url: `${ENV.appUrl}/novedades/${freshRow.id}`,
          };
          void fireUrgentWebhook(payload).catch(() => undefined);
        }
      }

      // Return updated row.
      const { data: finalRow } = await db
        .from("announcements")
        .select(
          `*, announcement_audiences(id, roles, programs)`
        )
        .eq("id", input.id)
        .maybeSingle();

      return finalRow;
    }),

  /**
   * delete — soft-delete (activo=false) + audit row.
   */
  delete: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ input, ctx }) => {
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
      await writeAuditRows(db, input.id, String(ctx.user.id), [
        { field: "activo", old_value: true, new_value: false },
      ]);
      return { success: true };
    }),

  /**
   * togglePin — toggle fijado + audit row.
   */
  togglePin: adminProcedure
    .input(z.object({ id: uuidLike }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      const { data: current, error: fetchErr } = await db
        .from("announcements")
        .select("fijado")
        .eq("id", input.id)
        .maybeSingle();
      if (fetchErr || !current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Novedad no encontrada" });
      }

      const newFijado = !current.fijado;
      const { data, error } = await db
        .from("announcements")
        .update({ fijado: newFijado })
        .eq("id", input.id)
        .select("id, fijado")
        .single();
      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al fijar novedad: ${error?.message ?? "unknown"}`,
        });
      }

      await writeAuditRows(db, input.id, String(ctx.user.id), [
        { field: "fijado", old_value: current.fijado, new_value: newFijado },
      ]);

      return data;
    }),

  /**
   * previewBulkImport — parse CSV, validate rows, stash in bulk_import_previews.
   * Returns valid_count, per-row errors, and a preview_token (UUID).
   */
  previewBulkImport: adminProcedure
    .input(z.object({ csv: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();

      const lines = input.csv
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n");

      // Expect header on line 0.
      const EXPECTED_HEADERS = [
        "titulo",
        "contenido",
        "tipo",
        "es_urgente",
        "fecha_inicio",
        "fecha_fin",
        "fijado",
        "audiencias",
      ];

      if (lines.length < 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El CSV debe tener encabezado y al menos una fila de datos.",
        });
      }

      const headerFields = parseCSVLine(lines[0]);
      const headerMatch = EXPECTED_HEADERS.every(
        (h, i) => headerFields[i] === h
      );
      if (!headerMatch) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Encabezado inválido. Esperado: ${EXPECTED_HEADERS.join(",")}.`,
        });
      }

      // We attach `row_number` to each parsed row so the preview UI can
      // display the original CSV line and correlate with errors.
      type ParsedBulkRowWithLine = ParsedBulkRow & { row_number: number };
      const valid: ParsedBulkRowWithLine[] = [];
      const errors: BulkRowError[] = [];
      let lineNumber = 1;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        lineNumber = i + 1;

        const fields = parseCSVLine(line);
        const rowInput = {
          titulo: fields[0],
          contenido: fields[1],
          tipo: fields[2],
          es_urgente: fields[3],
          fecha_inicio: fields[4],
          fecha_fin: fields[5],
          fijado: fields[6],
          audiencias: fields[7],
        };

        const result = validateBulkRow(rowInput, lineNumber);
        if (!result.ok) {
          errors.push(...result.errors);
        } else if (result.parsed) {
          valid.push({ ...result.parsed, row_number: lineNumber });
        }
      }

      // Stash valid rows in bulk_import_previews. parsed_rows is a jsonb column;
      // the generated types model it as the wide `Json` union which does not
      // accept our typed array directly — cast through `unknown` is the
      // pragmatic fix while preserving runtime correctness.
      const { data: preview, error: previewErr } = await db
        .from("bulk_import_previews")
        .insert({
          parsed_rows: valid as unknown as never,
          created_by: String(ctx.user.id),
        })
        .select("token")
        .single();

      if (previewErr || !preview) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al guardar previsualización: ${previewErr?.message ?? "unknown"}`,
        });
      }

      return {
        valid,
        valid_count: valid.length,
        errors,
        preview_token: (preview as { token: string }).token,
      };
    }),

  /**
   * confirmBulkImport — read preview, call pg function, fire webhooks, cleanup.
   */
  confirmBulkImport: adminProcedure
    .input(z.object({ preview_token: uuidLike }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const createdBy = String(ctx.user.id);
      const autorNombre = ctx.user.name ?? null;

      // Fetch preview — respects 30-min TTL and ownership.
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: preview, error: fetchErr } = await db
        .from("bulk_import_previews")
        .select("token, parsed_rows, created_by, created_at")
        .eq("token", input.preview_token)
        .eq("created_by", createdBy)
        .gte("created_at", thirtyMinAgo)
        .maybeSingle();

      if (fetchErr || !preview) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "preview expired or not found",
        });
      }

      // Call PostgreSQL function for atomic bulk insert.
      const { data: result, error: rpcErr } = await db.rpc(
        "confirm_bulk_announcement_import",
        {
          p_token: input.preview_token,
          p_autor_id: createdBy,
          p_autor_nombre: autorNombre,
        }
      );

      let created_count = 0;
      let error_count = 0;

      if (rpcErr) {
        const total = (
          preview.parsed_rows as unknown as ParsedBulkRow[]
        ).length;
        // Cleanup preview even on failure.
        await db
          .from("bulk_import_previews")
          .delete()
          .eq("token", input.preview_token);
        return {
          created_count: 0,
          error_count: total,
          failed_rows: [{ row: 0, error: rpcErr.message }],
        };
      }

      const rpcResult = result as
        | { created_count: number; error_count: number }
        | null;
      created_count = rpcResult?.created_count ?? 0;
      error_count = rpcResult?.error_count ?? 0;

      // Fire webhooks for urgent rows (fire-and-forget, not awaited).
      const parsedRows = (
        preview.parsed_rows as unknown as ParsedBulkRow[]
      ).filter((r) => r.es_urgente);

      if (parsedRows.length > 0) {
        // Fetch the newly created announcement IDs by cross-referencing titulo + autor_id.
        // This is a best-effort heuristic since the PG function doesn't return IDs.
        const { data: newRows } = await db
          .from("announcements")
          .select("id, titulo, contenido, tipo, fecha_inicio, fecha_fin, autor_nombre, announcement_audiences(roles, programs)")
          .eq("autor_id", createdBy)
          .eq("activo", true)
          .order("created_at", { ascending: false })
          .limit(parsedRows.length * 2);

        const webhookFires = (newRows ?? [])
          .filter((row: { id: string }) => !dismissedLookup(row.id))
          .slice(0, parsedRows.length)
          .map((row: {
            id: string;
            titulo: string;
            contenido: string;
            tipo: string;
            fecha_inicio: string | null;
            fecha_fin: string | null;
            announcement_audiences: unknown;
          }) => {
            const payload: WebhookPayload = {
              event: "announcement.urgent.created",
              announcement_id: row.id,
              titulo: row.titulo,
              contenido_preview: row.contenido.slice(0, 280),
              tipo: row.tipo,
              fecha_inicio: row.fecha_inicio ?? null,
              fecha_fin: row.fecha_fin ?? null,
              audiences: (row.announcement_audiences as AudienceRule[]) ?? [],
              autor_nombre: autorNombre,
              app_url: `${ENV.appUrl}/novedades/${row.id}`,
            };
            return fireUrgentWebhook(payload).catch(() => undefined);
          });
        // Fire all webhooks concurrently, don't await.
        void Promise.all(webhookFires).catch(() => undefined);
      }

      // Delete the preview (one-shot).
      await db
        .from("bulk_import_previews")
        .delete()
        .eq("token", input.preview_token);

      return { created_count, error_count, failed_rows: [] as { row: number; error: string }[] };
    }),

  // ──────────────────────────────────────────────────────────────────────────
  // WRITES (protectedProcedure)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * dismissUrgent — mark an urgent announcement as dismissed for the caller.
   */
  dismissUrgent: protectedProcedure
    .input(z.object({ announcement_id: uuidLike }))
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { error } = await db.from("announcement_dismissals").upsert(
        {
          announcement_id: input.announcement_id,
          person_id: String(ctx.user.id),
          dismissed_at: new Date().toISOString(),
        },
        { onConflict: "announcement_id,person_id", ignoreDuplicates: true }
      );
      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al descartar novedad: ${error.message}`,
        });
      }
       return { success: true };
    }),
  uploadImage: uploadImageProcedure,
});
// ─── Internal no-op used to avoid a TS warning about unused variable ─────────
function dismissedLookup(_id: string): boolean {
  return false;
}
