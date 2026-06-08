/**
 * templated/distribucionPorDistrito.ts — Distribución de familias activas por distrito.
 *
 * Inputs: { estado?: "activa" | "all" }
 * Output: { rows: { distrito: string, count: number }[] } sorted by count descending.
 *
 * groupBy + aggregate in JS (plan §10) over limit-capped rows from DB.
 *
 * Compliance: adminProcedure. withSoftDeleteFilter. wrapDbError.
 */

import { z } from "zod";
import { router, adminProcedure } from "../../../_core/trpc";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import { withSoftDeleteFilter, wrapDbError, logAuditReport } from "../_shared";

const InputSchema = z
  .object({
    estado: z.enum(["activa", "all"]).optional(),
  })
  .optional();

export const distribucionPorDistritoRouter = router({
  distribucionPorDistrito: adminProcedure
    .input(InputSchema)
    .query(async ({ ctx, input }) => {
      const db = createAdminClient();
      const estado = input?.estado ?? "activa";

      let q = withSoftDeleteFilter(
        db.from("families").select("distrito"),
      );

      if (estado === "activa") {
        q = q.eq("estado", "activa");
      }

      const { data, error } = await q;

      if (error) {
        throw wrapDbError("reports.distribucionPorDistrito", error);
      }

      // Group by distrito in JS (plan §10: JS-side aggregation over capped rows).
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        const key = (row.distrito as string | null) ?? "sin_asignar";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const rows = Array.from(counts.entries())
        .map(([distrito, count]) => ({ distrito, count }))
        .sort((a, b) => b.count - a.count);

      logAuditReport(ctx, "reports.distribucionPorDistrito", rows.length, {
        estado: input?.estado ?? "activa",
      });

      return { rows };
    }),
});
