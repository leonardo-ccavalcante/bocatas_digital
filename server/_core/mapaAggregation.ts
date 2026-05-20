/**
 * mapaAggregation.ts — Pure aggregation helpers for mapa.distritoStats.
 *
 * Split from the router so aggregation correctness + k-anonymity
 * enforcement can be unit-tested without a Supabase instance
 * (Karpathy step 4: regularize via test-first via pure-function
 * extraction).
 *
 * Contract — covered by server/__tests__/mapa-aggregation.test.ts:
 *   • K_ANONYMITY_FLOOR is locked to 3 (EIPD principle — public-facing
 *     choropleth must not surface counts below the floor).
 *   • distritoKeyOf normalizes null/unknown distrito values into a
 *     "sin_asignar" bucket so families with NULL distrito are visible
 *     in the operational sense (count of unassigned) without polluting
 *     a real distrito's count.
 *   • hasComplianceRedFlag treats any single missing CM-1..CM-6 flag
 *     (including null) as a red flag.
 *   • Compliance suppression is stricter: when count < floor, BOTH the
 *     count AND the compliance ratio are suppressed (otherwise the
 *     ratio + small N is re-identifiable).
 */

import { isDistritoSlug, type DistritoSlug } from "../../shared/madrid/distritos";

/**
 * K-anonymity floor for surfaced counts. Locked at 3 by the parallel-
 * implementation plan §3 (D5 Karpathy lens — root-cause-first compliance)
 * and by the EIPD discipline that aggregate dashboards must not enable
 * re-identification of an individual family.
 */
export const K_ANONYMITY_FLOOR = 3;

/**
 * Output distrito key — extends the 21-distrito enum with a "sin_asignar"
 * bucket for families whose codigo_postal is NULL or outside Madrid.
 */
export type AggregationDistrito = DistritoSlug | "sin_asignar";

/**
 * Compliance flag shape (subset of families table columns). Each field is
 * nullable to match the DB schema; null is treated as missing data and
 * therefore a red flag (defensive: never assume null means "OK").
 */
export interface ComplianceFlags {
  alta_en_guf: boolean | null;
  padron_recibido: boolean | null;
  informe_social: boolean | null;
  consent_bocatas: boolean | null;
  consent_banco_alimentos: boolean | null;
  docs_identidad: boolean | null;
}

/**
 * Family row shape used by both densidad and compliance aggregation. Both
 * layers consume the same input shape so we never refetch.
 */
export interface FamilyForAggregation extends ComplianceFlags {
  distrito: string | null;
}

/**
 * Type alias used by tests to disambiguate; structurally identical to
 * FamilyForAggregation.
 */
export type ComplianceAggregationInput = FamilyForAggregation;

/**
 * Normalize a raw distrito column value (potentially null or an unknown
 * string) to a canonical AggregationDistrito key. Defensive against DB
 * drift: any value that is not a recognized DistritoSlug falls into
 * "sin_asignar".
 */
export function distritoKeyOf(distrito: string | null): AggregationDistrito {
  if (!distrito) return "sin_asignar";
  return isDistritoSlug(distrito) ? distrito : "sin_asignar";
}

/**
 * Returns true when ANY single CM-1..CM-6 flag is missing or false.
 * Null is treated as a red flag (missing data). One source of truth for
 * the compliance signal surfaced by the map.
 */
export function hasComplianceRedFlag(flags: ComplianceFlags): boolean {
  return (
    !flags.alta_en_guf ||
    !flags.padron_recibido ||
    !flags.informe_social ||
    !flags.consent_bocatas ||
    !flags.consent_banco_alimentos ||
    !flags.docs_identidad
  );
}

/**
 * Bucket families by distrito and count them. Returns a Map for cheap
 * downstream iteration; callers convert to the wire shape via
 * applyKAnonymityToDensidad.
 */
export function aggregateDensidad(
  families: ReadonlyArray<FamilyForAggregation>,
): Map<AggregationDistrito, number> {
  const counts = new Map<AggregationDistrito, number>();
  for (const family of families) {
    const key = distritoKeyOf(family.distrito);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Bucket families by distrito and tally total + conRiesgo (red-flagged).
 * conRiesgo is the count of families with at least one CM-X red flag.
 */
export function aggregateCompliance(
  families: ReadonlyArray<FamilyForAggregation>,
): Map<AggregationDistrito, { total: number; conRiesgo: number }> {
  const map = new Map<AggregationDistrito, { total: number; conRiesgo: number }>();
  for (const family of families) {
    const key = distritoKeyOf(family.distrito);
    const entry = map.get(key) ?? { total: 0, conRiesgo: 0 };
    entry.total += 1;
    if (hasComplianceRedFlag(family)) entry.conRiesgo += 1;
    map.set(key, entry);
  }
  return map;
}

/** Wire shape for a densidad row. */
export interface DensidadOutputRow {
  distrito: AggregationDistrito;
  count: number | null;
}

/** Wire shape for a compliance row. */
export interface ComplianceOutputRow {
  distrito: AggregationDistrito;
  count: number | null;
  compliance?: number;
}

/**
 * Convert a densidad count Map to wire rows, applying the k-anonymity
 * floor: any distrito with count < K_ANONYMITY_FLOOR returns count=null.
 */
export function applyKAnonymityToDensidad(
  counts: ReadonlyMap<AggregationDistrito, number>,
): DensidadOutputRow[] {
  const rows: DensidadOutputRow[] = [];
  for (const [distrito, count] of counts) {
    rows.push({
      distrito,
      count: count < K_ANONYMITY_FLOOR ? null : count,
    });
  }
  return rows;
}

/**
 * Convert a compliance Map to wire rows. K-anonymity suppression is
 * stricter here: when total < K_ANONYMITY_FLOOR, BOTH count AND
 * compliance ratio are suppressed (count → null, compliance → omitted).
 * Otherwise compliance = (total - conRiesgo) / total in [0, 1].
 */
export function applyKAnonymityToCompliance(
  counts: ReadonlyMap<AggregationDistrito, { total: number; conRiesgo: number }>,
): ComplianceOutputRow[] {
  const rows: ComplianceOutputRow[] = [];
  for (const [distrito, { total, conRiesgo }] of counts) {
    if (total < K_ANONYMITY_FLOOR) {
      rows.push({ distrito, count: null });
      continue;
    }
    const compliance = (total - conRiesgo) / total;
    rows.push({ distrito, count: total, compliance });
  }
  return rows;
}
