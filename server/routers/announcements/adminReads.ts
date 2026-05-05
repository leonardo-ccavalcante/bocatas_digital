import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import type { Json } from "../../../client/src/lib/database.types";
import { type AudienceRule } from "../../../shared/announcementTypes";
import { uuidLike } from "./_shared";

export const adminReadsRouter = router({
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
          old_value: Json | null;
          new_value: Json | null;
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

      const { data: audienceRows, error: audErr } = await db
        .from("announcement_audiences")
        .select("roles, programs")
        .eq("announcement_id", input.announcement_id);
      if (audErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: audErr.message });

      const { data: dismissals, error: disErr } = await db
        .from("announcement_dismissals")
        .select("person_id")
        .eq("announcement_id", input.announcement_id);
      if (disErr) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: disErr.message });

      const dismissedPersonIds = new Set(
        (dismissals ?? []).map((d: { person_id: string }) => d.person_id)
      );

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
});
