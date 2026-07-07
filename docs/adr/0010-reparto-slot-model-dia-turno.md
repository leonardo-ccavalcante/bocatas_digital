# ADR-0010 — Reparto scheduling unit is a SLOT = (día, turno) on an explicit non-consecutive day agenda

- **Status:** Accepted (2026-07-06, Leo)
- **Deciders:** Leo (Product/Tech Lead)
- **Context source:** Stakeholder review (Jorge/Espe/Sole) — the real reparto runs on chosen non-consecutive days, each optionally split into mañana/tarde. Plan triple-checked (SAT · apolo/sisyphus/atropos) before build.

## Context

The original Reparto model stored `delivery_rounds.fecha_inicio + dias_reparto (INTEGER)` and
generated that many **consecutive** delivery days (`repartoDays()`), balancing families across them.
The real operation does not work this way: the operator picks **specific days within a month**
(up to 10, not consecutive), and a given day may run a morning turno, an afternoon turno, or both.
Distribution, the Hoja de Firmas, close-out and re-assignment all need to address a specific
(día, turno), not just a día.

## Decision

The scheduling unit is a **SLOT = (slot_date, turno)**, turno ∈ {mañana, tarde}.

- A new table `delivery_round_slots(round_id, slot_date, turno, cap, estado, cerrado_*, signed_acta,
  UNIQUE(round_id, slot_date, turno))` holds the explicit slot agenda. It can represent a *planned but
  empty* slot, and carries a per-slot cap (cupo por turno), a per-slot close state, and the per-slot
  signed acta.
- `delivery_round_assignments` gains a `turno` column; a family maps to exactly one slot via
  `(round_id, assigned_day, turno)`, enforced by a **composite FK** to `delivery_round_slots`
  (ON DELETE CASCADE). `UNIQUE(round_id, family_id)` stays: re-assigning a family that missed its
  turno is an UPDATE of its slot, never a second row.
- The consecutive-day columns (`dias_reparto`, `cap_per_day`, `cap_mode`, day-keyed `signed_actas`)
  are DROPPED. `fecha_inicio` is kept but DERIVED server-side = `min(slot_date)` (preserves listRounds order).
- The pure engine balances people across the `Slot[]` (greedy LPT). Each slot carries its true
  `ordinal` (position in the ordered list) so re-assignment over a SUBSET of still-open slots never
  mis-numbers a family onto a closed slot. The exact solver was removed (unreachable at ≤20 slots).
- A reparto is **complete only when every slot is closed** (`closeRound` gate). Closing a turno marks
  its remaining pendientes as no-show (`attended=false`) so the absentismo metric counts them.

The composite FK (not app-only enforcement) was chosen so a phantom assignment cannot bypass the
completion gate.

## Consequences

- **+** The data model matches the funder-facing operation; per-turno Hoja de Firmas and close-out are
  first-class; the completion gate makes "reparto cerrado" a real invariant.
- **+** Zod is a single source of truth in `shared/repartoSchemas.ts` (server + client import it).
- **−** A cross-boundary import remains: the pure engine lives under `client/.../utils` and is imported
  by the server routers (pre-existing; kept to avoid an unrelated move).
- Migration is greenfield-safe (`delivery_rounds` count = 0 in prod, verified) and also backfills any
  existing test rows to a synthesized 'mañana' slot before adding the composite FK.
