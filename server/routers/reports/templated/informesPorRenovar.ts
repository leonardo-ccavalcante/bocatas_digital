/**
 * templated/informesPorRenovar.ts — Familias cuyo informe social está próximo a renovación.
 *
 * Logic: informe social se renueva cada INFORME_REVIEW_MONTHS (5) meses — the
 * single source of truth in shared/informeFreshness.
 * "Renueva en los próximos daysAhead días" means:
 *   informe_social_fecha + 5 meses <= today + daysAhead
 *   ↔ informe_social_fecha <= (today + daysAhead) - 5 meses
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
import { INFORME_REVIEW_MONTHS } from "@shared/informeFreshness";

const InputSchema = z.object({
  daysAhead: z.number().int().min(1).max(365).default(30),
});

export const informesPorRenovarRouter = router({
  informesPorRenovar: adminProcedure
    .input(InputSchema)
    .query(async ({ ctx, input }) => {
      const db = createAdminClient();

      // informe_social_fecha + INFORME_REVIEW_MONTHS <= today + daysAhead
      const today = new Date();
      const maxInformeDate = new Date(today);
      maxInformeDate.setDate(maxInformeDate.getDate() + input.daysAhead);
      maxInformeDate.setMonth(maxInformeDate.getMonth() - INFORME_REVIEW_MONTHS);

      const { data, error } = await withSoftDeleteFilter(
        db
          .from("families")
          .select(
            "id, familia_numero, estado, informe_social, informe_social_fecha, distrito, " +
              "persons!titular_id(nombre, apellidos, telefono)",
          )
          .eq("estado", "activa")
          .eq("informe_social", true)
          .lte("informe_social_fecha", maxInformeDate.toISOString().split("T")[0])
          .order("informe_social_fecha", { ascending: true }),
      );

      if (error) {
        throw wrapDbError("reports.informesPorRenovar", error);
      }

      const rows = data ?? [];
      logAuditReport(ctx, "reports.informesPorRenovar", rows.length, {
        daysAhead: input.daysAhead,
      });

      return { rows };
    }),
});
