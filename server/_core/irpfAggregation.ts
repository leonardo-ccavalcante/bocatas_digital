/**
 * irpfAggregation.ts — Pure aggregation helpers for the IRPF annual
 * demographic breakdown of familia_miembros.
 *
 * No I/O; no Supabase imports. K_ANONYMITY_FLOOR reused from mapaAggregation
 * (single source of truth — locked to 3 by EIPD). Contract under test in
 * server/__tests__/irpf-aggregation.test.ts.
 */

import { K_ANONYMITY_FLOOR } from "./mapaAggregation";

// ─── Constants & types ───────────────────────────────────────────────────────

export const AGE_BRACKETS = [
  "0-10", "11-17", "18-30", "31-45", "46-65", "65+", "sin_fecha",
] as const;
export type AgeBracket = (typeof AGE_BRACKETS)[number];

export const GENDER_ORDER = [
  "masculino", "femenino", "no_binario", "prefiere_no_decir", "no_indicado",
] as const;
export type GenderKey = (typeof GENDER_ORDER)[number];

// IRPF/FSE education buckets (5). The 7 raw persons.nivel_estudios enum values
// are rolled up into these by ESTUDIOS_ROLLUP (bachillerato + FP →
// postsecundaria_no_superior; universitario + postgrado → superior).
export const ESTUDIOS_ORDER = [
  "sin_estudios", "primaria", "secundaria",
  "postsecundaria_no_superior", "superior", "no_indicado",
] as const;
export type EstudiosKey = (typeof ESTUDIOS_ORDER)[number];

// FSE/IRPF "situación ante el empleo" categories. The report's "laboral"
// dimension reads persons.situacion_ante_empleo (the router feeds it into the
// NormalizedMiembroRow.situacion_laboral field), NOT the employment-TYPE column.
export const LABORAL_ORDER = [
  "inactiva", "desempleo_subsidio_larga_duracion", "agotada_prestacion_subsidio",
  "precariedad_laboral", "no_aplica", "no_indicado",
] as const;
export type LaboralKey = (typeof LABORAL_ORDER)[number];

// RGPD Art. 9/10 special-category tags. Multi-valued → MARGINAL ONLY, never a
// cross-tab axis (a person can hold several, which would break the Σ=N partition
// and weaken k-anonymity).
export const COLECTIVO_ORDER = [
  "gitanos", "lgtbi", "sin_hogar", "reclusos_exreclusos",
] as const;
export type ColectivoKey = (typeof COLECTIVO_ORDER)[number];

/** Input row after DB fetch + person-field flatten (done by the router). */
export interface NormalizedMiembroRow {
  fecha_nacimiento: string | null;
  genero: string | null;
  nivel_estudios: string | null;
  // Carries persons.situacion_ante_empleo (FSE/IRPF status), fed by the router.
  situacion_laboral: string | null;
  pais_origen: string | null;
  // RGPD Art. 9/10 tags; multi-valued (marginal only).
  colectivos: string[];
}

/** Cross-tab leaf bucket — count is null when suppressed. */
export interface IrpfBucket {
  age_bracket: AgeBracket;
  genero: GenderKey;
  nivel_estudios: EstudiosKey;
  situacion_laboral: LaboralKey;
  pais_origen: string;
  count: number | null;
}

/** Raw (pre-suppression) bucket with a guaranteed numeric count. */
export type RawIrpfBucket = Omit<IrpfBucket, "count"> & { count: number };

/** One row of a marginal (1-D) breakdown. */
export interface MarginalRow { key: string; count: number | null; }

/** The five marginal breakdowns. */
export interface IrpfMarginals {
  age: MarginalRow[];
  genero: MarginalRow[];
  estudios: MarginalRow[];
  laboral: MarginalRow[];
  pais: MarginalRow[];
  colectivo: MarginalRow[];
}

export interface CrossTabResult { buckets: IrpfBucket[]; totalSuppressed: number; }
export interface MarginalsResult { marginals: IrpfMarginals; totalSuppressedMarginal: number; }

// ─── Module-scope membership sets (derived from order arrays — stay DRY) ────

const VALID_GENDER = new Set<string>(GENDER_ORDER.filter((k) => k !== "no_indicado"));
const VALID_LABORAL = new Set<string>(LABORAL_ORDER.filter((k) => k !== "no_indicado"));
const COLECTIVO_SET = new Set<string>(COLECTIVO_ORDER);

