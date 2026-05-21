import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, voluntarioProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { uuidLike } from "./_shared";

export const followUpsRouter = router({
  /** Insert a new seguimiento record for a family (admin only). */
  createFollowUp: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
        notas: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("family_follow_ups")
        .insert({
          family_id: input.family_id,
          fecha: input.fecha,
          notas: input.notas ?? null,
          created_by: String(ctx.user.id),
        })
        .select("id, family_id, fecha, notas, created_at")
        .single();

      if (error || !data) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error?.message ?? "Error al guardar seguimiento",
        });
      }
      return data;
    }),

  /** List seguimiento records for a family, most recent first (admin only). */
  listFollowUps: adminProcedure
    .input(
      z.object({
        family_id: uuidLike,
        limit: z.number().int().min(1).max(20).default(3),
      })
    )
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data, error } = await db
        .from("family_follow_ups")
        .select("id, family_id, fecha, notas, created_by, created_at")
        .eq("family_id", input.family_id)
        .is("deleted_at", null)
        .order("fecha", { ascending: false })
        .limit(input.limit);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }
      return data ?? [];
    }),

  /** Return the single most-recent non-deleted seguimiento for a family (voluntario+). */
  getLatestFollowUp: voluntarioProcedure
    .input(z.object({ family_id: uuidLike }))
    .query(async ({ input }) => {
      const db = createAdminClient();
      const { data } = await db
        .from("family_follow_ups")
        .select("id, fecha, notas")
        .eq("family_id", input.family_id)
        .is("deleted_at", null)
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle();

      return data ?? null;
    }),
});
