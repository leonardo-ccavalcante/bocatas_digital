# ADR-0013 — Reparto suggested day is non-binding; no-shows carry over; the round marks ausentes at close

- **Status:** Accepted (2026-07-23, Leo)
- **Deciders:** Leo (Product/Tech Lead)
- **Context source:** Real use of the E5 reparto (Leo): the fixed day×turno assignment did not work — families could not always come on their assigned day, and prod carried 1858 assignments across 11 rounds with **zero attendance ever marked**. Redesign scoped with the skill-router elicitation (problem-solving · SAT · CEO) + a scoped Mythos diagnostic (32 verified findings) + /cso + /karpathy.
- **Supersedes:** the close-out semantics of [ADR-0010](0010-reparto-slot-model-dia-turno.md) (the slot = (día, turno) model itself is KEPT).

## Context

ADR-0010 bound each family to exactly one slot and made `cerrar_turno` mark that slot's remaining
pendientes as no-show on close. Operationally this is wrong: a family that cannot come on its assigned
day should still be served on another day, and the reparto only truly ends on the last day, once every
family has had the chance to pass. The fixed-cupo creation form (operator types a total headcount and
per-slot caps) also blocked activation whenever the guessed headcount was below the real eligible count.

## Decision

1. **All active families are included automatically.** A round covers every `families.estado='activa'`
   family (`get_active_families_for_reparto()`), sized by the DECLARED `num_adultos + num_menores_18`
   (never member-row counts — `familia_miembros` is sparse in prod). The creation form no longer asks for
   a total or per-slot cupos. Cupos become **reference-only** (a per-day forecast + `overCap` warning),
   never blocking.
2. **The assigned slot is a SUGGESTION, non-binding.** A family may attend ANY open day. The suggestion
   is computed by a **sequential fill, smallest family first**: each slot gets a target headcount (equal
   split, cap as override); families are poured into slots in chronological order so the smaller families
   land on the earlier days and each day has a predictable headcount.
3. **Where the family actually attended is recorded separately** — a new nullable
   `delivery_round_assignments.attended_slot_id`. `attended IS NULL` = pending (shows on every open day's
   roster — carry-over is structural, no rows are moved). A guard trigger anchors attendance immutability
   to the ACTUAL slot (or, for pre-migration finalised rows, the suggested slot — the legacy branch) and
   to the round being `cerrada`.
4. **Closing a day (`cerrar_turno`) only LOCKS it.** It no longer marks anyone no-show; pending families
   roll forward automatically.
5. **The round marks ausentes at close.** `close_round(round_id, actor, notas)` requires every slot
   closed, sets never-attended families to `attended=false` (with `attended_slot_id` NULL = "ausente de la
   ronda"), then flips `estado='cerrada'` — atomically, writing the ausentes while still `activa` so the
   guard trigger allows its own write.
6. **Contact records up to 2 preferred days or an early renuncia** (`preferred_slot_ids UUID[]`,
   `estado_contacto='renuncia'`), admin-only, audited in `reschedule_log`.
7. **Activation is server-authoritative.** The client sends only the round id; the server derives the
   family set and runs the engine (`activateRound`). The old "client uploads the assignment rows"
   (`commitAssignments`) path and the unused `assign-reparto` edge function are removed.

## Consequences

- **+** Matches the real operation: nobody is stranded by a fixed day; "reparto cerrado" stays a real
  invariant (marked once, at the end); the smallest-first fill gives each day a predictable load.
- **+** Root-causes several verified defects by construction: the one-tap irreversible no-show, the
  `reassignPending` race that wiped `attended=true`, the cupo-overfill on carry-over, and the
  activation-blocked-by-guessed-cap trap all disappear.
- **+** Backward-compatible: all 1858 prod rows are `attended IS NULL` (no finalised data to migrate);
  the trigger's legacy branch protects any pre-migration finalised rows; soft-deleted rounds are untouched.
- **−** Print rosters are now round-scope (all pending) — up to ~9 A4 pages/day early in a round; mitigated
  by in-app search + a page-count estimate. Final print-format call (full list vs. expected+blank) is a
  stakeholder decision with Sole.
- The on-screen signature capture is a SEPARATE, RGPD-gated change (env `REPARTO_FIRMA_ENABLED`), not part
  of this ADR.
