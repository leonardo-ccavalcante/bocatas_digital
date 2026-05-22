import { describe, it, expect } from "vitest";
import {
  assignReparto,
  computeKgPerFamily,
  reassignRemaining,
  repartoDays,
  repartoCapacityCheck,
  type FamilyForReparto,
} from "../utils/assignReparto";

function fam(
  id: string,
  total_miembros: number,
  familia_numero: number,
  preferred_day?: string | null,
): FamilyForReparto {
  return { id, total_miembros, familia_numero, preferred_day: preferred_day ?? null };
}

describe("assignReparto — balanced assignment (tracer bullet)", () => {
  it("balances people evenly across days when families are equal-sized", () => {
    const families = [
      fam("f1", 2, 1),
      fam("f2", 2, 2),
      fam("f3", 2, 3),
      fam("f4", 2, 4),
      fam("f5", 2, 5),
      fam("f6", 2, 6),
    ];
    const days = ["2026-06-01", "2026-06-02", "2026-06-03"];

    const result = assignReparto(families, days);

    // all six families placed exactly once
    expect(result.assignments).toHaveLength(6);
    expect(new Set(result.assignments.map((a) => a.family_id)).size).toBe(6);

    // 12 people across 3 days => 4 people each, perfectly balanced
    expect(result.dayLoads.map((d) => d.people)).toEqual([4, 4, 4]);
    expect(result.needsSolver).toBe(false);
    expect(result.unplaced).toEqual([]);
  });

  it("balances unequal family sizes (heaviest-first keeps days close)", () => {
    // sizes 5,4,3,2,2,1,1 = 18 people across 3 days => ideal 6/day
    const families = [
      fam("f1", 5, 1),
      fam("f2", 4, 2),
      fam("f3", 3, 3),
      fam("f4", 2, 4),
      fam("f5", 2, 5),
      fam("f6", 1, 6),
      fam("f7", 1, 7),
    ];
    const days = ["d1", "d2", "d3"];

    const result = assignReparto(families, days);

    expect(result.assignments).toHaveLength(7);
    const loads = result.dayLoads.map((d) => d.people);
    // greedy LPT keeps spread tight: max - min <= largest family weight
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(2);
    expect(loads.reduce((s, n) => s + n, 0)).toBe(18);
  });

  it("is deterministic — same input yields identical assignment", () => {
    const families = [
      fam("f1", 3, 10),
      fam("f2", 3, 5),
      fam("f3", 1, 7),
      fam("f4", 4, 2),
    ];
    const days = ["d1", "d2"];
    const a = assignReparto(families, days);
    const b = assignReparto(families, days);
    expect(a.assignments.map((x) => `${x.family_id}@${x.assigned_day}`)).toEqual(
      b.assignments.map((x) => `${x.family_id}@${x.assigned_day}`),
    );
  });

  it("returns empty result when there are no days", () => {
    const result = assignReparto([fam("f1", 3, 1)], []);
    expect(result.assignments).toEqual([]);
    expect(result.dayLoads).toEqual([]);
  });
});

describe("assignReparto — preferred / agreed day is honored", () => {
  it("places a family on its preferred_day even when LPT would pick another", () => {
    // f1 is the heaviest, so plain LPT places it on day 1 (first least-loaded).
    // Its agreed day is day 3 — honoring the preference must override that.
    const families = [
      fam("f1", 5, 1, "2026-06-03"), // heaviest + agreed day 3
      fam("f2", 2, 2),
      fam("f3", 2, 3),
      fam("f4", 2, 4),
    ];
    const days = ["2026-06-01", "2026-06-02", "2026-06-03"];

    const result = assignReparto(families, days);

    const f1 = result.assignments.find((a) => a.family_id === "f1");
    expect(f1?.assigned_day).toBe("2026-06-03");
    expect(result.assignments).toHaveLength(4);
    expect(result.needsSolver).toBe(false);
  });
});

