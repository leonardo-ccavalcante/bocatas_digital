// Reparto assignment engine (Programa de Familia).
//
// Distributes families across the delivery SLOTS of a reparto, balanced by
// PEOPLE (not family count) so each slot carries a similar load. A slot is a
// (date, turno) pair — days are chosen explicitly (non-consecutive, ≤10/month)
// and each day may run mañana, tarde, or both. Pure module — no DB, no side
// effects — so the OR logic is fully unit-testable.
//
// Greedy Longest-Processing-Time (LPT) bin-packing: families are the unit,
// weight = total_miembros. Deterministic. Per-slot capacity is honored; when a
// family cannot fit under any slot's cap it is flagged `unplaced` so the caller
// can tell the operator to raise the cap or add a turno.

// Local 2-value literal (kept dependency-free so the pure engine can be imported
// from both client and server without pulling the @shared alias in). The Zod
// TurnoSchema in shared/repartoSchemas.ts is the validation source of truth.
export type Turno = "manana" | "tarde";

export interface FamilyForReparto {
  /** family UUID */
  id: string;
  /** people in the family — the balancing weight */
  total_miembros: number;
  /** expediente number, used as a stable tie-break and for display */
  familia_numero: number | null;
  /** a previously-agreed slot date (YYYY-MM-DD); a soft anchor on re-balance */
  preferred_day?: string | null;
  /** derived from the family's postal code — lives outside Madrid municipality */
  esFueraMadrid?: boolean;
}

/**
 * A schedulable slot. `ordinal` is its 1-based position in the round's ordered
 * slot list (by date, then turno) and is carried straight through to `day_slot`.
 * This is deliberate: re-assignment runs over a SUBSET of slots (the still-open
 * ones after a given point), and carrying the true ordinal means positions are
 * never re-derived by arithmetic — so a closed slot in the middle can't cause a
 * family to be numbered onto it.
 */
export interface Slot {
  date: string;
  turno: Turno;
  ordinal: number;
  cap?: number | null;
  /** the reserved slot for beneficiaries from outside Madrid */
  esFueraMadrid?: boolean;
}

export interface RepartoAssignment {
  family_id: string;
  assigned_day: string;
  turno: Turno;
  /** 1-based ordinal of the slot within the reparto (= Slot.ordinal) */
  day_slot: number;
  total_miembros: number;
  expediente: string | null;
}

export interface RepartoSlotLoad {
  date: string;
  turno: Turno;
  day_slot: number;
  people: number;
  families: number;
}

export interface RepartoResult {
  assignments: RepartoAssignment[];
  slotLoads: RepartoSlotLoad[];
  /** true when some family could not be placed under the per-slot caps */
  needsMoreCapacity: boolean;
  /** family ids that could not be placed */
  unplaced: string[];
}

interface Bin extends RepartoSlotLoad {
  cap: number | null;
  esFueraMadrid: boolean;
  assignments: RepartoAssignment[];
}

const byLPT = (a: FamilyForReparto, b: FamilyForReparto) =>
  b.total_miembros - a.total_miembros || (a.familia_numero ?? 0) - (b.familia_numero ?? 0);

export function assignReparto(families: FamilyForReparto[], slots: Slot[]): RepartoResult {
  const bins: Bin[] = slots.map((s) => ({
    date: s.date,
    turno: s.turno,
    day_slot: s.ordinal,
    cap: s.cap ?? null,
    esFueraMadrid: s.esFueraMadrid ?? false,
    people: 0,
    families: 0,
    assignments: [],
  }));

  if (bins.length === 0) {
    return { assignments: [], slotLoads: [], needsMoreCapacity: false, unplaced: [] };
  }

  const unplaced: string[] = [];
  const fueraBins = bins.filter((b) => b.esFueraMadrid);

  // 1. Fuera-de-Madrid families get FIRST DIBS on the reserved fuera slot(s),
  //    heaviest first — that gives them their dedicated earlier time. Overflow
  //    (more fuera people than the reserved cap) falls through to the general pool.
  const rest: FamilyForReparto[] = [];
  if (fueraBins.length > 0) {
    const fuera = families.filter((f) => f.esFueraMadrid).sort(byLPT);
    for (const fam of fuera) {
      const target = leastLoadedWithRoom(fueraBins, fam.total_miembros);
      if (target) place(target, fam);
      else rest.push(fam);
    }
    rest.push(...families.filter((f) => !f.esFueraMadrid));
  } else {
    rest.push(...families);
  }

  // 2. Everyone else balances across ALL slots. The reserved fuera slot is only
  //    given PRIORITY to fuera families (step 1); its LEFTOVER capacity is shared
  //    so the round stays feasible when few/no fuera families are detected (e.g.
  //    codigo_postal not yet populated → 0 fuera → the reserved slot acts as a
  //    normal one). preferred_day anchors a family to the first slot of that date.
  const free: FamilyForReparto[] = [];
  for (const fam of rest) {
    const anchor = fam.preferred_day ? firstSlotOfDate(bins, fam.preferred_day, fam.total_miembros) : undefined;
    if (anchor) place(anchor, fam);
    else free.push(fam);
  }
  for (const fam of [...free].sort(byLPT)) {
    const bin = leastLoadedWithRoom(bins, fam.total_miembros);
    if (bin) place(bin, fam);
    else unplaced.push(fam.id);
  }

  return {
    assignments: bins.flatMap((b) => b.assignments),
    slotLoads: bins.map(({ date, turno, day_slot, people, families }) => ({
      date,
      turno,
      day_slot,
      people,
      families,
    })),
    needsMoreCapacity: unplaced.length > 0,
    unplaced,
  };
}

