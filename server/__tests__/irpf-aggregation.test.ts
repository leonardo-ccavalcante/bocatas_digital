/**
 * irpf-aggregation.test.ts — TDD RED/GREEN tests for the pure IRPF
 * demographic aggregation helpers.
 *
 * Stage E2 IRPF Feature Agent (Karpathy TDD). The module under test is
 * deliberately pure (no I/O, no Supabase imports) so that aggregation
 * correctness, k-anonymity enforcement, and ordering rules can be
 * validated without a live DB instance.
 *
 * Contract under test (RED → GREEN when irpfAggregation.ts lands):
 *   1. computeAgeBracket uses AEAT Dec-31 convention (age as of Dec 31 of
 *      the fiscal year). null/invalid → "sin_fecha". Negative age → "0-10".
 *   2. normalizeCountryKey: null/empty/whitespace → "no_indicado";
 *      otherwise trim + lowercase.
 *   3. bucketRows groups rows into the 5-dim composite key with numeric counts.
 *   4. applyKAnonymityToIrpf: count < K_ANONYMITY_FLOOR → null (bucket
 *      retained); totalSuppressed tallied correctly.
 *   5. computeMarginals: five 1-D breakdowns with k-anon per cell, correct
 *      ordering, and "no_indicado" fallback for null person fields.
 */

import { describe, it, expect } from "vitest";

import {
  AGE_BRACKETS,
  computeAgeBracket,
  normalizeCountryKey,
  bucketRows,
  applyKAnonymityToIrpf,
  computeMarginals,
  type NormalizedMiembroRow,
  type AgeBracket,
} from "../_core/irpfAggregation";

// ─── Fixture helper ──────────────────────────────────────────────────────────

const YEAR = 2025; // reference fiscal year for all age tests

function row(overrides: Partial<NormalizedMiembroRow> = {}): NormalizedMiembroRow {
  return {
    fecha_nacimiento: `${YEAR - 30}-06-15`, // default: 30 yo on Jun 15
    genero: "masculino",
    nivel_estudios: "primaria",
    situacion_laboral: "desempleado",
    pais_origen: "ES", // realistic ISO-3166-1 alpha-2 code (uppercase from DB)
    ...overrides,
  };
}

// ─── 1. computeAgeBracket (AEAT Dec-31 convention) ──────────────────────────

