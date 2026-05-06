/**
 * renewal.alerts.test.ts — Phase B.6.2 RED test.
 *
 * Locks the renewal-alert helper logic that feeds the existing
 * compliance dashboard (CM-2 already wired for 330-day informe social;
 * this test extends to padrón at 180 days).
 *
 * Pattern source: server/familiesCompliance.test.ts — pure helper unit
 * tests, no Supabase mocking. The procedure in
 * server/routers/families/compliance.ts uses the same date-cutoff math
 * and so this lock holds the same invariants the procedure must obey.
 */
import { describe, it, expect } from "vitest";
import {
  isInformeSocialRenewalDue,
  isPadronRenewalDue,
  collectRenewalAlerts,
  PADRON_RENEWAL_DAYS,
  INFORME_SOCIAL_RENEWAL_DAYS,
} from "../routers/families/compliance";

const TODAY = new Date("2026-05-06");

function daysAgo(days: number, ref: Date = TODAY): string {
  const d = new Date(ref);
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

describe("renewal cadence constants", () => {
  it("locks the 330-day informe social cutoff", () => {
    expect(INFORME_SOCIAL_RENEWAL_DAYS).toBe(330);
  });

  it("locks the 180-day padrón cutoff", () => {
    expect(PADRON_RENEWAL_DAYS).toBe(180);
  });
});

describe("isInformeSocialRenewalDue", () => {
  it("returns false when informe social is not on file", () => {
    expect(isInformeSocialRenewalDue(false, null, TODAY)).toBe(false);
  });

  it("returns false when informe social is recent (<330 days)", () => {
    expect(isInformeSocialRenewalDue(true, daysAgo(320), TODAY)).toBe(false);
  });

  it("returns true when informe social is older than 330 days", () => {
    expect(isInformeSocialRenewalDue(true, daysAgo(340), TODAY)).toBe(true);
  });

  it("returns false when informe social date is null", () => {
    expect(isInformeSocialRenewalDue(true, null, TODAY)).toBe(false);
  });
});

describe("isPadronRenewalDue", () => {
  it("returns false when padrón is not on file", () => {
    expect(isPadronRenewalDue(false, null, TODAY)).toBe(false);
  });

  it("returns false when padrón was received recently (<180 days)", () => {
    expect(isPadronRenewalDue(true, daysAgo(170), TODAY)).toBe(false);
  });

  it("returns true when padrón is older than 180 days", () => {
    expect(isPadronRenewalDue(true, daysAgo(190), TODAY)).toBe(true);
  });

  it("returns false when padrón date is null (no date recorded yet)", () => {
    // Until B.6.1 migration is applied and reception dates are seeded, a
    // null date is the explicit "unknown" signal — do not raise an alert.
    expect(isPadronRenewalDue(true, null, TODAY)).toBe(false);
  });
});

describe("collectRenewalAlerts — 4-family scenario", () => {
  type FamilyFixture = {
    id: string;
    informe_social: boolean;
    informe_social_fecha: string | null;
    padron_recibido: boolean;
    padron_recibido_fecha: string | null;
  };

  const families: FamilyFixture[] = [
    {
      id: "fresh",
      informe_social: true,
      informe_social_fecha: daysAgo(0),
      padron_recibido: true,
      padron_recibido_fecha: daysAgo(0),
    },
    {
      id: "near-informe-renewal",
      informe_social: true,
      informe_social_fecha: daysAgo(320),
      padron_recibido: true,
      padron_recibido_fecha: daysAgo(0),
    },
    {
      id: "overdue-informe",
      informe_social: true,
      informe_social_fecha: daysAgo(340),
      padron_recibido: true,
      padron_recibido_fecha: daysAgo(0),
    },
    {
      id: "overdue-padron",
      informe_social: true,
      informe_social_fecha: daysAgo(0),
      padron_recibido: true,
      padron_recibido_fecha: daysAgo(190),
    },
  ];

  it("flags only the two overdue families", () => {
    const alerts = collectRenewalAlerts(families, TODAY);
    const ids = alerts.map((a) => a.id).sort();
    expect(ids).toEqual(["overdue-informe", "overdue-padron"]);
  });

  it("tags each alert with the rule that fired", () => {
    const alerts = collectRenewalAlerts(families, TODAY);
    const informe = alerts.find((a) => a.id === "overdue-informe");
    const padron = alerts.find((a) => a.id === "overdue-padron");
    expect(informe?.reasons).toContain("informe_social");
    expect(padron?.reasons).toContain("padron");
  });
});
