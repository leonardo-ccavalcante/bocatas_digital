import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { protectedProcedure, router } from "../../_core/trpc";

export const enrollRouter = router({
  /**
   * Enroll a person in one or more programs.
   * Uses service role key to bypass RLS.
   */
  enroll: protectedProcedure
    .input(z.object({
      personId: z.string().uuid(),
      programIds: z.array(z.string().uuid()),
    }))
    .mutation(async ({ input }) => {
      if (input.programIds.length === 0) return [];

      const supabase = createAdminClient();
      const rows = input.programIds.map((programId) => ({
        person_id: input.personId,
        program_id: programId,
        estado: "activo" as const,
      }));

      const { data, error } = await supabase
        .from("program_enrollments")
        .upsert(rows, { onConflict: "person_id,program_id" })
        .select("id, program_id, estado");

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al inscribir en programas: ${error.message}`,
          cause: error,
        });
      }

      return data ?? [];
    }),
});