describe("computeAgeBracket — AEAT end-of-period (Dec 31) convention", () => {
  it("AGE_BRACKETS tuple is stable and ordered correctly", () => {
    expect(AGE_BRACKETS).toEqual([
      "0-10", "11-17", "18-30", "31-45", "46-65", "65+", "sin_fecha",
    ]);
  });

  it("returns 'sin_fecha' for null fecha_nacimiento", () => {
    expect(computeAgeBracket(null, YEAR)).toBe("sin_fecha");
  });

  it("returns 'sin_fecha' for an invalid date string", () => {
    expect(computeAgeBracket("not-a-date", YEAR)).toBe("sin_fecha");
    expect(computeAgeBracket("", YEAR)).toBe("sin_fecha");
    expect(computeAgeBracket("2025-13-01", YEAR)).toBe("sin_fecha"); // month 13
  });

  it("returns '0-10' for a child born mid-year (age 0 on Dec 31)", () => {
    // Born Jun 15 of the report year → 0 years old on Dec 31
    expect(computeAgeBracket(`${YEAR}-06-15`, YEAR)).toBe("0-10");
  });

  it("returns '0-10' for a future dob (negative age clamps to 0-10)", () => {
    expect(computeAgeBracket(`${YEAR + 1}-01-01`, YEAR)).toBe("0-10");
  });

  // Bracket boundary: 10 → "0-10", 11 → "11-17"
  it("bracket boundary 10/11: age=10 → '0-10', age=11 → '11-17'", () => {
    // Born Jan 1, YEAR-10 → turns 10 on Jan 1; Dec 31 of YEAR → still 10
    expect(computeAgeBracket(`${YEAR - 10}-01-01`, YEAR)).toBe("0-10");
    // Born Jan 1, YEAR-11 → 11 on Jan 1; Dec 31 → 11
    expect(computeAgeBracket(`${YEAR - 11}-01-01`, YEAR)).toBe("11-17");
  });

  // Bracket boundary: 17 → "11-17", 18 → "18-30"
  it("bracket boundary 17/18: age=17 → '11-17', age=18 → '18-30'", () => {
    expect(computeAgeBracket(`${YEAR - 17}-01-01`, YEAR)).toBe("11-17");
    expect(computeAgeBracket(`${YEAR - 18}-01-01`, YEAR)).toBe("18-30");
  });

  // Bracket boundary: 30 → "18-30", 31 → "31-45"
  it("bracket boundary 30/31: age=30 → '18-30', age=31 → '31-45'", () => {
    expect(computeAgeBracket(`${YEAR - 30}-01-01`, YEAR)).toBe("18-30");
    expect(computeAgeBracket(`${YEAR - 31}-01-01`, YEAR)).toBe("31-45");
  });

  // Bracket boundary: 45 → "31-45", 46 → "46-65"
  it("bracket boundary 45/46: age=45 → '31-45', age=46 → '46-65'", () => {
    expect(computeAgeBracket(`${YEAR - 45}-01-01`, YEAR)).toBe("31-45");
    expect(computeAgeBracket(`${YEAR - 46}-01-01`, YEAR)).toBe("46-65");
  });

  // Bracket boundary: 65 → "46-65", 66 → "65+"
  it("bracket boundary 65/66: age=65 → '46-65', age=66 → '65+'", () => {
    expect(computeAgeBracket(`${YEAR - 65}-01-01`, YEAR)).toBe("46-65");
    expect(computeAgeBracket(`${YEAR - 66}-01-01`, YEAR)).toBe("65+");
  });

  it("Dec-31 birthday case: born Dec 31 exactly 11 years ago → '11-17'", () => {
    // Born Dec 31, YEAR-11 → turns 11 on Dec 31 of YEAR (same day as reference)
    expect(computeAgeBracket(`${YEAR - 11}-12-31`, YEAR)).toBe("11-17");
  });

  it("age=100 → '65+'", () => {
    expect(computeAgeBracket(`${YEAR - 100}-01-01`, YEAR)).toBe("65+");
  });
});

// ─── 2. normalizeCountryKey ──────────────────────────────────────────────────

describe("normalizeCountryKey — lowercase + trim, null/empty → no_indicado", () => {
  it("returns 'no_indicado' for null", () => {
    expect(normalizeCountryKey(null)).toBe("no_indicado");
  });

  it("returns 'no_indicado' for empty string", () => {
    expect(normalizeCountryKey("")).toBe("no_indicado");
  });

  it("returns 'no_indicado' for whitespace-only string", () => {
    expect(normalizeCountryKey("   ")).toBe("no_indicado");
  });

  it("returns 'no_indicado' for undefined", () => {
    expect(normalizeCountryKey(undefined)).toBe("no_indicado");
  });

  it("trims and lowercases '  España  ' → 'españa'", () => {
    expect(normalizeCountryKey("  España  ")).toBe("españa");
  });

  it("lowercases 'Marruecos' → 'marruecos'", () => {
    expect(normalizeCountryKey("Marruecos")).toBe("marruecos");
  });

  it("lowercases already-lowercase value unchanged", () => {
    expect(normalizeCountryKey("mali")).toBe("mali");
  });
});

// ─── 3. bucketRows + applyKAnonymityToIrpf ──────────────────────────────────

