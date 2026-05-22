// Exact-on-demand solver tier for the Reparto hybrid.
//
// The LPT heuristic (assignReparto) covers the common case. When it flags
// `needsSolver` (a family couldn't be placed under capacity), this solver runs:
// First-Fit-Decreasing to find a feasible packing, then bounded local search
// (single-family relocation) to minimise the busiest-day load. Pure TS, no
// dependency — runs server-side. (A HiGHS/CP-SAT WASM solver is a drop-in
// replacement for guaranteed optimality at very large scale.)

import type { FamilyForReparto } from "./assignReparto";

export interface SolveResult {
  assignments: Array<{ family_id: string; day_index: number; total_miembros: number; expediente: string | null }>;
  dayLoads: number[];
  feasible: boolean;
}

export function solveReparto(
  families: FamilyForReparto[],
  numDays: number,
  capPerDay: number | null,
): SolveResult {
  if (numDays <= 0) return { assignments: [], dayLoads: [], feasible: families.length === 0 };

  const items = [...families].sort(
    (a, b) => b.total_miembros - a.total_miembros || (a.familia_numero ?? 0) - (b.familia_numero ?? 0),
  );
  const loads = new Array<number>(numDays).fill(0);
  const dayOf = new Map<string, number>();
  let feasible = true;

  // First-Fit-Decreasing: place each family in the least-loaded day with room.
  for (const fam of items) {
    let best = -1;
    for (let d = 0; d < numDays; d++) {
      if (capPerDay !== null && loads[d] + fam.total_miembros > capPerDay) continue;
      if (best === -1 || loads[d] < loads[best]) best = d;
    }
    if (best === -1) { feasible = false; best = minIndex(loads); } // over capacity: best-effort
    loads[best] += fam.total_miembros;
    dayOf.set(fam.id, best);
  }

  // Bounded local search: move a family off the busiest day to a feasible
  // lighter day if it lowers the makespan. Deterministic, capped iterations.
  for (let iter = 0; iter < numDays * items.length; iter++) {
    const hi = maxIndex(loads);
    let moved = false;
    for (const fam of items) {
      if (dayOf.get(fam.id) !== hi) continue;
      for (let d = 0; d < numDays; d++) {
        if (d === hi) continue;
        const fits = capPerDay === null || loads[d] + fam.total_miembros <= capPerDay;
        if (fits && loads[d] + fam.total_miembros < loads[hi]) {
          loads[hi] -= fam.total_miembros;
          loads[d] += fam.total_miembros;
          dayOf.set(fam.id, d);
          moved = true;
          break;
        }
      }
      if (moved) break;
    }
    if (!moved) break;
  }

  const byNum = new Map(families.map((f) => [f.id, f]));
  const assignments = [...dayOf.entries()]
    .map(([family_id, day_index]) => {
      const f = byNum.get(family_id)!;
      return { family_id, day_index, total_miembros: f.total_miembros, expediente: f.familia_numero !== null ? String(f.familia_numero) : null };
    })
    .sort((a, b) => a.day_index - b.day_index || (a.expediente ?? "").localeCompare(b.expediente ?? ""));

  return { assignments, dayLoads: loads, feasible };
}

function minIndex(a: number[]): number {
  let m = 0;
  for (let i = 1; i < a.length; i++) if (a[i] < a[m]) m = i;
  return m;
}
function maxIndex(a: number[]): number {
  let m = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[m]) m = i;
  return m;
}
