# ADR-0011 — User-identity columns are TEXT (Manus OAuth), not UUID-FK to auth.users

- **Status:** Accepted (2026-07-08)
- **Related:** #116 (TES-04), migration `20260501131457_fix_autor_id_and_edited_by_uuid_to_text`, ADR-0002 (RLS bypassed app-wide; redaction is the boundary)

## Context

Authentication is **Manus OAuth**, not Supabase Auth. Two consequences:

1. `ctx.user.id` is a **local MySQL autoincrement integer** (drizzle `users.id`, a legacy auth helper — not the source of truth). The app's established convention for "which app user performed this action" is **`String(ctx.user.id)`** — used consistently by `announcements.autor_id`, `programs.created_by`, `instituciones.created_by`, `familySavedViews.user_id`, and the announcements audit trail.
2. **`auth.uid()` is not available** at write time (there is no Supabase-auth session under Manus OAuth), so `checkin` and `consents` write `registrado_por = null`.

Several early tables declared their actor column as `uuid REFERENCES auth.users(id)` (`attendances`, `consents`, `deliveries`). That only works if a Supabase-auth UUID is written — which never happens under Manus. Migration `20260501131457` already converted `announcements.autor_id`/`edited_by` from `uuid` to `text` for exactly this reason.

`deliveries.registrado_por` was the **inconsistent straggler**: the repo migration chain still produces `uuid` on a clean `db reset` (earliest create wins; the later v2 `TEXT` creates are `CREATE TABLE IF NOT EXISTS` no-ops), while **production was manually fixed to `text`**. `entregas.createDelivery` writes a non-UUID app-user identity, so a clean CI/dev reset raised `22P02 invalid input syntax for type uuid`. This repo↔prod drift is #116 (TES-04).

## Decision

Columns that store the **acting app user's identity are `text`**, holding `String(ctx.user.id)`, with **no FK to `auth.users`**.

- `deliveries.registrado_por` is aligned to `text` (migration `20260707000007`), matching production.
- RLS policies that compare such a column to `auth.uid()` must **cast `(auth.uid())::text`** (CI's stricter Postgres rejects `uuid = text`). These checks are largely vestigial because reads/writes go through `service_role`, which bypasses RLS (ADR-0002).

## Consequences

**Positive**
- One consistent actor-identity representation across tables.
- No `22P02` under Manus OAuth; a clean `db reset` now reproduces production.

**Negative / accepted**
- No DB-level referential integrity to an auth users table. Accepted: the Manus `users` table is a legacy helper (not the source of truth) and RLS is bypassed app-wide anyway.
- `attendances.registrado_por` and `consents.registrado_por` remain `uuid` today. They are **not broken** (they write `null` under Manus), but they are inconsistent with this decision. Aligning them to `text` is a **follow-up**, out of #116 scope.
