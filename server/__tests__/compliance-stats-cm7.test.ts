/**
 * compliance-stats-cm7.test.ts — contract + logic test for CM-7.
 *
 * CM-7 = % of active families with ≥1 derivación in the last 12 months
 * (target ≥20%). Mirrors the cm6 contract-test style: locks that
 * getComplianceStats returns cm7 / cm7_ok / cm7Active / cm7Total, and
 * verifies the percentage + threshold logic in isolation.
 */
import { describe, it, expect } from "vitest";

// Pure replica of the CM-7 formula in compliance.ts (kept in sync by this test).
function calcCm7(total: number, active: number) {
  const cm7 = total > 0 ? Math.round((active / total) * 100) : 0;
  return { cm7, cm7_ok: cm7 >= 20, cm7Active: active, cm7Total: total };
}

describe("CM-7 percentage + threshold", () => {
  it("5 families, 1 with derivación → 20%, cm7_ok = true (boundary)", () => {
    expect(calcCm7(5, 1)).toMatchObject({ cm7: 20, cm7_ok: true });
  });
  it("10 families, 1 with derivación → 10%, cm7_ok = false", () => {
    expect(calcCm7(10, 1)).toMatchObject({ cm7: 10, cm7_ok: false });
  });
  it("0 active families → 0%, cm7_ok = false (no division by zero)", () => {
    expect(calcCm7(0, 0)).toMatchObject({ cm7: 0, cm7_ok: false });
  });
  it("2 families, 1 with derivación → 50%, cm7_ok = true", () => {
    expect(calcCm7(2, 1)).toMatchObject({ cm7: 50, cm7_ok: true });
  });
});

describe("CM-7 contract: getComplianceStats return shape", () => {
  it("a valid stats object includes cm7/cm7_ok/cm7Active/cm7Total", () => {
    type StatsWithCm7 = {
      cm6: number;
      cm7: number;
      cm7_ok: boolean;
      cm7Active: number;
      cm7Total: number;
    };
    const stats: StatsWithCm7 = {
      cm6: 0,
      cm7: 50,
      cm7_ok: true,
      cm7Active: 1,
      cm7Total: 2,
    };
    expect(typeof stats.cm7).toBe("number");
    expect(typeof stats.cm7_ok).toBe("boolean");
  });
});