/** First slot on `date` that can still fit `weight` under its cap, else null. */
function firstSlotOfDate(bins: Bin[], date: string, weight: number): Bin | null {
  return bins.find((b) => b.date === date && (b.cap === null || b.people + weight <= b.cap)) ?? null;
}

/**
 * Least-loaded slot that can still fit `weight` under its cap. Uncapped slots
 * always have room. Returns null when nothing fits.
 */
function leastLoadedWithRoom(bins: Bin[], weight: number): Bin | null {
  const feasible = bins.filter((b) => b.cap === null || b.people + weight <= b.cap);
  if (feasible.length === 0) return null;
  return feasible.reduce((a, b) => (a.people <= b.people ? a : b));
}

export interface CapacityCheck {
  feasible: boolean;
  /** total seats = sum of slot caps, or null when any slot is uncapped */
  capacity: number | null;
  /** people that don't fit (0 when feasible or uncapped) */
  shortfall: number;
}

/**
 * Up-front feasibility: can `totalPeople` fit across `slots`? If any slot is
 * uncapped the round is always feasible. Pure arithmetic — used to give the
 * operator a precise "faltan N — sube el cupo o añade un turno" message before
 * any assignment runs.
 */
export function repartoCapacityCheck(totalPeople: number, slots: Slot[]): CapacityCheck {
  const hasUncapped = slots.some((s) => s.cap == null);
  if (hasUncapped || slots.length === 0) {
    return { feasible: true, capacity: null, shortfall: 0 };
  }
  const capacity = slots.reduce((sum, s) => sum + (s.cap ?? 0), 0);
  if (totalPeople <= capacity) return { feasible: true, capacity, shortfall: 0 };
  return { feasible: false, capacity, shortfall: totalPeople - capacity };
}

export interface TargetSlotInput {
  /** stable key, e.g. `${date}#${turno}` */
  key: string;
  /** operator-fixed people count for this slot, if any; null/undefined = auto */
  override?: number | null;
}

export interface TargetSlotResult {
  key: string;
  /** people assigned to this slot (the slot's cupo) */
  people: number;
  /** true when this value came from an operator override, not the equal split */
  overridden: boolean;
}

export interface DistributeTargetsResult {
  slots: TargetSlotResult[];
  /** people actually placed across all slots */
  assigned: number;
  /** people left over — only when every slot is fixed and their sum < total */
  leftover: number;
  /** true when the fixed overrides already exceed the total (free slots forced to 0) */
  overCommitted: boolean;
}

/**
 * Planning-time split (NOT family assignment): spread `total` people equally
 * across the given slots. Slots with an `override` keep that fixed value; the
 * REMAINING people are divided equally among the un-fixed slots — this is the
 * "recalcular para os outros": fix one slot and the rest rebalance. The integer
 * remainder is handed out +1 at a time to the first free slots (deterministic,
 * order-preserving). Pure arithmetic — no families, no DB — so the form can
 * recompute on every keystroke.
 */
export function distributeTargets(total: number, slots: TargetSlotInput[]): DistributeTargetsResult {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const norm = slots.map((s) => ({
    key: s.key,
    override: s.override == null ? null : Math.max(0, Math.floor(s.override)),
  }));

  const usedByOverrides = norm.reduce((sum, s) => sum + (s.override ?? 0), 0);
  const freeCount = norm.filter((s) => s.override == null).length;
  const overCommitted = usedByOverrides > safeTotal;
  const remaining = Math.max(0, safeTotal - usedByOverrides);

  const base = freeCount > 0 ? Math.floor(remaining / freeCount) : 0;
  let extra = freeCount > 0 ? remaining - base * freeCount : 0;

  const result: TargetSlotResult[] = norm.map((s) => {
    if (s.override != null) return { key: s.key, people: s.override, overridden: true };
    const people = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    return { key: s.key, people, overridden: false };
  });

  const assigned = result.reduce((sum, s) => sum + s.people, 0);
  const leftover = freeCount === 0 ? remaining : 0;
  return { slots: result, assigned, leftover, overCommitted };
}

/**
 * Kilos for one family under a linear (per-person) split of the round total.
 * `kg_total` distributed over `totalPersonas` people, times this family's size.
 * Rounds to a whole kg. Returns 0 when there are no people. (Unchanged: kg are
 * a per-round physical stock, independent of how days/turnos are scheduled.)
 */
export function computeKgPerFamily(kgTotal: number, totalPersonas: number, miembros: number): number {
  if (totalPersonas <= 0) return 0;
  return Math.round((kgTotal / totalPersonas) * miembros);
}

function place(bin: Bin, fam: FamilyForReparto): void {
  bin.assignments.push({
    family_id: fam.id,
    assigned_day: bin.date,
    turno: bin.turno,
    day_slot: bin.day_slot,
    total_miembros: fam.total_miembros,
    expediente: fam.familia_numero !== null ? String(fam.familia_numero) : null,
  });
  bin.people += fam.total_miembros;
  bin.families += 1;
}
