/**
 * templated/evolucionHistorica.ts — Evolución histórica: nuevas familias por mes (últimos 12).
 *
 * Inputs: { months?: number (default 12, max 24) }
 * Output: { months: { bucket: string (YYYY-MM), count: number }[] }
 *
 * Bucketing is done in JS over the returned rows (plan §10 — JS-side aggregation).
 *
 * K-anonymity (CAS-05 / themis BLOCKER 2): a monthly new-family count of 1–2
 * composes with the distrito breakdown to re-identify, so any non-zero count
 * below K_ANONYMITY_FLOOR is suppressed to null. A 0-count month stays 0 — a
 * zero reveals nobody (and the chart needs the empty month visible). Reuses the
 * SAME floor constant as every other report — no parallel mechanism.
 *
 * Compliance: adminProcedure. withSoftDeleteFilter. wrapDbError.
 */

import { z } from "zod";
import { router, adminProcedure } from "../../../_core/trpc";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import { K_ANONYMITY_FLOOR } from "../../../_core/mapaAggregation";
import { withSoftDeleteFilter, wrapDbError, logAuditReport } from "../_shared";

const InputSchema = z
  .object({
    months: z.number().int().min(1).max(24).optional(),
  })
  .optional();

export const evolucionHistoricaRouter = router({
  evolucionHistorica: adminProcedure
    .input(InputSchema)
    .query(async ({ ctx, input }) => {
      const db = createAdminClient();
      const numMonths = input?.months ?? 12;

      // Compute the start date: first day of (today - numMonths) months.
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth() - numMonths + 1, 1);

      const { data, error } = await withSoftDeleteFilter(
        db
          .from("families")
          .select("created_at")
          .gte("created_at", startDate.toISOString()),
      );

      if (error) {
        throw wrapDbError("reports.evolucionHistorica", error);
      }

      // Initialize all buckets for the period (so months with 0 families appear).
      const buckets = new Map<string, number>();
      for (let i = 0; i < numMonths; i++) {
        const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        buckets.set(key, 0);
      }

      // Bucket rows by YYYY-MM.
      for (const row of data ?? []) {
        const d = new Date(row.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (buckets.has(key)) {
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
      }

      // K-anonymity floor: suppress non-zero counts below the floor to null;
      // 0 stays 0 (reveals nobody). count is number | null on the wire.
      const months: { bucket: string; count: number | null }[] = Array.from(
        buckets.entries(),
      )
        .map(([bucket, count]) => ({
          bucket,
          count: count > 0 && count < K_ANONYMITY_FLOOR ? null : count,
        }))
        .sort((a, b) => a.bucket.localeCompare(b.bucket));

      logAuditReport(ctx, "reports.evolucionHistorica", months.length, {
        months: numMonths,
      });

      return { months };
    }),
});
