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

describe("assignReparto — balanced across (día × turno) slots", () => {
  it("balances people evenly across slots when families are equal-sized", () => {
    const families = Array.from({ length: 8 }, (_, i) => fam(`f${i}`, 2, i + 1));
    // 2 days, both turnos each => 4 slots
    const s = slots([
      ["2026-06-01", "manana"],
      ["2026-06-01", "tarde"],
      ["2026-06-02", "manana"],
      ["2026-06-02", "tarde"],
    ]);

    const result = assignReparto(families, s);

    expect(result.assignments).toHaveLength(8);
    expect(new Set(result.assignments.map((a) => a.family_id)).size).toBe(8);
    // 16 people across 4 slots => 4 each, perfectly balanced
    expect(result.slotLoads.map((d) => d.people)).toEqual([4, 4, 4, 4]);
    expect(result.needsMoreCapacity).toBe(false);
    expect(result.unplaced).toEqual([]);
  });

  it("carries turno onto every assignment and uses the slot ordinal as day_slot", () => {
    const families = [fam("f1", 3, 1), fam("f2", 2, 2)];
    const s = slots([
      ["2026-06-05", "manana"],
      ["2026-06-05", "tarde"],
    ]);
    const result = assignReparto(families, s);
    for (const a of result.assignments) {
      expect(["manana", "tarde"]).toContain(a.turno);
      expect([1, 2]).toContain(a.day_slot);
    }
  });

  it("balances mixed family sizes tightly (heaviest-first)", () => {
    const families = [
      fam("f1", 5, 1),
      fam("f2", 4, 2),
      fam("f3", 3, 3),
      fam("f4", 2, 4),
      fam("f5", 2, 5),
      fam("f6", 1, 6),
      fam("f7", 1, 7),
    ];
    const s = slots([
      ["d1", "manana"],
      ["d1", "tarde"],
      ["d2", "manana"],
    ]);
    const result = assignReparto(families, s);
    const loads = result.slotLoads.map((d) => d.people);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(2);
    expect(loads.reduce((sum, n) => sum + n, 0)).toBe(18);
  });

  it("is deterministic — same input yields identical assignment", () => {
    const families = [fam("f1", 3, 10), fam("f2", 3, 5), fam("f3", 1, 7), fam("f4", 4, 2)];
    const s = slots([["d1", "manana"], ["d2", "tarde"]]);
    const a = assignReparto(families, s);
    const b = assignReparto(families, s);
    expect(a.assignments.map((x) => `${x.family_id}@${x.assigned_day}#${x.turno}`)).toEqual(
      b.assignments.map((x) => `${x.family_id}@${x.assigned_day}#${x.turno}`),
    );
  });

  it("returns empty result when there are no slots", () => {
    const result = assignReparto([fam("f1", 3, 1)], []);
    expect(result.assignments).toEqual([]);
    expect(result.slotLoads).toEqual([]);
    expect(result.needsMoreCapacity).toBe(false);
  });
});

