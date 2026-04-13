import { describe, it, expect } from "vitest";

/**
 * Compliance metric helpers — mirrors the logic in getComplianceStats procedure
 */

/** CM-1: Family missing BdeA consent */
function isMissingBdeAConsent(consentBancoAlimentos: boolean): boolean {
  return !consentBancoAlimentos;
}

/** CM-2: Social report older than 330 days */
function isSocialReportExpired(
  informeSocial: boolean,
  informeSocialFecha: string | null,
  today: Date = new Date()
): boolean {
  if (!informeSocial || !informeSocialFecha) return false;
  const reportDate = new Date(informeSocialFecha);
  const diffMs = today.getTime() - reportDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > 330;
}

/** CM-3: GUF not registered or stale (>30 days since verification) */
function isGufIssue(
  altaEnGuf: boolean,
  gufVerifiedAt: string | null,
  today: Date = new Date()
): boolean {
  if (!altaEnGuf) return true;
  if (!gufVerifiedAt) return true;
  const verified = new Date(gufVerifiedAt);
  const diffMs = today.getTime() - verified.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > 30;
}

/** CM-5: No delivery in 60+ days */
function hasNoRecentDelivery(
  lastDeliveryDate: string | null,
  today: Date = new Date()
): boolean {
  if (!lastDeliveryDate) return true;
  const last = new Date(lastDeliveryDate);
  const diffMs = today.getTime() - last.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > 60;
}

describe("CM-1: Missing BdeA consent", () => {
  it("returns true when consent is false", () => {
    expect(isMissingBdeAConsent(false)).toBe(true);
  });

  it("returns false when consent is true", () => {
    expect(isMissingBdeAConsent(true)).toBe(false);
  });
});

describe("CM-2: Social report expiry", () => {
  const TODAY = new Date("2026-04-13");

  it("returns false when no informe social", () => {
    expect(isSocialReportExpired(false, null, TODAY)).toBe(false);
  });

  it("returns false when informe social is recent (< 330 days)", () => {
    expect(isSocialReportExpired(true, "2025-12-01", TODAY)).toBe(false);
  });

  it("returns true when informe social is older than 330 days", () => {
    // 2025-04-13 is exactly 365 days before 2026-04-13
    expect(isSocialReportExpired(true, "2025-04-01", TODAY)).toBe(true);
  });

  it("returns false when informe social fecha is null (no date set)", () => {
    expect(isSocialReportExpired(true, null, TODAY)).toBe(false);
  });
});

describe("CM-3: GUF issues", () => {
  const TODAY = new Date("2026-04-13");

  it("returns true when alta_en_guf is false", () => {
    expect(isGufIssue(false, null, TODAY)).toBe(true);
  });

  it("returns true when alta_en_guf is true but no verification date", () => {
    expect(isGufIssue(true, null, TODAY)).toBe(true);
  });

  it("returns false when verified within 30 days", () => {
    expect(isGufIssue(true, "2026-04-01", TODAY)).toBe(false);
  });

  it("returns true when verified more than 30 days ago", () => {
    expect(isGufIssue(true, "2026-03-01", TODAY)).toBe(true);
  });
});

describe("CM-5: No recent delivery", () => {
  const TODAY = new Date("2026-04-13");

  it("returns true when no delivery ever", () => {
    expect(hasNoRecentDelivery(null, TODAY)).toBe(true);
  });

  it("returns false when last delivery was recent (< 60 days)", () => {
    expect(hasNoRecentDelivery("2026-03-15", TODAY)).toBe(false);
  });

  it("returns true when last delivery was more than 60 days ago", () => {
    expect(hasNoRecentDelivery("2026-02-01", TODAY)).toBe(true);
  });

  it("returns false when last delivery was exactly 59 days ago", () => {
    const date59DaysAgo = new Date(TODAY);
    date59DaysAgo.setDate(date59DaysAgo.getDate() - 59);
    expect(hasNoRecentDelivery(date59DaysAgo.toISOString().split("T")[0], TODAY)).toBe(false);
  });

  it("returns true when last delivery was exactly 61 days ago", () => {
    const date61DaysAgo = new Date(TODAY);
    date61DaysAgo.setDate(date61DaysAgo.getDate() - 61);
    expect(hasNoRecentDelivery(date61DaysAgo.toISOString().split("T")[0], TODAY)).toBe(true);
  });
});