// Roll the 7 raw persons.nivel_estudios enum values up into the 5 IRPF/FSE
// education buckets. Anything unknown/null → "no_indicado".
const ESTUDIOS_ROLLUP: Record<string, EstudiosKey> = {
  sin_estudios: "sin_estudios",
  primaria: "primaria",
  secundaria: "secundaria",
  bachillerato: "postsecundaria_no_superior",
  formacion_profesional: "postsecundaria_no_superior",
  universitario: "superior",
  postgrado: "superior",
};

// ─── Internal normalizers ────────────────────────────────────────────────────

function normalizeGender(raw: string | null): GenderKey {
  if (raw === null || !VALID_GENDER.has(raw)) return "no_indicado";
  return raw as GenderKey;
}

function normalizeEstudios(raw: string | null): EstudiosKey {
  if (raw === null) return "no_indicado";
  return ESTUDIOS_ROLLUP[raw] ?? "no_indicado";
}

function normalizeLaboral(raw: string | null): LaboralKey {
  if (raw === null || !VALID_LABORAL.has(raw)) return "no_indicado";
  return raw as LaboralKey;
}

// ─── Public functions ────────────────────────────────────────────────────────

/**
 * Age bracket as of December 31 of the fiscal year (AEAT end-of-period
 * convention). null/invalid → "sin_fecha". Negative age → "0-10".
 * Brackets (full years): 0-10:[0..10] 11-17:[11..17] 18-30:[18..30]
 *                        31-45:[31..45] 46-65:[46..65] 65+:[>65]
 */
export function computeAgeBracket(
  fechaNacimiento: string | null,
  reportYear: number,
): AgeBracket {
  if (!fechaNacimiento) return "sin_fecha";
  const dob = new Date(fechaNacimiento);
  if (isNaN(dob.getTime())) return "sin_fecha";

  // Guard against silent date rollover (e.g. month 13 parsed as next January).
  const [, isoMonth, isoDay] = fechaNacimiento.split("-").map(Number);
  if (
    isoMonth === undefined || isoDay === undefined ||
    dob.getUTCMonth() + 1 !== isoMonth ||
    dob.getUTCDate() !== isoDay
  ) return "sin_fecha";

  const refDate = new Date(reportYear, 11, 31); // Dec 31 (local)
  let age = refDate.getFullYear() - dob.getUTCFullYear();
  if (new Date(reportYear, dob.getUTCMonth(), dob.getUTCDate()) > refDate) age -= 1;

  // Also covers negative ages (future DOB / data-entry error).
  if (age <= 10) return "0-10";
  if (age <= 17) return "11-17";
  if (age <= 30) return "18-30";
  if (age <= 45) return "31-45";
  if (age <= 65) return "46-65";
  return "65+";
}

/**
 * null/undefined/empty/whitespace → "no_indicado"; else trim + lowercase.
 * No alias mapping. The function is intentionally generic (operates on any
 * string); in production, real inputs are uppercase ISO-3166-1 alpha-2 codes
 * (e.g. "ES", "MA", "SN") as stored in `persons.pais_origen`.
 */
export function normalizeCountryKey(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "no_indicado";
  const trimmed = raw.trim();
  return trimmed === "" ? "no_indicado" : trimmed.toLowerCase();
}

/**
 * Bucket rows by the 5-dim composite key and count them. Returns raw
 * (unsuppressed) RawIrpfBucket[] with numeric counts.
 */
export function bucketRows(
  rows: ReadonlyArray<NormalizedMiembroRow>,
  reportYear: number,
): RawIrpfBucket[] {
  const map = new Map<string, RawIrpfBucket>();
  for (const r of rows) {
    const ab = computeAgeBracket(r.fecha_nacimiento, reportYear);
    const ge = normalizeGender(r.genero);
    const es = normalizeEstudios(r.nivel_estudios);
    const la = normalizeLaboral(r.situacion_laboral);
    const pa = normalizeCountryKey(r.pais_origen);
    const key = `${ab}|${ge}|${es}|${la}|${pa}`;
    const existing = map.get(key);
    if (existing !== undefined) {
      existing.count += 1;
    } else {
      map.set(key, { age_bracket: ab, genero: ge, nivel_estudios: es, situacion_laboral: la, pais_origen: pa, count: 1 });
    }
  }
  return Array.from(map.values());
}

