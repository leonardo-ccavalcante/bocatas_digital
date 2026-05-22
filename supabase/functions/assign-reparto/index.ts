// Edge Function: assign-reparto — exact-on-demand solver tier for the Reparto
// hybrid. The client/server LPT heuristic handles the common case; this endpoint
// runs the FFD + local-search solver when the heuristic flags `needsSolver`.
//
// POST body: { families: [{id, total_miembros, familia_numero}], numDays, capPerDay }
// Response:  { assignments: [{family_id, day_index, total_miembros, expediente}], dayLoads, feasible }
//
// The solver is inlined (Deno-self-contained) and mirrors
// client/src/features/familias-reparto/utils/solveReparto.ts — keep them in sync.
// (Swap in HiGHS/CP-SAT WASM here for guaranteed optimality at very large scale.)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

interface Family { id: string; total_miembros: number; familia_numero: number | null }

function solve(families: Family[], numDays: number, capPerDay: number | null) {
  if (numDays <= 0) return { assignments: [], dayLoads: [], feasible: families.length === 0 };
  const items = [...families].sort(
    (a, b) => b.total_miembros - a.total_miembros || (a.familia_numero ?? 0) - (b.familia_numero ?? 0),
  );
  const loads = new Array<number>(numDays).fill(0);
  const dayOf = new Map<string, number>();
  let feasible = true;

  for (const fam of items) {
    let best = -1;
    for (let d = 0; d < numDays; d++) {
      if (capPerDay !== null && loads[d] + fam.total_miembros > capPerDay) continue;
      if (best === -1 || loads[d] < loads[best]) best = d;
    }
    if (best === -1) { feasible = false; best = loads.indexOf(Math.min(...loads)); }
    loads[best] += fam.total_miembros;
    dayOf.set(fam.id, best);
  }

  for (let iter = 0; iter < numDays * items.length; iter++) {
    const hi = loads.indexOf(Math.max(...loads));
    let moved = false;
    for (const fam of items) {
      if (dayOf.get(fam.id) !== hi) continue;
      for (let d = 0; d < numDays; d++) {
        if (d === hi) continue;
        const fits = capPerDay === null || loads[d] + fam.total_miembros <= capPerDay;
        if (fits && loads[d] + fam.total_miembros < loads[hi]) {
          loads[hi] -= fam.total_miembros; loads[d] += fam.total_miembros; dayOf.set(fam.id, d); moved = true; break;
        }
      }
      if (moved) break;
    }
    if (!moved) break;
  }

  const byId = new Map(families.map((f) => [f.id, f]));
  const assignments = [...dayOf.entries()]
    .map(([family_id, day_index]) => {
      const f = byId.get(family_id)!;
      return { family_id, day_index, total_miembros: f.total_miembros, expediente: f.familia_numero !== null ? String(f.familia_numero) : null };
    })
    .sort((a, b) => a.day_index - b.day_index || (a.expediente ?? "").localeCompare(b.expediente ?? ""));
  return { assignments, dayLoads: loads, feasible };
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const { families, numDays, capPerDay } = await req.json();
    if (!Array.isArray(families) || typeof numDays !== "number") {
      return new Response(JSON.stringify({ error: "families[] and numDays required" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    const result = solve(families, numDays, capPerDay ?? null);
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
