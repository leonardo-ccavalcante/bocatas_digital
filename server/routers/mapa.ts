/**
 * Mapa router — Stage S3 server-mapa Feature Agent (Karpathy canary).
 *
 * Expands the S2 thin slice into real aggregation against the families
 * table (M1+M2 distrito column). Pure aggregation + k-anonymity
 * enforcement live in server/_core/mapaAggregation.ts and are covered
 * by server/__tests__/mapa-aggregation.test.ts. This file is the thin
 * DB layer + tRPC contract.
 *
 * Output contract:
 *   distritoStats({ layer })
 *     → { rows: DistritoStatRow[], layer, kAnonymityFloor: 3 }
 *
 *   Each row is { distrito, count, compliance? } where:
 *     • distrito is one of the 21 Madrid slugs OR "sin_asignar"
 *     • count is the family count, or null when below the k-anonymity
 *       floor (EIPD principle for public-facing aggregates)
 *     • compliance is only set on the compliance layer (ratio in [0, 1])
 *       and is also suppressed when count < floor
 *
 * Role: adminProcedure — Mapa is funder-facing strategic data, not
 * voluntario-facing operational data (per Phase 2 plan §3 Compliance).
 */

import { randomUUID } from "crypto";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createAdminClient } from "../../client/src/lib/supabase/server";
import { DISTRITO_SLUGS } from "../../shared/madrid/distritos";
import {
  K_ANONYMITY_FLOOR,
  aggregateCompliance,
  aggregateDensidad,
  applyKAnonymityToCompliance,
  applyKAnonymityToDensidad,
  type AggregationDistrito,
  type ComplianceFlags,
  type FamilyForAggregation,
} from "../_core/mapaAggregation";
import { adminProcedure, router } from "../_core/trpc";

/**
 * Seed all 21 Madrid distritos into a densidad count map (SAT P2-2).
 * Distritos absent from the data get 0 — so after k-anonymity a 0-family
 * distrito is indistinguishable from a 1-or-2-family (suppressed) one,
 * removing the presence-vs-absence info leak. "sin_asignar" is intentionally
 * NOT seeded — it is not one of the 21 Madrid distritos.
 */
function seedDensidad(
  counts: ReadonlyMap<AggregationDistrito, number>,
): Map<AggregationDistrito, number> {
  const seeded = new Map<AggregationDistrito, number>();
  for (const slug of DISTRITO_SLUGS) {
    seeded.set(slug, counts.get(slug) ?? 0);
  }
  return seeded;
}

/** Compliance analogue of seedDensidad (SAT P2-2). */
function seedCompliance(
  counts: ReadonlyMap<AggregationDistrito, { total: number; conRiesgo: number }>,
): Map<AggregationDistrito, { total: number; conRiesgo: number }> {
  const seeded = new Map<AggregationDistrito, { total: number; conRiesgo: number }>();
  for (const slug of DISTRITO_SLUGS) {
    seeded.set(slug, counts.get(slug) ?? { total: 0, conRiesgo: 0 });
  }
  return seeded;
}

const layerSchema = z.enum(["densidad", "compliance"]).default("densidad");

export const distritoStatRowSchema = z.object({
  distrito: z.enum(DISTRITO_SLUGS),
  count: z.number().int().nullable(),
  compliance: z.number().min(0).max(1).optional(),
});

export type DistritoStatRow = z.infer<typeof distritoStatRowSchema>;

const distritoStatsOutputSchema = z.object({
  rows: z.array(distritoStatRowSchema),
  layer: layerSchema,
  kAnonymityFloor: z.number().int().positive(),
});

/**
 * Columns selected from the families table for aggregation. Keep this
 * narrow — defense-in-depth + bandwidth control. No PII fields cross
 * the wire (we only count).
 */
const FAMILIES_SELECT =
  "distrito, alta_en_guf, padron_recibido, informe_social, " +
  "consent_bocatas, consent_banco_alimentos, docs_identidad";

interface FamiliesRow extends ComplianceFlags {
  distrito: string | null;
}

export const mapaRouter = router({
  /**
   * Aggregate active families per Madrid distrito with k-anonymity floor.
   *
   * Densidad layer: row.count (or null when <floor).
   * Compliance layer: row.count + row.compliance ratio (both suppressed
   * when total <floor — ratio alone is re-identifying on small N).
   */
  distritoStats: adminProcedure
    .input(
      z
        .object({
          layer: layerSchema.optional(),
        })
        .optional(),
    )
    .output(distritoStatsOutputSchema)
    .query(async ({ input }) => {
      const layer = input?.layer ?? "densidad";
      const db = createAdminClient();

      const { data, error } = await db
        .from("families")
        .select(FAMILIES_SELECT)
        .eq("estado", "activa")
        .is("deleted_at", null)
        .returns<FamiliesRow[]>();

      if (error) {
        // C-05: never echo the raw Supabase message to the client (can contain
        // PII / schema internals). Log server-side; return a generic message.
        const correlationId = randomUUID();
        console.error(
          `[mapa.distritoStats] DB error ${correlationId}: ${error.code ?? "?"} ${error.message}`,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error interno del servidor (${correlationId}). Inténtalo de nuevo.`,
        });
      }

      const families: FamilyForAggregation[] = (data ?? []).map((row) => ({
        distrito: row.distrito,
        alta_en_guf: row.alta_en_guf,
        padron_recibido: row.padron_recibido,
        informe_social: row.informe_social,
        consent_bocatas: row.consent_bocatas,
        consent_banco_alimentos: row.consent_banco_alimentos,
        docs_identidad: row.docs_identidad,
      }));

      // Seed all 21 distritos (P2-2) then apply k-anonymity. The output
      // always contains exactly the 21 Madrid distritos; "sin_asignar"
      // (families with NULL distrito) is excluded by seeding only
      // DISTRITO_SLUGS — it is an operational signal for the families/ops
      // view, not the funder-facing map.
      const aggregated =
        layer === "compliance"
          ? applyKAnonymityToCompliance(seedCompliance(aggregateCompliance(families)))
          : applyKAnonymityToDensidad(seedDensidad(aggregateDensidad(families)));

      // Type narrowing only — seeding guarantees no "sin_asignar" at runtime.
      const rows: DistritoStatRow[] = aggregated.filter(
        (row): row is DistritoStatRow => row.distrito !== "sin_asignar",
      );

      return {
        rows,
        layer,
        kAnonymityFloor: K_ANONYMITY_FLOOR,
      };
    }),
});

export type MapaRouter = typeof mapaRouter;
