# `drizzle/` — Manus auth schema (MySQL, separate from Supabase)

This directory contains the schema for the **MySQL database** that backs Manus OAuth user records — distinct from the Supabase Postgres database that holds all application data (`persons`, `families`, `attendances`, etc.).

## What lives here

| File | Purpose | Status |
|---|---|---|
| [`schema.ts`](./schema.ts) | Typed Drizzle schema (MySQL) for the `users` table that backs Manus OAuth, plus a minimal `families` shape for legacy code paths. Imported by [`server/db.ts`](../server/db.ts), [`server/_core/context.ts`](../server/_core/context.ts), [`server/_core/sdk.ts`](../server/_core/sdk.ts). | **Live** — do not delete |
| [`relations.ts`](./relations.ts) | Drizzle relations definitions. | **Live** |
| [`migrations/`](./migrations/) | drizzle-kit-managed migration journal for the MySQL schema above. | **Live** |
| [`meta/`](./meta/) | drizzle-kit metadata snapshots. | **Live** |
| [`seeds/`](./seeds/) | drizzle-kit seed scripts. | **Live** |

## What is NOT here anymore (deleted in Phase 3)

The following SQL files were removed because they predated the Supabase migration system and were never part of the canonical migration history applied to either DB:

- ~~`0000_dusty_gwen_stacy.sql`~~ (drizzle-kit auto-named generation; superseded)
- ~~`0002_romantic_screwball.sql`~~ (drizzle-kit auto-named generation; superseded)
- ~~`supabase-entregas-migration.sql`~~ (early prototype for `entregas`/`entregas_batch`, replaced by canonical `public.deliveries` table — see migration `20260501000010_create_deliveries_table.sql`)

If drizzle-kit ever regenerates SQL migrations into this directory, those files belong in [`./migrations/`](./migrations/), not at the root.

## Don't confuse the two databases

| Concern | Database | Schema source of truth |
|---|---|---|
| OAuth user identity | **MySQL** (Manus) | `drizzle/schema.ts` |
| All application data: persons, families, attendances, deliveries, announcements, … | **Supabase Postgres** | `supabase/migrations/*.sql` |

The Supabase migration system is canonical for application schema. Do not add CREATE TABLE for application tables here.

## Why drizzle-kit migrations and Supabase migrations coexist

The Manus auth side (MySQL) is small and isolated — `users` table only. drizzle-kit handles its migrations. The Supabase side is the production data plane, managed separately via `supabase/migrations/`. The two systems do not share state and cannot be unified without a major rearchitecture of the auth flow.
