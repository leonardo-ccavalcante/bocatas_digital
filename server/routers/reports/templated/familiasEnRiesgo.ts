/**
 * templated/familiasEnRiesgo.ts — Familias con al menos un CM red flag.
 *
 * REUSE: Uses `hasComplianceRedFlag` from server/_core/mapaAggregation.ts.
 * The compliance logic is defined once and reused here (no duplication).
 *
 * Inputs: { estado?: "activa" | "all" } — defaults to "activa".
 * Output: { rows: family row[], total: number }
 *
 * Compliance: adminProcedure. withSoftDeleteFilter. wrapDbError.
 * PII: No high-risk fields selected.
 */

import { z } from "zod";
import { router, adminProcedure } from "../../../_core/trpc";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import { withSoftDeleteFilter, wrapDbError } from "../_shared";
import { hasComplianceRedFlag, type ComplianceFlags } from "../../../_core/mapaAggregation";

const InputSchema = z
  .object({
    estado: z.enum(["activa", "all"]).optional(),
  })
  .optional();

// Columns needed for the hasComplianceRedFlag check + display (no PII).
const FAMILIES_SELECT =
  "id, familia_numero, estado, distrito, " +
  "alta_en_guf, padron_recibido, informe_social, " +
  "consent_bocatas, consent_banco_alimentos, docs_identidad, " +
  "persons!titular_id(nombre, apellidos, telefono)";

interface FamilyRow extends ComplianceFlags {
  id: string;
  familia_numero: number;
  estado: string;
  distrito: string | null;
  persons: { nombre: string; apellidos: string | null; telefono: string | null } | null;
}

export const familiasEnRiesgoRouter = router({
  familiasEnRiesgo: adminProcedure
    .input(InputSchema)
    .query(async ({ input }) => {
      const db = createAdminClient();
      const estado = input?.estado ?? "activa";

      let q = db
        .from("families")
        .select(FAMILIES_SELECT)
        .is("deleted_at", null);

      if (estado === "activa") {
        q = q.eq("estado", "activa");
      }

      const { data, error } = await q.order("familia_numero", { ascending: true });

      if (error) {
        throw wrapDbError("reports.familiasEnRiesgo", error);
      }

      const rows = (data as unknown as FamilyRow[]) ?? [];
      const redFlagRows = rows.filter((r) => hasComplianceRedFlag(r));

      return {
        rows: redFlagRows,
        total: redFlagRows.length,
      };
    }),
});
