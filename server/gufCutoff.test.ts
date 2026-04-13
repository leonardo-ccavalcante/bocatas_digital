import { describe, it, expect } from "vitest";

/**
 * gufCutoff — determines if a family's GUF status needs verification
 * based on the cutoff day of the month.
 *
 * Rules:
 * - If today is >= cutoff day AND guf_verified_at is from before this month's cutoff → stale
 * - If guf_verified_at is null → always stale (needs verification)
 * - If alta_en_guf is false → not applicable (returns false)
 */
function isGufStale(
  altaEnGuf: boolean,
  gufVerifiedAt: string | null,
  cutoffDay: number,
  today: Date = new Date()
): boolean {
  if (!altaEnGuf) return false;
  if (!gufVerifiedAt) return true;

  const verified = new Date(gufVerifiedAt);
  const thisMonthCutoff = new Date(today.getFullYear(), today.getMonth(), cutoffDay);

  // If today is before this month's cutoff, check against last month's cutoff
  if (today < thisMonthCutoff) {
    const lastMonthCutoff = new Date(today.getFullYear(), today.getMonth() - 1, cutoffDay);
    return verified < lastMonthCutoff;
  }

  // Today is on or after this month's cutoff
  return verified < thisMonthCutoff;
}

describe("isGufStale", () => {
  const JAN_15 = new Date(2026, 0, 15); // Jan 15, 2026

  it("returns false when alta_en_guf is false", () => {
    expect(isGufStale(false, null, 10, JAN_15)).toBe(false);
    expect(isGufStale(false, "2026-01-01", 10, JAN_15)).toBe(false);
  });

  it("returns true when alta_en_guf is true and guf_verified_at is null", () => {
    expect(isGufStale(true, null, 10, JAN_15)).toBe(true);
  });

  it("returns false when verified after this month's cutoff and today is after cutoff", () => {
    // Today: Jan 15, cutoff: 10, verified: Jan 12 → after cutoff, not stale
    expect(isGufStale(true, "2026-01-12", 10, JAN_15)).toBe(false);
  });

  it("returns true when verified before this month's cutoff and today is after cutoff", () => {
    // Today: Jan 15, cutoff: 10, verified: Jan 5 → before cutoff, stale
    expect(isGufStale(true, "2026-01-05", 10, JAN_15)).toBe(true);
  });

  it("returns false when today is before cutoff and verified after last month cutoff", () => {
    // Today: Jan 5, cutoff: 10, verified: Dec 12 → after last month cutoff (Dec 10), not stale
    const JAN_5 = new Date(2026, 0, 5);
    expect(isGufStale(true, "2025-12-12", 10, JAN_5)).toBe(false);
  });

  it("returns true when today is before cutoff and verified before last month cutoff", () => {
    // Today: Jan 5, cutoff: 10, verified: Dec 8 → before last month cutoff (Dec 10), stale
    const JAN_5 = new Date(2026, 0, 5);
    expect(isGufStale(true, "2025-12-08", 10, JAN_5)).toBe(true);
  });

  it("handles cutoff day 1 (first of month)", () => {
    // Today: Jan 15, cutoff: 1, verified: Jan 2 → after cutoff, not stale
    expect(isGufStale(true, "2026-01-02", 1, JAN_15)).toBe(false);
    // verified: Dec 31 → before this month's cutoff (Jan 1), stale
    expect(isGufStale(true, "2025-12-31", 1, JAN_15)).toBe(true);
  });

  it("handles cutoff day 31 (end of month)", () => {
    // Today: Jan 15, cutoff: 31, today is before cutoff
    // last month cutoff: Dec 31, verified: Jan 1 → after Dec 31, not stale
    expect(isGufStale(true, "2026-01-01", 31, JAN_15)).toBe(false);
  });
});