/**
 * Apply k-anonymity to cross-tab buckets: count < K_ANONYMITY_FLOOR → null.
 * Suppressed buckets are RETAINED in the output array.
 */
export function applyKAnonymityToIrpf(raw: ReadonlyArray<RawIrpfBucket>): CrossTabResult {
  let totalSuppressed = 0;
  const buckets: IrpfBucket[] = raw.map((b) => {
    if (b.count < K_ANONYMITY_FLOOR) { totalSuppressed += 1; return { ...b, count: null }; }
    return { ...b };
  });
  return { buckets, totalSuppressed };
}

// ─── Marginals ───────────────────────────────────────────────────────────────

function applyKAnonToMarginalMap(
  raw: Map<string, number>,
  orderedKeys: readonly string[],
): { rows: MarginalRow[]; suppressed: number } {
  const rows: MarginalRow[] = [];
  let suppressed = 0;
  for (const key of orderedKeys) {
    const cnt = raw.get(key);
    if (cnt === undefined) continue;
    if (cnt < K_ANONYMITY_FLOOR) { suppressed += 1; rows.push({ key, count: null }); }
    else rows.push({ key, count: cnt });
  }
  return { rows, suppressed };
}

/**
 * Compute all five marginals with k-anonymity per cell. Ordering:
 *   age/genero/estudios/laboral — fixed enum order (no_indicado last, only observed keys).
 *   pais — count DESC, then key ASC.
 */
export function computeMarginals(
  rows: ReadonlyArray<NormalizedMiembroRow>,
  reportYear: number,
): MarginalsResult {
  const ageMap = new Map<AgeBracket, number>();
  const generoMap = new Map<GenderKey, number>();
  const estudiosMap = new Map<EstudiosKey, number>();
  const laboralMap = new Map<LaboralKey, number>();
  const paisMap = new Map<string, number>();
  const colectivoMap = new Map<string, number>();

  for (const r of rows) {
    const ab = computeAgeBracket(r.fecha_nacimiento, reportYear);
    const ge = normalizeGender(r.genero);
    const es = normalizeEstudios(r.nivel_estudios);
    const la = normalizeLaboral(r.situacion_laboral);
    const pa = normalizeCountryKey(r.pais_origen);
    ageMap.set(ab, (ageMap.get(ab) ?? 0) + 1);
    generoMap.set(ge, (generoMap.get(ge) ?? 0) + 1);
    estudiosMap.set(es, (estudiosMap.get(es) ?? 0) + 1);
    laboralMap.set(la, (laboralMap.get(la) ?? 0) + 1);
    paisMap.set(pa, (paisMap.get(pa) ?? 0) + 1);
    // colectivo is multi-valued: +1 per tag the person holds (distinct-persons-
    // per-tag). A person can contribute to several tags; empty → contributes to none.
    for (const tag of r.colectivos ?? []) {
      if (COLECTIVO_SET.has(tag)) colectivoMap.set(tag, (colectivoMap.get(tag) ?? 0) + 1);
    }
  }

  const ageResult     = applyKAnonToMarginalMap(ageMap,     AGE_BRACKETS);
  const generoResult  = applyKAnonToMarginalMap(generoMap,  GENDER_ORDER);
  const estudiosResult= applyKAnonToMarginalMap(estudiosMap,ESTUDIOS_ORDER);
  const laboralResult = applyKAnonToMarginalMap(laboralMap, LABORAL_ORDER);
  const colectivoResult = applyKAnonToMarginalMap(colectivoMap, COLECTIVO_ORDER);

  let paisSuppressed = 0;
  const pais: MarginalRow[] = [...paisMap.entries()]
    .sort(([ka, ca], [kb, cb]) => cb - ca || ka.localeCompare(kb))
    .map(([key, cnt]) => {
      if (cnt < K_ANONYMITY_FLOOR) { paisSuppressed += 1; return { key, count: null }; }
      return { key, count: cnt };
    });

  const totalSuppressedMarginal =
    ageResult.suppressed + generoResult.suppressed +
    estudiosResult.suppressed + laboralResult.suppressed + paisSuppressed +
    colectivoResult.suppressed;

  return {
    marginals: {
      age:     ageResult.rows,
      genero:  generoResult.rows,
      estudios:estudiosResult.rows,
      laboral: laboralResult.rows,
      pais,
      colectivo: colectivoResult.rows,
    },
    totalSuppressedMarginal,
  };
}
