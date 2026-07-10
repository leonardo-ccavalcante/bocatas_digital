import { describe, it, expect } from "vitest";
import {
  isInformeStale,
  monthsSince,
  informeDocStatus,
  informeNeedsRenewal,
  INFORME_REVIEW_MONTHS,
  INFORME_EXPIRY_MONTHS,
} from "../informeFreshness";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe("isInformeStale (seguimiento gate — 6 months)", () => {
  it("is false for a recent follow-up (30 days ago)", () => {
    expect(isInformeStale(daysAgo(30))).toBe(false);
  });

  it("is false at ~4 months and true past 6 months", () => {
    expect(isInformeStale(daysAgo(120))).toBe(false); // ~4 months, fresh
    expect(isInformeStale(daysAgo(220))).toBe(true); // ~7 months, stale
  });
});

// Fixed "now" = 2026-07-08 (local) so these are deterministic.
const NOW = new Date(2026, 6, 8).getTime();

describe("informe document validity (5-month review / 6-month expiry)", () => {
  it("exposes the agreed thresholds", () => {
    expect(INFORME_REVIEW_MONTHS).toBe(5);
    expect(INFORME_EXPIRY_MONTHS).toBe(6);
  });

  it("monthsSince counts only whole calendar months", () => {
    expect(monthsSince("2026-07-01", NOW)).toBe(0);
    expect(monthsSince("2026-02-08", NOW)).toBe(5); // exactly 5 months
    expect(monthsSince("2026-02-09", NOW)).toBe(4); // one day short of 5
    expect(monthsSince("2026-01-08", NOW)).toBe(6);
  });

  it("classifies status by the 5/6-month rule", () => {
    expect(informeDocStatus(null, NOW)).toBe("sin_informe");
    expect(informeDocStatus("   ", NOW)).toBe("sin_informe");
    expect(informeDocStatus("2026-07-01", NOW)).toBe("al_dia"); // < 5 months
    expect(informeDocStatus("2026-03-08", NOW)).toBe("al_dia"); // 4 months
    expect(informeDocStatus("2026-02-08", NOW)).toBe("por_renovar"); // 5 months
    expect(informeDocStatus("2026-01-08", NOW)).toBe("vencido"); // 6 months
    expect(informeDocStatus("2025-01-08", NOW)).toBe("vencido"); // long overdue
  });

  it("needsRenewal is true for missing / due / expired, false only for al día", () => {
    expect(informeNeedsRenewal(null, NOW)).toBe(true); // sin informe
    expect(informeNeedsRenewal("2026-07-01", NOW)).toBe(false); // al día
    expect(informeNeedsRenewal("2026-02-08", NOW)).toBe(true); // por renovar
    expect(informeNeedsRenewal("2026-01-08", NOW)).toBe(true); // vencido
  });
});