describe("assignReparto — re-assignment over a SUBSET of open slots (atropos regression)", () => {
  it("keeps each slot's TRUE ordinal — never numbers a family onto a skipped/closed slot", () => {
    // Full round has ordinals 1..4. Slots 1 and 3 are already closed. The two
    // pending families must be carried into the still-OPEN slots 2 and 4 only.
    // The engine must use the slots' true ordinals (2, 4) — the old arithmetic
    // (slice + offset) would have produced 2, 3 and land a family on closed slot 3.
    const openRemaining: Slot[] = [
      { date: "2026-06-02", turno: "manana", ordinal: 2, cap: null },
      { date: "2026-06-02", turno: "tarde", ordinal: 4, cap: null },
    ];
    const pending = [fam("f1", 3, 1), fam("f2", 1, 2)];

    const result = assignReparto(pending, openRemaining);

    const usedOrdinals = new Set(result.assignments.map((a) => a.day_slot));
    expect([...usedOrdinals].every((o) => o === 2 || o === 4)).toBe(true);
    expect(usedOrdinals.has(3)).toBe(false); // the closed slot is never reused
    expect(result.assignments).toHaveLength(2);
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
    const fueraSlot = r.slotLoads.find((x) => x.day_slot === 1)!;
    expect(fueraSlot.people).toBe(5); // 3 + 2 fuera people
    expect(fueraSlot.families).toBe(2);
    const onReserved = r.assignments.filter((a) => a.day_slot === 1).map((a) => a.family_id).sort();
    expect(onReserved).toEqual(["fFuera1", "fFuera2"]); // no madrid family on the reserved slot
  });

  it("shares the reserved slot's leftover when no family is flagged fuera (empty codigo_postal → still committable, no overflow)", () => {
    const s = slotsF([["d1", 20, true], ["d2"]]);
    const r = assignReparto([famF("a", 3, 1, false), famF("b", 2, 2, false)], s);
    // Graceful degradation: with 0 detected fuera families the reserved slot acts
    // as a normal one — everyone is placed, so the round stays committable.
    expect(r.unplaced).toEqual([]);
    expect(r.needsMoreCapacity).toBe(false);
    expect(r.slotLoads.reduce((sum, x) => sum + x.people, 0)).toBe(5);
  });

  it("overflows extra fuera people to normal slots when the reserved cap is too small", () => {
    const s = slotsF([["d1", 3, true], ["d2"]]);
    const r = assignReparto([famF("f1", 3, 1, true), famF("f2", 2, 2, true)], s);
    expect(r.slotLoads.find((x) => x.day_slot === 1)!.people).toBe(3); // cap fits the first fuera family
    expect(r.slotLoads.find((x) => x.day_slot === 2)!.people).toBe(2); // the other overflows to normal
  });
});

describe("assignReparto — preferred day anchors to the first slot of that date", () => {
  it("places a family on its preferred_day even when LPT would pick another slot", () => {
    const families = [
      fam("f1", 5, 1, "2026-06-03"), // heaviest + agreed date
      fam("f2", 2, 2),
      fam("f3", 2, 3),
      fam("f4", 2, 4),
    ];
    const s = slots([
      ["2026-06-01", "manana"],
      ["2026-06-02", "manana"],
      ["2026-06-03", "manana"],
    ]);
    const result = assignReparto(families, s);
    const f1 = result.assignments.find((a) => a.family_id === "f1");
    expect(f1?.assigned_day).toBe("2026-06-03");
    expect(result.assignments).toHaveLength(4);
  });
});

describe("assignReparto — per-slot capacity", () => {
  it("never exceeds a slot's cap when everyone fits", () => {
    const families = Array.from({ length: 6 }, (_, i) => fam(`f${i}`, 2, i + 1));
    const s = slots([
      ["d1", "manana", 4],
      ["d1", "tarde", 4],
      ["d2", "manana", 4],
    ]);
    const result = assignReparto(families, s);
    expect(result.assignments).toHaveLength(6);
    result.slotLoads.forEach((d) => expect(d.people).toBeLessThanOrEqual(4));
    expect(result.needsMoreCapacity).toBe(false);
    expect(result.unplaced).toEqual([]);
  });

  it("flags needsMoreCapacity and lists unplaced when the caps are too tight", () => {
    // 6 families of 2, each slot cap=3 (so 1 family per slot), 3 slots => 3 fit.
    const families = Array.from({ length: 6 }, (_, i) => fam(`f${i}`, 2, i + 1));
    const s = slots([
      ["d1", "manana", 3],
      ["d1", "tarde", 3],
      ["d2", "manana", 3],
    ]);
    const result = assignReparto(families, s);
    expect(result.needsMoreCapacity).toBe(true);
    expect(result.unplaced).toHaveLength(3);
    result.slotLoads.forEach((d) => expect(d.people).toBeLessThanOrEqual(3));
    expect(result.assignments).toHaveLength(3);
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
