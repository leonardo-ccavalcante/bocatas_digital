import { describe, it, expect } from "vitest";
import { isSamePerson, isMemberAdult } from "../families-doc-helpers";

describe("isSamePerson — exact-match dedup at family intake", () => {
  const base = {
    nombre: "Ana",
    apellidos: "Garcia Lopez",
    fecha_nacimiento: "1985-03-15",
  };

  it("matches exact name + birth date", () => {
    expect(isSamePerson(base, { ...base })).toBe(true);
  });

  it("rejects same name but different birth date (twins, unrelated namesakes)", () => {
    expect(
      isSamePerson(base, { ...base, fecha_nacimiento: "1990-01-01" })
    ).toBe(false);
  });

  it("rejects same DOB but different name", () => {
    expect(
      isSamePerson(base, {
        nombre: "Maria",
        apellidos: "Garcia Lopez",
        fecha_nacimiento: "1985-03-15",
      })
    ).toBe(false);
  });

  it("rejects when one party has no DOB (cannot confirm match — must create new)", () => {
    expect(isSamePerson(base, { ...base, fecha_nacimiento: null })).toBe(false);
    expect(
      isSamePerson({ ...base, fecha_nacimiento: undefined }, base)
    ).toBe(false);
  });

  it("is case-sensitive and whitespace-sensitive (intentional — fuzzy is Gate 2)", () => {
    expect(isSamePerson(base, { ...base, nombre: "ana" })).toBe(false);
    expect(
      isSamePerson(base, { ...base, apellidos: "Garcia  Lopez" })
    ).toBe(false);
  });
});

describe("isMemberAdult — ≥14 rule with unknown-as-adult inclusivity", () => {
  const today = new Date("2026-04-30");

  it("returns true for unknown DOB (be inclusive — show doc requirement)", () => {
    expect(isMemberAdult({ fecha_nacimiento: null }, today)).toBe(true);
    expect(isMemberAdult({}, today)).toBe(true);
  });

  it("returns true for member who turns 14 exactly today (≥14 threshold)", () => {
    // Calendar-aware algorithm: exact 14th birthday today is age === 14, so returns true.
    expect(isMemberAdult({ fecha_nacimiento: "2012-04-30" }, today)).toBe(true);
  });

  it("returns false for member under 14", () => {
    expect(isMemberAdult({ fecha_nacimiento: "2013-04-30" }, today)).toBe(false);
  });

  it("returns true for adults", () => {
    expect(
      isMemberAdult({ fecha_nacimiento: "1985-03-15" }, today)
    ).toBe(true);
  });

  it("returns true for malformed DOB (graceful inclusivity)", () => {
    expect(
      isMemberAdult({ fecha_nacimiento: "not-a-date" }, today)
    ).toBe(true);
  });
});
