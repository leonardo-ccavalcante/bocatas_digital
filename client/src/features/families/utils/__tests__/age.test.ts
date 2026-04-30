import { describe, it, expect } from "vitest";
import { ageInYears, isAdultOrUnknown } from "../age";

describe("ageInYears — calendar-aware (no leap-year drift)", () => {
  const today = new Date("2026-04-30");

  it("returns null for missing/invalid DOB", () => {
    expect(ageInYears(null, today)).toBe(null);
    expect(ageInYears(undefined, today)).toBe(null);
    expect(ageInYears("not-a-date", today)).toBe(null);
  });

  it("returns exact integer age on the birthday — no off-by-one from 365.25 drift", () => {
    expect(ageInYears("2012-04-30", today)).toBe(14);
    expect(ageInYears("1985-04-30", today)).toBe(41);
  });

  it("returns N-1 the day before the Nth birthday", () => {
    expect(ageInYears("2012-05-01", today)).toBe(13);
  });

  it("returns N the day after the Nth birthday", () => {
    expect(ageInYears("2012-04-29", today)).toBe(14);
  });

  it("handles January births correctly across year boundary", () => {
    expect(ageInYears("2012-01-01", new Date("2026-04-30"))).toBe(14);
    expect(ageInYears("2012-12-31", new Date("2026-04-30"))).toBe(13);
  });
});

describe("isAdultOrUnknown — ≥14 inclusive of unknown DOB", () => {
  const today = new Date("2026-04-30");

  it("treats unknown DOB as adult (inclusivity per Bocatas process)", () => {
    expect(isAdultOrUnknown(null, today)).toBe(true);
    expect(isAdultOrUnknown(undefined, today)).toBe(true);
    expect(isAdultOrUnknown("malformed", today)).toBe(true);
  });

  it("returns true for someone exactly 14 today (this used to be a bug — 365.25 drift made them 13.998)", () => {
    expect(isAdultOrUnknown("2012-04-30", today)).toBe(true);
  });

  it("returns false for member just under 14", () => {
    expect(isAdultOrUnknown("2012-05-01", today)).toBe(false);
  });

  it("returns true for adults", () => {
    expect(isAdultOrUnknown("1985-03-15", today)).toBe(true);
  });
});
