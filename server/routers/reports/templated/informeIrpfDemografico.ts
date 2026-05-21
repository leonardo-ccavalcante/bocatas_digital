/**
 * templated/informeIrpfDemografico.ts — Informe demográfico IRPF anual
 * de miembros familiares activos (familia_miembros).
 *
 * Inputs: { year: number (2020–2099) }
 * Output: {
 *   year,
 *   totalMiembros,
 *   marginals: { age, genero, estudios, laboral, pais },
 *   crossTab: IrpfBucket[],
 *   totalSuppressed,
 *   totalSuppressedMarginal,
 * }
 *
 * Compliance: adminProcedure only. withSoftDeleteFilter applied. wrapDbError on failure.
 * PII: NEVER includes situacion_legal, foto_documento_url, recorrido_migratorio.
 *      Output is aggregate-only; no row-level person data leaves the server.
 */

import { z } from "zod";
import { router, adminProcedure } from "../../../_core/trpc";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import { withSoftDeleteFilter, wrapDbError } from "../_shared";
import {
  bucketRows,
  applyKAnonymityToIrpf,
  computeMarginals,
} from "../../../_core/irpfAggregation";
import type { NormalizedMiembroRow } from "../../../_core/irpfAggregation";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Shape returned by PostgREST for each familia_miembro row. */
type RawMiembroRow = {
  id: string;
  fecha_nacimiento: string | null;
  persons: {
    genero: string | null;
    nivel_estudios: string | null;
    situacion_laboral: string | null;
    pais_origen: string | null;
  } | null;
};

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Flatten the nested persons FK into NormalizedMiembroRow.
 *
 * Defensive array-guard: PostgREST returns an object for single-row FK joins,
 * but if the runtime ever returns an array (schema drift), take [0] ?? null
 * before reading fields. null persons → all person fields null.
 */
function flattenPersonFields(raw: RawMiembroRow): NormalizedMiembroRow {
  const personsRaw = Array.isArray(raw.persons)
    ? (raw.persons[0] ?? null)
    : raw.persons;

  return {
    fecha_nacimiento: raw.fecha_nacimiento,
    genero: personsRaw?.genero ?? null,
    nivel_estudios: personsRaw?.nivel_estudios ?? null,
    situacion_laboral: personsRaw?.situacion_laboral ?? null,
    pais_origen: personsRaw?.pais_origen ?? null,
  };
}

// ─── Input schema ─────────────────────────────────────────────────────────────

/**
 * Temporal semantics of `year`:
 *   - The report counts ALL current `estado='activo'` familia_miembros — it is
 *     NOT filtered by when members joined. `year` affects ONLY age-bracket
 *     classification (age computed as of Dec 31 of `year`, AEAT convention).
 *   - Historical fiscal-year membership scoping (e.g. a `created_at`/period
 *     filter to include only members active during that year) is a deliberate
 *     FUTURE decision to confirm with Familia stakeholders (Espe/Nacho) before
 *     implementing. Do NOT add a `created_at` filter here without that sign-off.
 */
const InputSchema = z.object({
  year: z.number().int().min(2020).max(2099),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const informeIrpfDemograficoRouter = router({
  informeIrpfDemografico: adminProcedure
    .input(InputSchema)
    .query(async ({ input }) => {
      const { year } = input;
      const db = createAdminClient();

      // F-D note: `withSoftDeleteFilter` applies `familia_miembros.deleted_at IS NULL` only.
      // The joined `persons` table is intentionally NOT filtered on `persons.deleted_at` —
      // this is consistent with sibling reports. Because output is aggregate-only (k-anon),
      // the residual statistical contribution of a soft-deleted person is an accepted EIPD posture.
      const { data, error } = await withSoftDeleteFilter(
        db
          .from("familia_miembros")
          .select(
            "id, fecha_nacimiento, persons!person_id(genero, nivel_estudios, situacion_laboral, pais_origen)",
          )
          .eq("estado", "activo"),
      ).returns<RawMiembroRow[]>();

      if (error) {
        throw wrapDbError("reports.informeIrpfDemografico", error);
      }

      const rawRows = data ?? [];
      const normalized = rawRows.map(flattenPersonFields);
      const { buckets: crossTab, totalSuppressed } = applyKAnonymityToIrpf(
        bucketRows(normalized, year),
      );
      const { marginals, totalSuppressedMarginal } = computeMarginals(normalized, year);

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
