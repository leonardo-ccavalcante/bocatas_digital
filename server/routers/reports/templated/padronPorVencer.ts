/**
 * templated/padronPorVencer.ts — Familias cuyo padrón municipal vence próximamente.
 *
 * Logic: padron vence 180 days after padron_recibido_fecha (PADRON_RENEWAL_DAYS from compliance.ts).
 * "Vence en los próximos daysAhead días" means:
 *   padron_recibido_fecha + 180 days <= today + daysAhead
 *   ↔ padron_recibido_fecha <= (today + daysAhead) - 180 days
 *
 * Inputs: { daysAhead: number (1-365) }
 * Output: { rows: family row[] }
 *
 * Compliance: adminProcedure. withSoftDeleteFilter. wrapDbError.
 */

import { z } from "zod";
import { router, adminProcedure } from "../../../_core/trpc";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import { withSoftDeleteFilter, wrapDbError, logAuditReport } from "../_shared";
import { PADRON_RENEWAL_DAYS } from "../../families/compliance";

const InputSchema = z.object({
  daysAhead: z.number().int().min(1).max(365).default(30),
});

export const padronPorVencerRouter = router({
  padronPorVencer: adminProcedure
    .input(InputSchema)
    .query(async ({ ctx, input }) => {
      const db = createAdminClient();

      // cutoff: families whose padron expires within daysAhead from today.
      // padron_recibido_fecha + PADRON_RENEWAL_DAYS <= today + daysAhead
      // ↔ padron_recibido_fecha <= (today + daysAhead) - PADRON_RENEWAL_DAYS
      const today = new Date();
      const maxPadronDate = new Date(today);
      maxPadronDate.setDate(maxPadronDate.getDate() + input.daysAhead - PADRON_RENEWAL_DAYS);

      const { data, error } = await withSoftDeleteFilter(
        db
          .from("families")
          .select(
            "id, familia_numero, estado, padron_recibido, padron_recibido_fecha, distrito, " +
              "persons!titular_id(nombre, apellidos, telefono)",
          )
          .eq("estado", "activa")
          .eq("padron_recibido", true)
          .lte("padron_recibido_fecha", maxPadronDate.toISOString().split("T")[0])
          .order("padron_recibido_fecha", { ascending: true }),
      );

      if (error) {
        throw wrapDbError("reports.padronPorVencer", error);
      }

      const rows = data ?? [];
      logAuditReport(ctx, "reports.padronPorVencer", rows.length, {
        daysAhead: input.daysAhead,
      });

      return { rows };
    }),
});
