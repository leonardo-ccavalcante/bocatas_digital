/**
 * templated/distribucionPorDistrito.ts — Distribución de familias activas por distrito.
 *
 * Inputs: { estado?: "activa" | "all" }
 * Output: { rows: { distrito: string, count: number | null }[] } sorted by count descending.
 *
 * groupBy + aggregate in JS (plan §10) over limit-capped rows from DB.
 *
 * K-anonymity / SDC (CAS-05 / EIPD): any distrito with count < K_ANONYMITY_FLOOR
 * is suppressed (count → null) so a district with 1–2 families is not
 * individually re-identifiable. Routed through the SAME shared SDC helper as
 * every other report. This report publishes NO grand total, so complementary
 * (secondary) suppression is a no-op here — but centralising the policy means
 * the moment a total is ever added, differencing protection comes for free.
 *
 * Compliance: adminProcedure. withSoftDeleteFilter. wrapDbError.
 */

import { z } from "zod";
import { router, adminProcedure } from "../../../_core/trpc";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import { applySdc } from "../../../_core/statisticalDisclosure";
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

      // SDC (CAS-05): primary floor via the shared helper. No published total
      // here ⇒ complementary suppression is a no-op, but the policy is one
      // code path (Karpathy: no parallel mechanism).
      const rows = applySdc(
        Array.from(counts.entries()).map(([distrito, count]) => ({
          label: distrito,
          count,
        })),
      )
        .map((c) => ({ distrito: c.label, count: c.count }))
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

      logAuditReport(ctx, "reports.distribucionPorDistrito", rows.length, {
        estado: input?.estado ?? "activa",
      });

      return { rows };
    }),
});
