import { describe, it, expect } from "vitest";
import { isInformeStale, STALE_INFORME_DAYS } from "../informeFreshness";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe("isInformeStale", () => {
  it("is false for a recent follow-up (30 days ago)", () => {
    expect(isInformeStale(daysAgo(30))).toBe(false);
  });

  it("is true for a follow-up older than the threshold (400 days ago)", () => {
    expect(isInformeStale(daysAgo(400))).toBe(true);
  });

  it("is false just under the threshold and true just over it", () => {
    // Dates truncate to UTC midnight, so avoid the exact-day boundary (fuzzy by
    // the current time-of-day). 364 days is unambiguously fresh, 367 stale.
    expect(isInformeStale(daysAgo(STALE_INFORME_DAYS - 1))).toBe(false);
    expect(isInformeStale(daysAgo(STALE_INFORME_DAYS + 2))).toBe(true);
  });

  it("exposes a single 365-day threshold constant", () => {
    expect(STALE_INFORME_DAYS).toBe(365);
  });
});