describe("assignReparto — per-day capacity", () => {
  it("never exceeds capPerDay when it fits", () => {
    const families = Array.from({ length: 6 }, (_, i) => fam(`f${i}`, 2, i + 1));
    const result = assignReparto(families, ["d1", "d2", "d3"], { capPerDay: 4 });

    expect(result.assignments).toHaveLength(6);
    result.dayLoads.forEach((d) => expect(d.people).toBeLessThanOrEqual(4));
    expect(result.needsSolver).toBe(false);
    expect(result.unplaced).toEqual([]);
  });

  it("flags needsSolver and lists unplaced when capacity is too tight", () => {
    // 6 families of 2 people, cap=3/day, 3 days => only one family fits per day
    const families = Array.from({ length: 6 }, (_, i) => fam(`f${i}`, 2, i + 1));
    const result = assignReparto(families, ["d1", "d2", "d3"], { capPerDay: 3 });

    expect(result.needsSolver).toBe(true);
    expect(result.unplaced).toHaveLength(3);
    result.dayLoads.forEach((d) => expect(d.people).toBeLessThanOrEqual(3));
    // placed families never break the cap
    expect(result.assignments).toHaveLength(3);
  });
});

describe("computeKgPerFamily — linear split", () => {
  it("gives kg = (kg_total / total_personas) * miembros", () => {
    // 1500 kg over 150 people = 10 kg/person; family of 6 => 60
    expect(computeKgPerFamily(1500, 150, 6)).toBe(60);
    expect(computeKgPerFamily(1500, 150, 1)).toBe(10);
  });

  it("rounds to a whole kg", () => {
    // 100 kg over 30 people = 3.33/person; family of 2 => 6.67 -> 7
    expect(computeKgPerFamily(100, 30, 2)).toBe(7);
  });

  it("returns 0 when there are no people (no divide-by-zero)", () => {
    expect(computeKgPerFamily(1500, 0, 6)).toBe(0);
  });
});

describe("repartoCapacityCheck — exact up-front feasibility", () => {
  it("is always feasible with no capacity cap", () => {
    const r = repartoCapacityCheck(120, null, 3);
    expect(r.feasible).toBe(true);
    expect(r.shortfall).toBe(0);
    expect(r.neededDays).toBe(3);
  });

  it("is feasible when people fit within cap*days", () => {
    const r = repartoCapacityCheck(60, 25, 3); // 60 <= 75
    expect(r.feasible).toBe(true);
    expect(r.shortfall).toBe(0);
  });

  it("reports exact shortfall and extra days needed when over capacity", () => {
    // 100 people, cap 25/day, 3 days => capacity 75, shortfall 25,
    // need ceil(100/25)=4 days total.
    const r = repartoCapacityCheck(100, 25, 3);
    expect(r.feasible).toBe(false);
    expect(r.shortfall).toBe(25);
    expect(r.neededDays).toBe(4);
  });
});

describe("repartoDays — consecutive day generation", () => {
  it("returns N consecutive ISO dates from the start", () => {
    expect(repartoDays("2026-06-01", 3)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
  });
  it("returns empty for zero days", () => {
    expect(repartoDays("2026-06-01", 0)).toEqual([]);
  });
});

describe("reassignRemaining — carry no-shows forward", () => {
  it("re-distributes pending families over the days after a given slot", () => {
    // 3-day reparto; day 1 already happened. Two no-show families carried to days 2-3.
    const pending = [fam("f1", 3, 1), fam("f2", 1, 2)];
    const days = ["d1", "d2", "d3"];

    const result = reassignRemaining(pending, days, 1);

    // nothing lands back on the past day (slot 1)
    expect(result.assignments.every((a) => a.day_slot >= 2)).toBe(true);
    expect(result.assignments.map((a) => a.assigned_day).every((d) => d !== "d1")).toBe(true);
    expect(result.assignments).toHaveLength(2);
  });
});
