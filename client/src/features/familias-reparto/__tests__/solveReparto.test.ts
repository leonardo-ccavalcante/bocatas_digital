import { describe, it, expect } from "vitest";
import { solveReparto } from "../utils/solveReparto";
import { assignReparto, type FamilyForReparto } from "../utils/assignReparto";

const fam = (id: string, n: number, num: number): FamilyForReparto => ({ id, total_miembros: n, familia_numero: num, preferred_day: null });

describe("solveReparto — exact-on-demand solver tier", () => {
  it("places every family when a feasible packing exists under capacity", () => {
    const families = [fam("a", 4, 1), fam("b", 3, 2), fam("c", 3, 3), fam("d", 2, 4)]; // 12 over 2 days cap6
    const r = solveReparto(families, 2, 6);
    expect(r.feasible).toBe(true);
    expect(r.assignments).toHaveLength(4);
    r.dayLoads.forEach((l) => expect(l).toBeLessThanOrEqual(6));
  });

  it("reports infeasible when demand exceeds total capacity", () => {
    const families = [fam("a", 5, 1), fam("b", 5, 2), fam("c", 5, 3)]; // 15 over 2 days cap6 = 12 < 15
    const r = solveReparto(families, 2, 6);
    expect(r.feasible).toBe(false);
  });

  it("never produces a worse makespan than the LPT heuristic", () => {
    const families = Array.from({ length: 9 }, (_, i) => fam(`f${i}`, (i % 4) + 1, i + 1));
    const lpt = assignReparto(families, ["d1", "d2", "d3"], {});
    const lptMakespan = Math.max(...lpt.dayLoads.map((d) => d.people));
    const solved = solveReparto(families, 3, null);
    expect(Math.max(...solved.dayLoads)).toBeLessThanOrEqual(lptMakespan);
    expect(solved.assignments).toHaveLength(9);
  });

  it("is deterministic", () => {
    const families = Array.from({ length: 7 }, (_, i) => fam(`f${i}`, (i % 3) + 1, i + 1));
    const a = solveReparto(families, 3, null);
    const b = solveReparto(families, 3, null);
    expect(a.assignments.map((x) => `${x.family_id}:${x.day_index}`)).toEqual(
      b.assignments.map((x) => `${x.family_id}:${x.day_index}`),
    );
  });
});
