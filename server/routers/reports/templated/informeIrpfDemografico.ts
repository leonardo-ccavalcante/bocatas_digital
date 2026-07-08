/**
 * templated/informeIrpfDemografico.ts — Informe demográfico IRPF/FSE anual.
 *
 * Denominator (decision 2026-07-08): the WHOLE registered population (`persons`)
 * that was ATTENDED during the fiscal year — i.e. has ≥1 check-in
 * (attendances.checked_in_date) within [year-01-01, year-12-31]. This replaced
 * the previous familia_miembros-only source so the general registration form
 * actually feeds the funder report.
 *
 * Inputs: { year: number (2020–2099) }
 * Output: {
 *   year,
 *   totalMiembros,   // count of persons in the report (attended during `year`)
 *   marginals: { age, genero, estudios, laboral, pais, colectivo },
 *   crossTab: IrpfBucket[],
 *   totalSuppressed,
 *   totalSuppressedMarginal,
 * }
 *
 * Compliance: adminProcedure only. wrapDbError on failure. Output is aggregate-
 * only + k-anonymity ≥3; no row-level person data leaves the server. The
 * "laboral" dimension reads persons.situacion_ante_empleo (FSE/IRPF status);
 * "colectivo" is a MARGINAL-only breakdown of the Art. 9/10 tags.
 */

import { z } from "zod";
import { router, adminProcedure } from "../../../_core/trpc";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import { wrapDbError, logAuditReport } from "../_shared";
import {
  bucketRows,
  applyKAnonymityToIrpf,
  computeMarginals,
} from "../../../_core/irpfAggregation";
import type { NormalizedMiembroRow } from "../../../_core/irpfAggregation";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Shape returned by PostgREST for each persons row (demographic fields only). */
type RawPersonRow = {
  id: string;
  fecha_nacimiento: string | null;
  genero: string | null;
  nivel_estudios: string | null;
  situacion_ante_empleo: string | null;
  pais_origen: string | null;
  colectivos: string[] | null;
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function toNormalizedRow(raw: RawPersonRow): NormalizedMiembroRow {
  return {
    fecha_nacimiento: raw.fecha_nacimiento,
    genero: raw.genero,
    nivel_estudios: raw.nivel_estudios,
    // The report's "laboral" dimension is the FSE/IRPF status ante el empleo.
    situacion_laboral: raw.situacion_ante_empleo,
    pais_origen: raw.pais_origen,
    colectivos: raw.colectivos ?? [],
  };
}

// ─── Input schema ─────────────────────────────────────────────────────────────

/**
 * `year` now has TWO effects:
 *   - Scopes the population to persons attended during the fiscal year (≥1
 *     check-in with checked_in_date in [year-01-01, year-12-31]).
 *   - Age-bracket classification (age as of Dec 31 of `year`, AEAT convention).
 *
 * "Atendido" = comedor/programa check-in (attendances), aligned with the North
 * Star metric. If the funder later defines "served" differently (e.g. program
 * enrollment), confirm with Familia stakeholders (Espe/Nacho) before changing.
 */
const InputSchema = z.object({
  year: z.number().int().min(2020).max(2099),
});

const EMPTY_MARGINALS = {
  age: [], genero: [], estudios: [], laboral: [], pais: [], colectivo: [],
};

// ─── Router ───────────────────────────────────────────────────────────────────

export const informeIrpfDemograficoRouter = router({
  informeIrpfDemografico: adminProcedure
    .input(InputSchema)
    .query(async ({ ctx, input }) => {
      const { year } = input;
      const db = createAdminClient();

      const start = `${year}-01-01`;
      const end = `${year}-12-31`;

      // Population = persons with ≥1 non-deleted check-in during the fiscal year.
      // `attendances!inner` + the embedded date filter scopes persons to those
      // attended in [start, end]; each person is returned once. persons.deleted_at
      // intentionally NOT filtered (aggregate-only k-anon posture, consistent
      // with sibling reports); soft-deleted check-ins ARE excluded.
      const { data, error } = await db
        .from("persons")
        .select(
          "id, fecha_nacimiento, genero, nivel_estudios, situacion_ante_empleo, pais_origen, colectivos, attendances!inner(checked_in_date)",
        )
        .gte("attendances.checked_in_date", start)
        .lte("attendances.checked_in_date", end)
        .is("attendances.deleted_at", null)
        .returns<RawPersonRow[]>();

      if (error) {
        throw wrapDbError("reports.informeIrpfDemografico", error);
      }

      const rawRows = data ?? [];
      const normalized = rawRows.map(toNormalizedRow);
      const { buckets: crossTab, totalSuppressed } = applyKAnonymityToIrpf(
        bucketRows(normalized, year),
      );
      const { marginals, totalSuppressedMarginal } =
        normalized.length === 0
          ? { marginals: EMPTY_MARGINALS, totalSuppressedMarginal: 0 }
          : computeMarginals(normalized, year);

      logAuditReport(ctx, "reports.informeIrpfDemografico", rawRows.length, {
        year,
        totalSuppressed,
        totalSuppressedMarginal,
      });

      return {
        year,
        totalMiembros: rawRows.length,
        marginals,
        crossTab,
        totalSuppressed,
        totalSuppressedMarginal,
      };
    }),
});
