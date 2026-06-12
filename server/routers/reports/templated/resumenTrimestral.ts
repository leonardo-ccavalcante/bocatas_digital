/**
 * templated/resumenTrimestral.ts — Resumen trimestral de KPIs.
 *
 * Inputs: { year: number, quarter: 1|2|3|4 }
 * Output: { nuevasFamilias, totalEntregas, distribucionPorDistrito }
 *
 * Quarter to month mapping:
 *   Q1: Jan-Mar (01-03), Q2: Apr-Jun (04-06)
 *   Q3: Jul-Sep (07-09), Q4: Oct-Dec (10-12)
 *
 * K-anonymity + statistical disclosure control (CAS-05 / EIPD, themis follow-up):
 * the per-distrito map is run through the shared SDC helper, which applies the
 * primary floor AND complementary (secondary) suppression against the exact
 * `nuevasFamilias` total co-published here. Without complementary suppression a
 * single below-floor distrito is recovered by differencing
 * (nuevasFamilias − Σ visible). Reuses the SAME helper/floor as every other
 * report — no parallel mechanism, no hardcoded threshold.
 *
 * Compliance: adminProcedure. withSoftDeleteFilter. wrapDbError.
 * PII: No high-risk fields selected.
 */

import { z } from "zod";
import { router, adminProcedure } from "../../../_core/trpc";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import { applySdc } from "../../../_core/statisticalDisclosure";
import { withSoftDeleteFilter, wrapDbError, logAuditReport } from "../_shared";

const QUARTER_MONTHS: Record<1 | 2 | 3 | 4, { start: string; end: string }> = {
  1: { start: "01", end: "03" },
  2: { start: "04", end: "06" },
  3: { start: "07", end: "09" },
  4: { start: "10", end: "12" },
};

// Last day of month by 0-indexed month number.
function lastDayOf(year: number, month1Indexed: number): string {
  const d = new Date(year, month1Indexed, 0); // day 0 of next month = last day of this month
  return String(d.getDate()).padStart(2, "0");
}

const InputSchema = z.object({
  year: z.number().int().min(2020).max(2099),
  quarter: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
});

export const resumenTrimestralRouter = router({
  resumenTrimestral: adminProcedure
    .input(InputSchema)
    .query(async ({ ctx, input }) => {
      const db = createAdminClient();
      const { year, quarter } = input;
      const { start, end } = QUARTER_MONTHS[quarter];

      const endMonthInt = parseInt(end, 10);
      const lastDay = lastDayOf(year, endMonthInt);

      const fromDate = `${year}-${start}-01`;
      const toDate = `${year}-${end}-${lastDay}`;

      // 1. Nuevas familias creadas en el trimestre.
      const { data: newFamilies, error: famErr } = await withSoftDeleteFilter(
        db
          .from("families")
          .select("id, distrito")
          .gte("created_at", fromDate)
          .lte("created_at", toDate + "T23:59:59.999Z"),
      );

      if (famErr) {
        throw wrapDbError("reports.resumenTrimestral.families", famErr);
      }

      // 2. Total entregas en el trimestre.
      const { data: entregas, error: entErr } = await withSoftDeleteFilter(
        db
          .from("deliveries")
          .select("id")
          .gte("fecha_entrega", fromDate)
          .lte("fecha_entrega", toDate),
      );

      if (entErr) {
        throw wrapDbError("reports.resumenTrimestral.deliveries", entErr);
      }

      // 3. Distribución por distrito (from new families in quarter).
      const distCounts = new Map<string, number>();
      for (const f of newFamilies ?? []) {
        const key = f.distrito ?? "sin_asignar";
        distCounts.set(key, (distCounts.get(key) ?? 0) + 1);
      }

      const nuevasFamilias = (newFamilies ?? []).length;
      const totalEntregas = (entregas ?? []).length;

      // SDC (CAS-05 + themis BLOCKER 1): primary floor + complementary
      // suppression against the co-published `nuevasFamilias` grand total — the
      // breakdown partitions exactly that total, so without secondary
      // suppression a single below-floor distrito is recovered by differencing.
      const distribucionPorDistrito = applySdc(
        Array.from(distCounts.entries()).map(([distrito, count]) => ({
          label: distrito,
          count,
        })),
        { publishedTotal: nuevasFamilias },
      )
        .map((c) => ({ distrito: c.label, count: c.count }))
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

      logAuditReport(
        ctx,
        "reports.resumenTrimestral",
        nuevasFamilias + totalEntregas,
        { year, quarter },
      );

      return {
        nuevasFamilias,
        totalEntregas,
        distribucionPorDistrito,
        periodo: { year, quarter, from: fromDate, to: toDate },
      };
    }),
});
