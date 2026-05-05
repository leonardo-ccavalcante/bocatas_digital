import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { uuidLike } from "./_shared";

export const dismissalsRouter = router({
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
});
