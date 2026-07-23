import { describe, it, expect } from "vitest";
import {
  assignReparto,
  computeKgPerFamily,
  distributeTargets,
  repartoCapacityCheck,
  type FamilyForReparto,
  type Slot,
} from "../utils/assignReparto";

function fam(
  id: string,
  total_miembros: number,
  familia_numero: number,
  preferred_day?: string | null,
): FamilyForReparto {
  return { id, total_miembros, familia_numero, preferred_day: preferred_day ?? null };
}

/** Build an ordered slot list; ordinal is the 1-based position. */
function slots(specs: Array<[string, "manana" | "tarde", number?]>): Slot[] {
  return specs.map(([date, turno, cap], i) => ({ date, turno, ordinal: i + 1, cap: cap ?? null }));
}

describe("assignReparto — sequential fill, smallest family first", () => {
  it("places all families and pours the smallest into the earliest slots", () => {
    // sizes 1,1,2,2,3,3,4,4 = 20 people across 2 slots ⇒ targets 10,10.
    const families = [
      fam("f1", 1, 1), fam("f2", 1, 2), fam("f3", 2, 3), fam("f4", 2, 4),
      fam("f5", 3, 5), fam("f6", 3, 6), fam("f7", 4, 7), fam("f8", 4, 8),
    ];
    const s = slots([["2026-06-01", "manana"], ["2026-06-02", "manana"]]);
    const result = assignReparto(families, s);

    expect(result.assignments).toHaveLength(8);
    expect(new Set(result.assignments.map((a) => a.family_id)).size).toBe(8);
    // Slot 1 fills with the smaller families until it reaches its target, then slot 2 opens.
    const slot1Fams = result.assignments.filter((a) => a.day_slot === 1).map((a) => a.total_miembros);
    const slot2Fams = result.assignments.filter((a) => a.day_slot === 2).map((a) => a.total_miembros);
    expect(Math.max(...slot1Fams)).toBeLessThanOrEqual(Math.min(...slot2Fams)); // earlier day = smaller families
    expect(result.slotLoads.reduce((sum, d) => sum + d.people, 0)).toBe(20);
    expect(result.overCap).toEqual([]);
  });

  it("the last slot absorbs the remainder — nobody is left unplaced", () => {
    const families = Array.from({ length: 7 }, (_, i) => fam(`f${i}`, 3, i + 1));
    const s = slots([["d1", "manana"], ["d2", "manana"]]);
    const result = assignReparto(families, s);
    expect(result.assignments).toHaveLength(7); // all placed, none dropped
    expect(result.slotLoads.reduce((sum, d) => sum + d.families, 0)).toBe(7);
  });

  it("carries turno onto every assignment and uses the slot ordinal as day_slot", () => {
    const families = [fam("f1", 3, 1), fam("f2", 2, 2)];
    const s = slots([["2026-06-05", "manana"], ["2026-06-05", "tarde"]]);
    const result = assignReparto(families, s);
    for (const a of result.assignments) {
      expect(["manana", "tarde"]).toContain(a.turno);
      expect([1, 2]).toContain(a.day_slot);
    }
  });

  it("is deterministic — same input yields identical assignment", () => {
    const families = [fam("f1", 3, 10), fam("f2", 3, 5), fam("f3", 1, 7), fam("f4", 4, 2)];
    const s = slots([["d1", "manana"], ["d2", "tarde"]]);
    const a = assignReparto(families, s);
    const b = assignReparto(families, s);
    expect(a.assignments.map((x) => `${x.family_id}@${x.day_slot}`)).toEqual(
      b.assignments.map((x) => `${x.family_id}@${x.day_slot}`),
    );
  });

  it("returns an empty result when there are no slots", () => {
    const result = assignReparto([fam("f1", 3, 1)], []);
    expect(result.assignments).toEqual([]);
    expect(result.slotLoads).toEqual([]);
    expect(result.overCap).toEqual([]);
  });
});

describe("assignReparto — cupos are reference-only (overCap warning, never blocking)", () => {
  it("reports a slot that ends up over its cap but still places everyone", () => {
    // slot1 cap=3 (target override 3), slot2 uncapped. 3 families of 2 ⇒ slot1 takes
    // 2 (=4 people, over cap) before advancing; the third lands on slot2.
    const families = [fam("f1", 2, 1), fam("f2", 2, 2), fam("f3", 2, 3)];
    const s = slots([["d1", "manana", 3], ["d2", "manana"]]);
    const result = assignReparto(families, s);
    expect(result.assignments).toHaveLength(3); // never blocked
    const over = result.overCap.find((o) => o.day_slot === 1);
    expect(over).toBeTruthy();
    expect(over!.people).toBeGreaterThan(over!.cap);
  });
});

describe("assignReparto — fuera-de-Madrid reserved slot (derived anchor)", () => {
  const famF = (id: string, m: number, num: number, fuera: boolean): FamilyForReparto => ({
    id, total_miembros: m, familia_numero: num, preferred_day: null, esFueraMadrid: fuera,
  });
  const slotsF = (specs: Array<[string, number?, boolean?]>): Slot[] =>
    specs.map(([date, cap, fuera], i) => ({ date, turno: "manana", ordinal: i + 1, cap: cap ?? null, esFueraMadrid: fuera ?? false }));

  it("anchors fuera families to the reserved slot and keeps madrid families out of it", () => {
    const s = slotsF([["d1", undefined, true], ["d2"], ["d3"]]);
    const r = assignReparto(
      [famF("fFuera1", 3, 1, true), famF("fFuera2", 2, 2, true), famF("fMad1", 4, 3, false), famF("fMad2", 1, 4, false)],
      s,
    );
    const onReserved = r.assignments.filter((a) => a.day_slot === 1).map((a) => a.family_id).sort();
    expect(onReserved).toEqual(["fFuera1", "fFuera2"]); // no madrid family on the reserved slot
  });

  it("still places everyone when no family is flagged fuera (empty codigo_postal → reserved acts normal)", () => {
    const s = slotsF([["d1", 20, true], ["d2"]]);
    const r = assignReparto([famF("a", 3, 1, false), famF("b", 2, 2, false)], s);
    expect(r.assignments).toHaveLength(2);
    expect(r.slotLoads.reduce((sum, x) => sum + x.people, 0)).toBe(5);
  });
});

