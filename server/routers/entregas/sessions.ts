import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../../_core/trpc";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { uuidLike, type Entrega } from "./_shared";

export const sessionsRouter = router({
  /**
   * Get delivery sessions (batches) for a family from `deliveries`.
   * Groups by session_id (replaces old entregas_batch_id grouping).
   */
  getBatchesByFamilia: protectedProcedure
    .input(
      z.object({
        familia_id: uuidLike,
        limit: z.number().int().positive().default(10),
        offset: z.number().int().nonnegative().default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        const db = createAdminClient();
        const { data, error } = await (db as any)
          .from("deliveries")
          .select("session_id, fecha_entrega")
          .eq("family_id", input.familia_id)
          .is("deleted_at", null)
          .order("fecha_entrega", { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);
        if (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al obtener sesiones" });
        }
        // Group by session_id (null session_id = individual delivery)
        const sessions = new Map<string, number>();
        (data as any[])?.forEach((row) => {
          const key = row.session_id ?? `individual-${row.fecha_entrega}`;
          sessions.set(key, (sessions.get(key) || 0) + 1);
        });
        return {
          success: true,
          data: Array.from(sessions.entries()).map(([sessionId, count]) => ({
            session_id: sessionId,
            count,
          })),
          total: sessions.size,
          message: "Sesiones obtenidas exitosamente",
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Error desconocido" });
      }
    }),

  /**
   * Get delivery details for a session from `deliveries`.
   */
  getBatchDetails: protectedProcedure
    .input(z.object({ batchId: z.string() }))
    .query(async ({ input }) => {
      try {
        const db = createAdminClient();
        const { data, error } = await (db as any)
          .from("deliveries")
          .select("*")
          .eq("session_id", input.batchId)
          .is("deleted_at", null)
          .order("fecha_entrega", { ascending: false });
        if (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Error al obtener sesión" });
        }
        return {
          success: true,
          data: (data as Entrega[]) || [],
          message: "Sesión obtenida exitosamente",
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Error desconocido" });
      }
    }),
});
