/**
 * mapa-aggregation.test.ts — TDD RED tests for the pure aggregation
 * helpers that back the mapa.distritoStats procedure.
 *
 * Stage S3 server-mapa Feature Agent (Karpathy canary). The procedure is
 * deliberately split into:
 *   • a thin DB-query layer in server/routers/mapa.ts
 *   • pure aggregation helpers in server/_core/mapaAggregation.ts
 *
 * The split is what makes these tests possible WITHOUT a live Supabase
 * instance: aggregation correctness + k-anonymity enforcement live in
 * pure functions that take a `families[]` and return rows. RLS + the
 * Supabase fetch are tested separately at the router-shape layer
 * (mapa-router.test.ts) with vi.mock.
 *
 * Contract under test (RED → GREEN when mapaAggregation.ts lands):
 *   1. K_ANONYMITY_FLOOR is 3 (locked by EIPD principle — a public-facing
 *      choropleth must not surface counts under the floor).
 *   2. distritoKeyOf normalizes null/unknown → "sin_asignar"; valid slugs
 *      pass through.
 *   3. hasComplianceRedFlag detects ANY single missing CM-1..CM-6 flag.
 *   4. aggregateDensidad buckets correctly including "sin_asignar".
 *   5. aggregateCompliance returns total + conRiesgo per bucket.
 *   6. applyKAnonymityToDensidad suppresses count → null when count < floor.
 *   7. applyKAnonymityToCompliance suppresses count AND compliance ratio
 *      when count < floor (compliance ratio + small N = re-identifiable).
 *   8. Compliance ratio is (total - conRiesgo) / total, bounded [0, 1].
 */

import { describe, it, expect } from "vitest";

import {
  K_ANONYMITY_FLOOR,
  aggregateCompliance,
  aggregateDensidad,
  applyKAnonymityToCompliance,
  applyKAnonymityToDensidad,
  distritoKeyOf,
  hasComplianceRedFlag,
  type ComplianceAggregationInput,
  type FamilyForAggregation,
} from "../_core/mapaAggregation";

// ─── Fixture helpers ────────────────────────────────────────────────────

function fam(overrides: Partial<FamilyForAggregation> = {}): FamilyForAggregation {
  return {
    distrito: "centro",
    alta_en_guf: true,
    padron_recibido: true,
    informe_social: true,
    consent_bocatas: true,
    consent_banco_alimentos: true,
    docs_identidad: true,
    ...overrides,
  };
}

// ─── 1. K_ANONYMITY_FLOOR is locked to 3 ────────────────────────────────

describe("K_ANONYMITY_FLOOR", () => {
  it("equals 3 — locked by EIPD principle for public-facing aggregates", () => {
    expect(K_ANONYMITY_FLOOR).toBe(3);
  });
});

// ─── 2. distritoKeyOf normalization ─────────────────────────────────────

describe("distritoKeyOf — distrito-column normalization", () => {
  it("maps null to 'sin_asignar'", () => {
    expect(distritoKeyOf(null)).toBe("sin_asignar");
  });

  it("maps empty string to 'sin_asignar'", () => {
    expect(distritoKeyOf("")).toBe("sin_asignar");
  });

  it("passes through a valid DistritoSlug unchanged", () => {
    expect(distritoKeyOf("centro")).toBe("centro");
    expect(distritoKeyOf("carabanchel")).toBe("carabanchel");
    expect(distritoKeyOf("san-blas-canillejas")).toBe("san-blas-canillejas");
  });

  it("maps unknown string to 'sin_asignar' (defensive — never trust DB content)", () => {
    expect(distritoKeyOf("not-a-real-distrito")).toBe("sin_asignar");
    expect(distritoKeyOf("CENTRO")).toBe("sin_asignar"); // wrong case
  });
});

// ─── 3. hasComplianceRedFlag — one missing CM flag → red ────────────────