describe("distributeTargets — planning split, fix-one-rebalance-the-rest", () => {
  const keys = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `s${i}` }));

  it("divides a total equally across all slots when nothing is fixed", () => {
    const r = distributeTargets(200, keys(4));
    expect(r.slots.map((s) => s.people)).toEqual([50, 50, 50, 50]);
    expect(r.assigned).toBe(200);
    expect(r.leftover).toBe(0);
    expect(r.overCommitted).toBe(false);
    expect(r.slots.every((s) => !s.overridden)).toBe(true);
  });

  it("hands the integer remainder to the first free slots (deterministic)", () => {
    const r = distributeTargets(200, keys(3)); // 200/3 = 66 r2
    expect(r.slots.map((s) => s.people)).toEqual([67, 67, 66]);
    expect(r.assigned).toBe(200);
  });

  it("fixes an overridden slot and rebalances the remainder across the free ones", () => {
    // 200 total, day-2 mañana fixed at 30 => other 3 split 170 => 57,57,56
    const r = distributeTargets(200, [
      { key: "s0" },
      { key: "s1", override: 30 },
      { key: "s2" },
      { key: "s3" },
    ]);
    expect(r.slots.map((s) => s.people)).toEqual([57, 30, 57, 56]);
    expect(r.slots[1].overridden).toBe(true);
    expect(r.assigned).toBe(200);
    expect(r.leftover).toBe(0);
    expect(r.overCommitted).toBe(false);
  });

  it("recomputes when a slot is added (re-divides the whole total)", () => {
    expect(distributeTargets(200, keys(4)).slots.map((s) => s.people)).toEqual([50, 50, 50, 50]);
    expect(distributeTargets(200, keys(5)).slots.map((s) => s.people)).toEqual([40, 40, 40, 40, 40]);
  });

  it("flags overCommitted and zeroes the free slots when fixed overrides exceed the total", () => {
    const r = distributeTargets(100, [
      { key: "s0", override: 80 },
      { key: "s1", override: 60 },
      { key: "s2" },
    ]);
    expect(r.overCommitted).toBe(true);
    expect(r.slots.map((s) => s.people)).toEqual([80, 60, 0]);
    expect(r.leftover).toBe(0);
  });

  it("reports leftover when every slot is fixed and their sum is under the total", () => {
    const r = distributeTargets(200, [
      { key: "s0", override: 50 },
      { key: "s1", override: 50 },
    ]);
    expect(r.leftover).toBe(100);
    expect(r.assigned).toBe(100);
    expect(r.overCommitted).toBe(false);
  });

  it("returns all-zero for an empty or non-positive total (no NaN, no divide-by-zero)", () => {
    expect(distributeTargets(0, keys(3)).slots.map((s) => s.people)).toEqual([0, 0, 0]);
    expect(distributeTargets(NaN, keys(2)).slots.map((s) => s.people)).toEqual([0, 0]);
    expect(distributeTargets(200, []).slots).toEqual([]);
  });

  it("floors and clamps a fractional/negative override", () => {
    const r = distributeTargets(100, [{ key: "s0", override: 30.9 }, { key: "s1", override: -5 }, { key: "s2" }]);
    expect(r.slots.map((s) => s.people)).toEqual([30, 0, 70]);
  });
});

describe("computeKgPerFamily — linear split (unchanged)", () => {
  it("gives kg = (kg_total / total_personas) * miembros", () => {
    expect(computeKgPerFamily(1500, 150, 6)).toBe(60);
    expect(computeKgPerFamily(1500, 150, 1)).toBe(10);
  });
  it("rounds to a whole kg", () => {
    expect(computeKgPerFamily(100, 30, 2)).toBe(7);
  });
  it("returns 0 when there are no people (no divide-by-zero)", () => {
    expect(computeKgPerFamily(1500, 0, 6)).toBe(0);
  });
});

describe("repartoCapacityCheck — feasibility over per-slot caps", () => {
  it("is always feasible when any slot is uncapped", () => {
    const s = slots([["d1", "manana", 25], ["d1", "tarde"]]); // second uncapped
    const r = repartoCapacityCheck(120, s);
    expect(r.feasible).toBe(true);
    expect(r.capacity).toBeNull();
    expect(r.shortfall).toBe(0);
  });

  it("is feasible when people fit within the sum of slot caps", () => {
    const s = slots([["d1", "manana", 25], ["d1", "tarde", 25], ["d2", "manana", 25]]);
    const r = repartoCapacityCheck(60, s); // 60 <= 75
    expect(r.feasible).toBe(true);
    expect(r.capacity).toBe(75);
    expect(r.shortfall).toBe(0);
  });

  it("reports the exact shortfall when over capacity", () => {
    const s = slots([["d1", "manana", 25], ["d1", "tarde", 25], ["d2", "manana", 25]]);
    const r = repartoCapacityCheck(100, s); // capacity 75 => shortfall 25
    expect(r.feasible).toBe(false);
    expect(r.capacity).toBe(75);
    expect(r.shortfall).toBe(25);
  });
});
