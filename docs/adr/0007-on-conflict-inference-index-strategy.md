# ADR-0007: ON CONFLICT requires a non-partial, column-inferable unique index

**Status:** Accepted

## Context

Two runtime-breaking defects surfaced in the Mythos audit (2026-06-11, `d3aff9e`):

- `consents.upsert(..., { onConflict: 'person_id,purpose' })` (registration A.3, legally-required consent) targets a constraint that does not exist — `consents` has only a plain non-unique index `idx_consents_person_purpose`. PostgreSQL `ON CONFLICT` requires a matching UNIQUE index, so every valid Group-A submit raises `42P10` at runtime (POS-01/TES-01).
- `syncOfflineQueue.upsert(..., { onConflict: 'person_id,location_id,programa,checked_in_date' })` (offline reconnect flush, SAT Risk #5) targets the `attendances` unique index, which is **partial** (`WHERE person_id IS NOT NULL AND programa IS NOT NULL AND deleted_at IS NULL`). A bare column-list `ON CONFLICT` cannot infer a partial index unless the predicate is also supplied; PostgREST's `onConflict=` emits no predicate → `42P10` → the whole offline batch errors → the queue never drains on first reconnect (POS-02/TES-07).

The legacy-import RPC already learned this lesson: it deliberately targets the **non-partial** `uq_enrollment_person_program` for exactly this reason (migration comment `20260605000001:60-66`). The pattern was not generalized.

## Decision

Any code path that uses `ON CONFLICT` / Supabase `upsert(onConflict: ...)` MUST target a **unique index whose column list alone is sufficient to infer it** — i.e. a non-partial unique constraint over exactly those columns (or one whose predicate is also supplied where the client supports it, which PostgREST does not).

- For soft-delete tables, model uniqueness as a unique index with a `WHERE deleted_at IS NULL` predicate **only** when the write path uses raw `INSERT ... ON CONFLICT (...) WHERE ...` (server-side SQL/RPC), never via PostgREST `onConflict=`.
- When the write path is PostgREST `upsert`, provide a non-partial unique index over the conflict columns, or switch to `INSERT` + `23505`-catch (the `verifyAndInsert` pattern).
- New tables with an upsert path must ship their inference index in the same migration.

## Consequences

- `consents` gets a unique index on `(person_id, purpose)` (predicate handling per the rule above); `attendances` gets a non-partial unique for offline-flush inference, or `syncOfflineQueue` moves to insert+23505. Consent recording and offline flush stop failing in production.
- Reviewers must check, for every new `upsert`, that a matching inferable index exists — a column-list that "looks unique" is not enough.
- A latent class of `42P10` failures (silent until the exact row shape hits the conflict path) is closed; tests must exercise the actual upsert against a real DB, not stop at a guard clause (the prior consent test never reached `.upsert`).
- Slightly more index surface; acceptable for correctness of legally-required and offline-critical writes.