describe("bucketRows — 5-dim composite bucketing", () => {
  it("returns [] for empty input", () => {
    expect(bucketRows([], YEAR)).toEqual([]);
  });

  it("produces a single bucket for 3 identical rows", () => {
    const rows = [row(), row(), row()];
    const buckets = bucketRows(rows, YEAR);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].count).toBe(3);
  });

  it("produces 2 buckets for rows differing only in genero", () => {
    const rows = [
      row({ genero: "masculino" }),
      row({ genero: "femenino" }),
    ];
    const buckets = bucketRows(rows, YEAR);
    expect(buckets).toHaveLength(2);
    const genders = buckets.map((b) => b.genero).sort();
    expect(genders).toEqual(["femenino", "masculino"]);
  });

  it("null fecha_nacimiento produces 'sin_fecha' bucket", () => {
    const buckets = bucketRows([row({ fecha_nacimiento: null })], YEAR);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].age_bracket).toBe("sin_fecha");
  });

  it("null pais_origen maps to 'no_indicado' pais key", () => {
    const buckets = bucketRows([row({ pais_origen: null })], YEAR);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].pais_origen).toBe("no_indicado");
  });
});

describe("applyKAnonymityToIrpf — count < floor → null; buckets retained", () => {
  it("count=3 is preserved (at floor), totalSuppressed=0", () => {
    const raw = bucketRows([row(), row(), row()], YEAR);
    const { buckets, totalSuppressed } = applyKAnonymityToIrpf(raw);
    expect(buckets[0].count).toBe(3);
    expect(totalSuppressed).toBe(0);
  });

  it("count=2 → null, totalSuppressed=1", () => {
    const raw = bucketRows([row(), row()], YEAR);
    const { buckets, totalSuppressed } = applyKAnonymityToIrpf(raw);
    expect(buckets[0].count).toBeNull();
    expect(totalSuppressed).toBe(1);
  });

  it("count=1 → null, totalSuppressed=1", () => {
    const raw = bucketRows([row()], YEAR);
    const { buckets, totalSuppressed } = applyKAnonymityToIrpf(raw);
    expect(buckets[0].count).toBeNull();
    expect(totalSuppressed).toBe(1);
  });

  it("suppressed buckets are RETAINED in output (not removed)", () => {
    const raw = bucketRows([row()], YEAR);
    const { buckets } = applyKAnonymityToIrpf(raw);
    expect(buckets).toHaveLength(1); // still there, count=null
  });

  it("mixed visible+suppressed: totalSuppressed counts only suppressed cells", () => {
    // 3 identical rows (visible) + 2 rows with different genero (suppressed)
    const rows = [
      row({ genero: "masculino" }),
      row({ genero: "masculino" }),
      row({ genero: "masculino" }),
      row({ genero: "femenino" }),
      row({ genero: "femenino" }),
    ];
    const raw = bucketRows(rows, YEAR);
    const { buckets, totalSuppressed } = applyKAnonymityToIrpf(raw);
    // masculino bucket: count=3 → visible
    // femenino bucket:  count=2 → suppressed
    expect(buckets).toHaveLength(2);
    const masc = buckets.find((b) => b.genero === "masculino");
    const fem  = buckets.find((b) => b.genero === "femenino");
    expect(masc?.count).toBe(3);
    expect(fem?.count).toBeNull();
    expect(totalSuppressed).toBe(1);
  });
});

// ─── 4. computeMarginals ────────────────────────────────────────────────────

