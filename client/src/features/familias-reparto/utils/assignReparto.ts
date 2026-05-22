// Reparto assignment engine (Programa de Familia).
//
// Distributes families across the delivery days of a "reparto", balanced by
// PEOPLE (not family count) so each day carries a similar load. Pure module —
// no DB, no side effects — so the OR logic is fully unit-testable.
//
// Default tier: greedy Longest-Processing-Time (LPT) bin-packing. Families are
// the unit; weight = total_miembros. This is a 4/3-approx for makespan and is
// deterministic. When capacity or fixed-day constraints make LPT infeasible the
// result flags `needsSolver` so the caller can escalate to the exact MILP solver.

export interface FamilyForReparto {
  /** family UUID */
  id: string;
  /** people in the family — the balancing weight */
  total_miembros: number;
  /** expediente number, used as a stable tie-break and for display */
  familia_numero: number | null;
  /** a fixed/agreed delivery day (YYYY-MM-DD); honored as a hard placement */
  preferred_day?: string | null;
}

export interface RepartoAssignment {
  family_id: string;
  assigned_day: string;
  /** 1-based ordinal of the day within the reparto */
  day_slot: number;
  total_miembros: number;
  expediente: string | null;
}

export interface RepartoDayLoad {
  day: string;
  slot: number;
  people: number;
  families: number;
}

export interface RepartoResult {
  assignments: RepartoAssignment[];
  dayLoads: RepartoDayLoad[];
  /** true when LPT could not satisfy capacity / preferred-day constraints */
  needsSolver: boolean;
  /** family ids that could not be placed under capacity */
  unplaced: string[];
}

export interface RepartoOptions {
  /** max people per day; when set, days never exceed it (else needsSolver) */
  capPerDay?: number | null;
}

interface Bin extends RepartoDayLoad {
  assignments: RepartoAssignment[];
}

export function assignReparto(
  families: FamilyForReparto[],
  days: string[],
  opts: RepartoOptions = {},
): RepartoResult {
  const cap = opts.capPerDay ?? null;
  const bins: Bin[] = days.map((day, i) => ({
    day,
    slot: i + 1,
    people: 0,
    families: 0,
    assignments: [],
  }));

  if (bins.length === 0) {
    return { assignments: [], dayLoads: [], needsSolver: false, unplaced: [] };
  }

  const binByDay = new Map(bins.map((b) => [b.day, b]));

  // 1. Fixed placements: families with a preferred_day matching a reparto day
  //    are anchored there before balancing the rest around them. A stale
  //    preference (day not in this reparto) falls through to the free pool.
  const free: FamilyForReparto[] = [];
  for (const fam of families) {
    const fixedBin = fam.preferred_day ? binByDay.get(fam.preferred_day) : undefined;
    if (fixedBin) place(fixedBin, fam);
    else free.push(fam);
  }

  // 2. LPT order: heaviest families first, stable tie-break by familia_numero.
  const ordered = free.sort(
    (a, b) =>
      b.total_miembros - a.total_miembros ||
      (a.familia_numero ?? 0) - (b.familia_numero ?? 0),
  );

  const unplaced: string[] = [];
  for (const fam of ordered) {
    const target = leastLoadedWithRoom(bins, fam.total_miembros, cap);
    if (target) place(target, fam);
    else unplaced.push(fam.id);
  }

  return {
    assignments: bins.flatMap((b) => b.assignments),
    dayLoads: bins.map(({ day, slot, people, families }) => ({
      day,
      slot,
      people,
      families,
    })),
    // Couldn't satisfy capacity with the greedy heuristic → caller may escalate
    // to the exact MILP solver, which can find a feasible packing if one exists.
    needsSolver: unplaced.length > 0,
    unplaced,
  };
}

/**
 * Least-loaded bin that can still fit `weight` under `cap`. With no cap, the
 * plain least-loaded bin always has room. Returns null when nothing fits.
 */
function leastLoadedWithRoom(
  bins: Bin[],
  weight: number,
  cap: number | null,
): Bin | null {
  const feasible = cap === null ? bins : bins.filter((b) => b.people + weight <= cap);
  if (feasible.length === 0) return null;
  return feasible.reduce((a, b) => (a.people <= b.people ? a : b));
}

export interface CapacityCheck {
  feasible: boolean;
  /** total seats = capPerDay * days, or null when uncapped */
  capacity: number | null;
  /** people that don't fit (0 when feasible or uncapped) */
  shortfall: number;
  /** minimum days needed to fit everyone at capPerDay (= days when feasible/uncapped) */
  neededDays: number;
}

/**
 * Exact up-front feasibility: can `totalPeople` fit in `days` at `capPerDay`?
 * Pure arithmetic (no heuristic), so the answer is certain — used to give the
 * operator a precise "faltan N personas, añade X días" message before any
 * assignment runs. Uncapped rounds are always feasible.
 */
export function repartoCapacityCheck(
  totalPeople: number,
  capPerDay: number | null,
  days: number,
): CapacityCheck {
  if (capPerDay === null || capPerDay <= 0 || days <= 0) {
    return { feasible: true, capacity: null, shortfall: 0, neededDays: days };
  }
  const capacity = capPerDay * days;
  if (totalPeople <= capacity) {
    return { feasible: true, capacity, shortfall: 0, neededDays: days };
  }
  return {
    feasible: false,
    capacity,
    shortfall: totalPeople - capacity,
    neededDays: Math.ceil(totalPeople / capPerDay),
  };
}

/**
 * Consecutive ISO dates of a reparto: `dias` days starting at `fechaInicio`.
 * (Delivery days run on consecutive days; the operator can later reschedule
 * individual families to other days.)
 */
export function repartoDays(fechaInicio: string, dias: number): string[] {
  const out: string[] = [];
  const start = new Date(fechaInicio + "T00:00:00Z");
  for (let i = 0; i < Math.max(0, dias); i++) {
    const d = new Date(start.getTime() + i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Kilos for one family under a linear (per-person) split of the round total.
 * `kg_total` distributed over `totalPersonas` people, times this family's size.
 * Rounds to a whole kg. Returns 0 when there are no people.
 */
export function computeKgPerFamily(
  kgTotal: number,
  totalPersonas: number,
  miembros: number,
): number {
  if (totalPersonas <= 0) return 0;
  return Math.round((kgTotal / totalPersonas) * miembros);
}

/**
 * Carry pending families (no-shows / no-answers) forward: re-run the balanced
 * assignment over only the days AFTER `fromSlot` (1-based), preserving the
 * original day_slot numbering. Days up to and including `fromSlot` are already
 * delivered and are never reused.
 */
export function reassignRemaining(
  families: FamilyForReparto[],
  days: string[],
  fromSlot: number,
  opts: RepartoOptions = {},
): RepartoResult {
  const remainingDays = days.slice(fromSlot); // slots fromSlot+1 .. N
  const sub = assignReparto(families, remainingDays, opts);
  const offset = fromSlot; // shift slots back to their absolute position
  return {
    ...sub,
    assignments: sub.assignments.map((a) => ({
      ...a,
      day_slot: a.day_slot + offset,
    })),
    dayLoads: sub.dayLoads.map((d) => ({ ...d, slot: d.slot + offset })),
  };
}

function place(bin: Bin, fam: FamilyForReparto): void {
  bin.assignments.push({
    family_id: fam.id,
    assigned_day: bin.day,
    day_slot: bin.slot,
    total_miembros: fam.total_miembros,
    expediente: fam.familia_numero !== null ? String(fam.familia_numero) : null,
  });
  bin.people += fam.total_miembros;
  bin.families += 1;
}
