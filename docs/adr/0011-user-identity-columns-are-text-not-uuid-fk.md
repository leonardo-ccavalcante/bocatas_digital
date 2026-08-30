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

## Amendment (2026-08-30, #145) — the premise changed, the decision holds

The premise above ("Authentication is **Manus OAuth**, not Supabase Auth") is **no
longer true**: Manus is gone and identity now comes from **Supabase Auth**, so
`ctx.user.id` IS a real `auth.users` UUID (`authenticateRequest` reads it from
GoTrue). This does **not** reverse the decision — it only retires its stale premise.

What stays true, and must not be "finished" into a regression:

- The columns already migrated to `text` — `deliveries.registrado_por`,
  `announcements.autor_id` / `edited_by`, `programs.created_by`,
  `instituciones.created_by`, `familySavedViews.user_id` — **remain `text`**. Do
  **not** convert them back to `uuid`: `entregas.createDelivery` and the announcements
  writers store `String(ctx.user.id)`, and a `uuid` column reintroduces the `#116`
  `22P02 invalid input syntax for type uuid` on a clean `db reset`.

- `attendances.registrado_por` and `consents.registrado_por` **remain
  `uuid REFERENCES auth.users(id)`**. They are no longer written as `null`: since
  #145 they receive `ctx.user.id` written **server-side** via `authActorId`
  (`server/_core/actorId.ts`). Because they FK-reference `auth.users`, `authActorId`
  returns `null` for an id that is not a real auth UUID — notably the
  `DEV_ADMIN_LOGIN` synthetic user (`"dev-admin-uuid"`), which is not an `auth.users`
  row and would otherwise raise `23503`. The earlier "align them to `text`" follow-up
  is **withdrawn**: as `uuid`-FK columns fed a real auth UUID, they are correct as-is.

Net: two representations coexist on purpose — `text` (no FK) for the older Manus-era
columns that already hold `String(ctx.user.id)`, and `uuid`-FK for the check-in/consent
columns now fed a verified `auth.users` id. Neither should be migrated toward the other.
