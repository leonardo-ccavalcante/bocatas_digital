/**
 * templated/familiasAtendidas.ts — Familias atendidas por período.
 *
 * Inputs: { from: ISO date, to: ISO date }
 * Output: { rows: family row[], meta: { totalFamilias, totalPersonas } }
 *
 * Compliance: adminProcedure only. withSoftDeleteFilter applied. wrapDbError on failure.
 * PII: No high-risk fields (situacion_legal, foto_documento_url, recorrido_migratorio).
 */

import { z } from "zod";
import { router, adminProcedure } from "../../../_core/trpc";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import { wrapDbError } from "../_shared";

const InputSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date (YYYY-MM-DD)"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date (YYYY-MM-DD)"),
});

export const familiasAtendidasRouter = router({
  familiasAtendidas: adminProcedure
    .input(InputSchema)
    .query(async ({ input }) => {
      const db = createAdminClient();

      const q = db
        .from("families")
        .select(
          "id, familia_numero, estado, num_adultos, num_menores_18, distrito, created_at, " +
            "persons!titular_id(nombre, apellidos)",
        )
        .gte("created_at", input.from)
        .lte("created_at", input.to + "T23:59:59.999Z")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      const { data, error } = await q;

      if (error) {
        throw wrapDbError("reports.familiasAtendidas", error);
      }

      type FamiliaRow = {
        id: string;
        familia_numero: number;
        estado: string;
        num_adultos: number | null;
        num_menores_18: number | null;
        distrito: string | null;
        created_at: string;
        persons: { nombre: string; apellidos: string | null } | null;
      };

      const rows = (data as unknown as FamiliaRow[]) ?? [];
      const totalFamilias = rows.length;
      const totalPersonas = rows.reduce(
        (sum, f) => sum + (f.num_adultos ?? 0) + (f.num_menores_18 ?? 0),
        0,
      );

      return {
        rows,
        meta: { totalFamilias, totalPersonas },
      };
    }),
});