describe("hasComplianceRedFlag — any single missing flag is a red flag", () => {
  it("returns false when ALL six compliance flags are true", () => {
    expect(hasComplianceRedFlag(fam())).toBe(false);
  });

  it("returns true when alta_en_guf is false", () => {
    expect(hasComplianceRedFlag(fam({ alta_en_guf: false }))).toBe(true);
  });

  it("returns true when padron_recibido is false", () => {
    expect(hasComplianceRedFlag(fam({ padron_recibido: false }))).toBe(true);
  });

  it("returns true when informe_social is false", () => {
    expect(hasComplianceRedFlag(fam({ informe_social: false }))).toBe(true);
  });

  it("returns true when consent_bocatas is false", () => {
    expect(hasComplianceRedFlag(fam({ consent_bocatas: false }))).toBe(true);
  });

  it("returns true when consent_banco_alimentos is false", () => {
    expect(hasComplianceRedFlag(fam({ consent_banco_alimentos: false }))).toBe(true);
  });

  it("returns true when docs_identidad is false", () => {
    expect(hasComplianceRedFlag(fam({ docs_identidad: false }))).toBe(true);
  });

  it("treats null booleans as false (missing data = red flag)", () => {
    expect(
      hasComplianceRedFlag(fam({ alta_en_guf: null, padron_recibido: null })),
    ).toBe(true);
  });
});

// ─── 4. aggregateDensidad — bucket families by distrito ─────────────────

describe("aggregateDensidad — counts families per distrito bucket", () => {
  it("returns empty map for empty input", () => {
    const result = aggregateDensidad([]);
    expect(result.size).toBe(0);
  });

  it("counts a single family in its distrito", () => {
    const result = aggregateDensidad([fam({ distrito: "centro" })]);
    expect(result.get("centro")).toBe(1);
  });

  it("sums families within the same distrito", () => {
    const result = aggregateDensidad([
      fam({ distrito: "centro" }),
      fam({ distrito: "centro" }),
      fam({ distrito: "centro" }),
    ]);
    expect(result.get("centro")).toBe(3);
  });

  it("buckets across multiple distritos", () => {
    const result = aggregateDensidad([
      fam({ distrito: "centro" }),
      fam({ distrito: "centro" }),
      fam({ distrito: "carabanchel" }),
      fam({ distrito: "vicalvaro" }),
    ]);
    expect(result.get("centro")).toBe(2);
    expect(result.get("carabanchel")).toBe(1);
    expect(result.get("vicalvaro")).toBe(1);
  });

  it("buckets null and unknown distritos into 'sin_asignar'", () => {
    const result = aggregateDensidad([
      fam({ distrito: null }),
      fam({ distrito: null }),
      fam({ distrito: "imaginary-distrito" }),
    ]);
    expect(result.get("sin_asignar")).toBe(3);
  });
});

// ─── 5. aggregateCompliance — total + conRiesgo per distrito ────────────

function complianceInput(
  overrides: Partial<ComplianceAggregationInput> = {},
): ComplianceAggregationInput {
  return { ...fam(), ...overrides };
}

describe("aggregateCompliance — total + conRiesgo per distrito", () => {
  it("returns empty map for empty input", () => {
    expect(aggregateCompliance([]).size).toBe(0);
  });

  it("tallies total and zero conRiesgo when all families are compliant", () => {
    const result = aggregateCompliance([
      complianceInput({ distrito: "centro" }),
      complianceInput({ distrito: "centro" }),
      complianceInput({ distrito: "centro" }),
    ]);
    expect(result.get("centro")).toEqual({ total: 3, conRiesgo: 0 });
  });

  it("counts a family with any missing flag as conRiesgo", () => {
    const result = aggregateCompliance([
      complianceInput({ distrito: "centro", padron_recibido: false }),
      complianceInput({ distrito: "centro" }),
    ]);
    expect(result.get("centro")).toEqual({ total: 2, conRiesgo: 1 });
  });

  it("separates buckets per distrito", () => {
    const result = aggregateCompliance([
      complianceInput({ distrito: "centro", alta_en_guf: false }),
      complianceInput({ distrito: "centro" }),
      complianceInput({ distrito: "carabanchel" }),
      complianceInput({ distrito: "carabanchel", docs_identidad: false }),
    ]);
    expect(result.get("centro")).toEqual({ total: 2, conRiesgo: 1 });
    expect(result.get("carabanchel")).toEqual({ total: 2, conRiesgo: 1 });
  });

  it("collapses null and unknown distritos into 'sin_asignar' bucket", () => {
    const result = aggregateCompliance([
      complianceInput({ distrito: null, informe_social: false }),
      complianceInput({ distrito: "fake-distrito" }),
    ]);
    expect(result.get("sin_asignar")).toEqual({ total: 2, conRiesgo: 1 });
  });
});

