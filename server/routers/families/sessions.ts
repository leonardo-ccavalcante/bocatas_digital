import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { uuidLike, programIdSchema } from "./_shared";

export const sessionsRouter = router({
  // ─── Job 10: Session Close ───────────────────────────────────────────────
  /** POST close a program session */
  closeSession: adminProcedure
    .input(
      z.object({
        program_id: programIdSchema,
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
        program_id: programIdSchema,
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
});
