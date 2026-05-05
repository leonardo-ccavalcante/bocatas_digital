import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { protectedProcedure, router } from "../../_core/trpc";
import { uuidLike } from "./_shared";

export const historyRouter = router({
  /**
   * getCheckinHistory — paginated check-in history for a person.
   * Returns { rows, total, hasMore } with location name, program, method, date, time.
   * Admin-only: protectedProcedure (any authenticated user can view for now).
   */
  getCheckinHistory: protectedProcedure
    .input(
      z.object({
        personId: uuidLike,
        limit: z.number().int().min(1).max(100).optional().default(20),
        offset: z.number().int().min(0).optional().default(0),
      })
    )
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      const { data, error, count } = await supabase
        .from("attendances")
        .select(`
          id,
          checked_in_date,
          checked_in_at,
          created_at,
          programa,
          metodo,
          es_demo,
          notas,
          locations(nombre)
        `, { count: "exact" })
        .eq("person_id", input.personId)
        .is("deleted_at", null)
        .order("checked_in_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al obtener historial: ${error.message}`,
        });
      }

      const rows = (data ?? []).map((row: any) => ({
        id: row.id as string,
        fecha: row.checked_in_date as string,
        hora: row.checked_in_at
          ? new Date(row.checked_in_at).toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Madrid",
            })
          : new Date(row.created_at).toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Madrid",
            }),
        sede: (row.locations as any)?.nombre ?? "—",
        programa: row.programa as string,
        metodo: row.metodo as string,
        esDemo: row.es_demo as boolean,
        notas: row.notas as string | null,
      }));

      return {
        rows,
        total: count ?? 0,
        hasMore: (count ?? 0) > input.offset + input.limit,
      };
    }),
});