describe("computeMarginals — five 1-D breakdowns with k-anon + ordering", () => {
  /**
   * Dataset (7 rows) designed so we can hand-compute every tally.
   * pais_origen values are realistic ISO-3166-1 alpha-2 codes (uppercase,
   * as stored in the DB). normalizeCountryKey lowercases them for bucketing.
   *
   *  Row | fecha_nacimiento (age on Dec31/2025) | genero    | estudios       | laboral        | pais
   *   A  | 1985-06-15 (40 yo) → "31-45"        | masculino | primaria       | desempleado    | ES
   *   B  | 1985-06-15 (40 yo) → "31-45"        | masculino | primaria       | desempleado    | ES
   *   C  | 1985-06-15 (40 yo) → "31-45"        | masculino | primaria       | desempleado    | ES
   *   D  | 1990-01-01 (35 yo) → "31-45"        | femenino  | secundaria     | economia_informal | MA
   *   E  | 1990-01-01 (35 yo) → "31-45"        | femenino  | secundaria     | economia_informal | MA
   *   F  | 2010-01-01 (15 yo) → "11-17"        | no_binario| bachillerato   | en_formacion   | SN
   *   G  | null                                 | null      | null           | null           | null
   *
   * Marginal tallies (before k-anon) — after normalizeCountryKey (lowercase):
   *   age:     "31-45"=5, "11-17"=1, "sin_fecha"=1
   *   genero:  masculino=3, femenino=2, no_binario=1, no_indicado=1
   *   estudios: primaria=3, secundaria=2, bachillerato=1, no_indicado=1
   *   laboral: desempleado=3, economia_informal=2, en_formacion=1, no_indicado=1
   *   pais:    es=3, ma=2, sn=1, no_indicado=1
   *
   * After k-anon (floor=3): any cell with count<3 → null
   *   age:     "31-45"=5(ok), "11-17"=null, "sin_fecha"=null  → totalSuppressedMarginal += 2
   *   genero:  masculino=3(ok), femenino=null, no_binario=null, no_indicado=null → += 3
   *   estudios: primaria=3(ok), secundaria=null, bachillerato=null, no_indicado=null → += 3
   *   laboral: desempleado=3(ok), economia_informal=null, en_formacion=null, no_indicado=null → += 3
   *   pais:    es=3(ok), ma=null, sn=null, no_indicado=null → += 3
   *   Total suppressed marginal cells = 2+3+3+3+3 = 14
   */

  const DATASET: NormalizedMiembroRow[] = [
    // A, B, C
    { fecha_nacimiento: "1985-06-15", genero: "masculino", nivel_estudios: "primaria",    situacion_laboral: "desempleado",       pais_origen: "ES" },
    { fecha_nacimiento: "1985-06-15", genero: "masculino", nivel_estudios: "primaria",    situacion_laboral: "desempleado",       pais_origen: "ES" },
    { fecha_nacimiento: "1985-06-15", genero: "masculino", nivel_estudios: "primaria",    situacion_laboral: "desempleado",       pais_origen: "ES" },
    // D, E
    { fecha_nacimiento: "1990-01-01", genero: "femenino",  nivel_estudios: "secundaria",  situacion_laboral: "economia_informal", pais_origen: "MA" },
    { fecha_nacimiento: "1990-01-01", genero: "femenino",  nivel_estudios: "secundaria",  situacion_laboral: "economia_informal", pais_origen: "MA" },
    // F
    { fecha_nacimiento: "2010-01-01", genero: "no_binario",nivel_estudios: "bachillerato",situacion_laboral: "en_formacion",      pais_origen: "SN" },
    // G — all nulls
    { fecha_nacimiento: null,         genero: null,         nivel_estudios: null,          situacion_laboral: null,               pais_origen: null },
  ];

  it("totalSuppressedMarginal = 14 (every cell < 3 across all 5 dimensions)", () => {
    const { totalSuppressedMarginal } = computeMarginals(DATASET, YEAR);
    expect(totalSuppressedMarginal).toBe(14);
  });

  it("age marginal: '31-45'=5 visible; '11-17' and 'sin_fecha' suppressed (null)", () => {
    const { marginals } = computeMarginals(DATASET, YEAR);
    const ageLookup = Object.fromEntries(marginals.age.map((r) => [r.key, r.count]));
    expect(ageLookup["31-45"]).toBe(5);
    expect(ageLookup["11-17"]).toBeNull();
    expect(ageLookup["sin_fecha"]).toBeNull();
  });

  it("age marginal respects AGE_BRACKETS order (only observed keys)", () => {
    const { marginals } = computeMarginals(DATASET, YEAR);
    const ageKeys = marginals.age.map((r) => r.key);
    // Observed: 31-45 (idx 3), 11-17 (idx 1), sin_fecha (idx 6)
    // After ordering by AGE_BRACKETS position: 11-17, 31-45, sin_fecha
    const expectedOrder: AgeBracket[] = ["11-17", "31-45", "sin_fecha"];
    expect(ageKeys).toEqual(expectedOrder);
  });

  it("genero marginal: masculino=3 visible; femenino, no_binario, no_indicado suppressed", () => {
    const { marginals } = computeMarginals(DATASET, YEAR);
    const g = Object.fromEntries(marginals.genero.map((r) => [r.key, r.count]));
    expect(g["masculino"]).toBe(3);
    expect(g["femenino"]).toBeNull();
    expect(g["no_binario"]).toBeNull();
    expect(g["no_indicado"]).toBeNull();
  });

  it("genero marginal: 'no_indicado' appears last in ordering", () => {
    const { marginals } = computeMarginals(DATASET, YEAR);
    const gKeys = marginals.genero.map((r) => r.key);
    expect(gKeys[gKeys.length - 1]).toBe("no_indicado");
  });

  it("estudios marginal: primaria=3 visible; others suppressed", () => {
    const { marginals } = computeMarginals(DATASET, YEAR);
    const e = Object.fromEntries(marginals.estudios.map((r) => [r.key, r.count]));
    expect(e["primaria"]).toBe(3);
    expect(e["secundaria"]).toBeNull();
    expect(e["bachillerato"]).toBeNull();
    expect(e["no_indicado"]).toBeNull();
  });

  it("laboral marginal: desempleado=3 visible; others suppressed", () => {
    const { marginals } = computeMarginals(DATASET, YEAR);
    const l = Object.fromEntries(marginals.laboral.map((r) => [r.key, r.count]));
    expect(l["desempleado"]).toBe(3);
    expect(l["economia_informal"]).toBeNull();
    expect(l["en_formacion"]).toBeNull();
    expect(l["no_indicado"]).toBeNull();
  });

  it("pais marginal: es=3 visible; others suppressed (ISO-2 codes normalised to lowercase)", () => {
    const { marginals } = computeMarginals(DATASET, YEAR);
    const p = Object.fromEntries(marginals.pais.map((r) => [r.key, r.count]));
    expect(p["es"]).toBe(3);
    expect(p["ma"]).toBeNull();
    expect(p["sn"]).toBeNull();
    expect(p["no_indicado"]).toBeNull();
  });

  it("pais marginal is ordered count DESC then key ASC (es first)", () => {
    const { marginals } = computeMarginals(DATASET, YEAR);
    expect(marginals.pais[0].key).toBe("es");
  });

  it("pais marginal: full key sequence is count-DESC then key-ASC (verifies tie-break)", () => {
    const { marginals } = computeMarginals(DATASET, YEAR);
    // es=3 (count DESC) → ma=2 → no_indicado=1 ties sn=1 → ASC → no_indicado < sn
    const paisKeys = marginals.pais.map((r) => r.key);
    expect(paisKeys).toEqual(["es", "ma", "no_indicado", "sn"]);
  });

  it("all-null row contributes to 'no_indicado' in genero, estudios, laboral, pais marginals", () => {
    const { marginals } = computeMarginals(DATASET, YEAR);
    const gKeys = marginals.genero.map((r) => r.key);
    const eKeys = marginals.estudios.map((r) => r.key);
    const lKeys = marginals.laboral.map((r) => r.key);
    const pKeys = marginals.pais.map((r) => r.key);
    expect(gKeys).toContain("no_indicado");
    expect(eKeys).toContain("no_indicado");
    expect(lKeys).toContain("no_indicado");
    expect(pKeys).toContain("no_indicado");
  });

  it("all-null row contributes to 'sin_fecha' in age marginal", () => {
    const { marginals } = computeMarginals(DATASET, YEAR);
    const ageKeys = marginals.age.map((r) => r.key);
    expect(ageKeys).toContain("sin_fecha");
  });
});
