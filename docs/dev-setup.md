# Local development setup

> One-time setup + recurring commands for Bocatas Digital. If something here is wrong, fix it — this is the canonical onboarding doc.

## Prerequisites

- **Node.js ≥ 20** (recommended via `nvm` or `fnm`)
- **pnpm 10** (`npm install -g pnpm@10`)
- **Supabase CLI** ([install](https://supabase.com/docs/guides/cli))
- **Docker** (Supabase CLI uses it for the local stack)

## First-time setup

```bash
git clone https://github.com/leonardo-ccavalcante/bocatas_digital.git
cd bocatas_digital
pnpm install

cp .env.example .env.local
# Edit .env.local — fill in the values described in the file's comments.
# For local dev, leave the SUPABASE_* and VITE_SUPABASE_* placeholders;
# they'll be auto-replaced by `supabase status` after step below.

supabase start
# Prints the local URL + anon key + service-role key. Copy those into .env.local.

supabase db reset
# Applies all migrations + seeds test data + creates 4 auth.users (see below).

supabase gen types typescript --local > client/src/lib/database.types.ts
```

## Test users (local only)

`supabase db reset` seeds 4 auth.users with role claims in `raw_user_meta_data`. These exist **only in your local Supabase** — production uses Manus OAuth.

| Role | Email | Password |
|---|---|---|
| Voluntario | `voluntario@bocatas.test` | `BocatasVol2026!` |
| Admin | `admin@bocatas.test` | `BocatasAdmin2026!` |
| Superadmin | `superadmin@bocatas.test` | `BocatasSuperAdmin2026!` |
| Beneficiario | `beneficiario@bocatas.test` | `BocatasBen2026!` |

> **Why these aren't in `.env.example`**: passwords are dev-only fixtures, not secrets, but committing them in a file alongside real env-var keys would muddy the security boundary. Keep them in this doc.

If the seeded users are missing after `supabase db reset`:
1. Open [Supabase Dashboard → Authentication](http://localhost:54323/project/default/auth/users)
2. Add Users with the emails above + the matching passwords
3. For each: edit `raw_user_meta_data` and set `{"role": "voluntario"}` (or admin/superadmin/beneficiario)

## Daily commands

```bash
pnpm dev         # Vite + tRPC server (port 3000)
pnpm check       # tsc --noEmit (must pass before commit)
pnpm lint        # ESLint
pnpm test        # Vitest
pnpm build       # Production build
```

## After a schema change

```bash
# 1. Write the migration
$EDITOR supabase/migrations/$(date +%Y%m%d%H%M%S)_description.sql

# 2. Apply locally + verify
supabase db reset

# 3. Regenerate types
supabase gen types typescript --local > client/src/lib/database.types.ts

# 4. Run tests
pnpm test
```

## Promoting a user to admin/superadmin

Run in Supabase SQL Editor (local or prod, with appropriate permissions):

```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"superadmin"'::jsonb            -- or "admin"
)
WHERE email = 'leo@bocatas.io';
```

The user must sign out + back in to pick up the new role claim in their JWT.

## Common pitfalls

- **`pnpm dev` says port 3000 in use** — set `PORT=3001` in `.env.local`, or kill the offender (`lsof -ti :3000 | xargs kill`).
- **`supabase start` fails on Docker** — ensure Docker Desktop is running (or `colima start` on macOS).
- **`supabase db reset` errors mid-replay** — most often a migration ordering issue. Look at the EXPORTED/ folder to see if the file order needs reconciliation. See [`supabase/migrations/EXPORTED/README.md`](../supabase/migrations/EXPORTED/README.md).
- **Manus OAuth flow not working in dev** — set `VITE_OAUTH_PORTAL_URL=http://localhost:3001` and run a local OAuth portal, OR use the seeded email/password test users above.

## Where to look next

- **High-level architecture** — [`README.md`](../README.md)
- **Plan-driven work history** — [`docs/superpowers/plans/`](./superpowers/plans/)
- **Schema migration history** — `supabase/migrations/` + `supabase/migrations/EXPORTED/`
- **What's deferred / archived** — [`docs/archive/2026-05-05/`](./archive/2026-05-05/)
