import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { ENV } from "../../_core/env";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import {
  type TipoAnnouncement,
  type AudienceRule,
  type AnnouncementRole,
  type AnnouncementProgram,
} from "../../../shared/announcementTypes";
import { diffForAudit, shouldFireWebhook } from "../../announcements-helpers";
import {
  uuidLike,
  CreateAnnouncementSchema,
  UpdateAnnouncementSchema,
  type WebhookPayload,
  type AnnouncementMutableSnapshot,
  fireUrgentWebhook,
  writeAuditRows,
  replaceAudiences,
} from "./_shared";

export const crudRouter = router({
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

      await writeAuditRows(db, data.id, autor_id, [
        { field: "created", old_value: null, new_value: "announcement" },
      ]);

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

      const { data: current, error: fetchErr } = await db
        .from("announcements")
        .select("*")
        .eq("id", input.id)
        .maybeSingle();
      if (fetchErr || !current) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Novedad no encontrada" });
      }

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

      if (input.audiences !== undefined) {
        await replaceAudiences(db, input.id, input.audiences as AudienceRule[]);
      }

      await writeAuditRows(db, input.id, String(ctx.user.id), changes);

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
});