// ─── 6. applyKAnonymityToDensidad — count < floor → null ────────────────

describe("applyKAnonymityToDensidad — k-anonymity floor 3", () => {
  it("returns count=null for a distrito with 1 family", () => {
    const counts = new Map([["centro", 1]] as const);
    const rows = applyKAnonymityToDensidad(counts);
    const centro = rows.find((r) => r.distrito === "centro");
    expect(centro?.count).toBeNull();
  });

  it("returns count=null for a distrito with 2 families (still under floor)", () => {
    const counts = new Map([["centro", 2]] as const);
    const rows = applyKAnonymityToDensidad(counts);
    expect(rows.find((r) => r.distrito === "centro")?.count).toBeNull();
  });

  it("returns count=3 for a distrito at the floor (count == floor)", () => {
    const counts = new Map([["centro", 3]] as const);
    const rows = applyKAnonymityToDensidad(counts);
    expect(rows.find((r) => r.distrito === "centro")?.count).toBe(3);
  });

  it("returns the real count for distritos comfortably above the floor", () => {
    const counts = new Map([["centro", 12]] as const);
    const rows = applyKAnonymityToDensidad(counts);
    expect(rows.find((r) => r.distrito === "centro")?.count).toBe(12);
  });

  it("preserves the distrito key (including 'sin_asignar')", () => {
    const counts = new Map([
      ["centro", 5],
      ["sin_asignar", 1],
    ] as const);
    const rows = applyKAnonymityToDensidad(counts);
    expect(rows.map((r) => r.distrito).sort()).toEqual(
      ["centro", "sin_asignar"].sort(),
    );
  });
});

// ─── 7. applyKAnonymityToCompliance — both fields suppressed under floor ─

describe("applyKAnonymityToCompliance — both count + compliance suppressed under floor", () => {
  it("returns count=null AND compliance=undefined when total < floor", () => {
    const counts = new Map([["centro", { total: 2, conRiesgo: 1 }]] as const);
    const rows = applyKAnonymityToCompliance(counts);
    const centro = rows.find((r) => r.distrito === "centro");
    expect(centro?.count).toBeNull();
    expect(centro?.compliance).toBeUndefined();
  });

  it("returns count=total AND compliance ratio when total >= floor", () => {
    const counts = new Map([["centro", { total: 10, conRiesgo: 2 }]] as const);
    const rows = applyKAnonymityToCompliance(counts);
    const centro = rows.find((r) => r.distrito === "centro");
    expect(centro?.count).toBe(10);
    // compliance ratio = (total - conRiesgo) / total = 8/10 = 0.8
    expect(centro?.compliance).toBeCloseTo(0.8, 4);
  });

  it("returns compliance=1 when all families are compliant", () => {
    const counts = new Map([["centro", { total: 5, conRiesgo: 0 }]] as const);
    const rows = applyKAnonymityToCompliance(counts);
    expect(rows.find((r) => r.distrito === "centro")?.compliance).toBe(1);
  });

  it("returns compliance=0 when no family is compliant", () => {
    const counts = new Map([["centro", { total: 5, conRiesgo: 5 }]] as const);
    const rows = applyKAnonymityToCompliance(counts);
    expect(rows.find((r) => r.distrito === "centro")?.compliance).toBe(0);
  });

  it("clamps compliance to [0, 1]", () => {
    const counts = new Map([["centro", { total: 10, conRiesgo: 3 }]] as const);
    const rows = applyKAnonymityToCompliance(counts);
    const ratio = rows.find((r) => r.distrito === "centro")?.compliance;
    expect(ratio).toBeGreaterThanOrEqual(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });
});
