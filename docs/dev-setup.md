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

# Regenerate DB types — CANONICAL recipe (matches the ci-types-drift.yml gate).
# NEVER a bare `supabase gen types --local`: it adds a graphql_public block that
# fails the types-drift CI gate.
supabase gen types typescript \
  --db-url "$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')" \
  --schema public > client/src/lib/database.types.ts
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

# 3. Regenerate types — canonical recipe (NEVER bare --local; see First-time setup)
supabase gen types typescript \
  --db-url "$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')" \
  --schema public > client/src/lib/database.types.ts

# 4. Verify the types-drift gate locally: regen into a tempfile and diff — must be
#    identical to the committed file BEFORE you commit.

# 5. Run tests
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
- **`supabase db reset` errors mid-replay** — most often a migration ordering or environment-divergence issue. Migrations must be existence-tolerant (guard undefined_object AND undefined_column AND undefined_table); filename ordering is enforced by the `ci-migration-filenames.yml` gate.
- **Manus OAuth flow not working in dev** — set `VITE_OAUTH_PORTAL_URL=http://localhost:3001` and run a local OAuth portal, OR use the seeded email/password test users above.

## Cloud VM / Cursor Cloud bringup

For agents running in a fresh cloud VM (e.g. Cursor Cloud). The update script only
runs `pnpm install` — Docker, the Supabase CLI, MySQL, and all service startup are
NOT in it; start them yourself each session:

1. **Docker** (not running by default):
   `sudo dockerd > /tmp/dockerd.log 2>&1 &` then `sudo chmod 666 /var/run/docker.sock`.
   Docker 29 needs `/etc/docker/daemon.json` with `storage-driver: fuse-overlayfs`
   and `features.containerd-snapshotter: false`, plus `iptables-legacy`.
2. **Supabase**: the Supabase config file is git-ignored, so run `supabase init`
   once, then `supabase start` (prints ANON_KEY / SERVICE_ROLE_KEY).
   `supabase db reset` applies migrations. The seed file is intentionally empty.
3. **MySQL auth DB** (required — role lookups come from it):
   `docker run -d --name bocatas-mysql -e MYSQL_ROOT_PASSWORD=rootpass -e MYSQL_DATABASE=bocatas_auth -e MYSQL_USER=user -e MYSQL_PASSWORD=pass -p 3306:3306 mysql:8`
   then create the schema:
   `DATABASE_URL="mysql://user:pass@localhost:3306/bocatas_auth" pnpm exec drizzle-kit push`.

### Env-file gotcha (bites every fresh environment)

The **server** loads `.env` via dotenv's default file, NOT `.env.local`. Vite (client)
reads `.env.local`/`.env`. Server-only vars (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `DATABASE_URL`, `OAUTH_SERVER_URL`,
`VITE_APP_ID`) must be present in **`.env`** or the server silently runs without DB
access / with an ephemeral JWT. Simplest: copy `.env.example` to both `.env` and
`.env.local`, fill in the Supabase keys from `supabase start`, a stable `JWT_SECRET`
(`openssl rand -base64 48`), the MySQL `DATABASE_URL`, a non-empty `VITE_APP_ID`,
and `SUPABASE_JWT_SECRET`.

### Authenticated browser session without the OAuth portal

The UI login is Manus-OAuth-only and the portal is not run locally. Auth identity
**and role** come from the MySQL `users` table (`getUserByOpenId`) — without MySQL,
every protected/admin tRPC call is FORBIDDEN. To get a session:

1. Seed an admin in MySQL: insert a row into `users` with a known `openId`
   (e.g. `dev-superadmin`) and `role='superadmin'`.
2. Forge the httpOnly session cookie `app_session_id` — a JWT signed with
   `JWT_SECRET` (HS256) containing `{ openId, appId, name }` where `appId` equals
   `VITE_APP_ID` and `name` is non-empty (see `server/_core/sdk.ts`). Set it via a
   temporary non-production route or DevTools (`SameSite=Lax`, not `None`, so the
   browser accepts it over http). `VITE_APP_ID` must be non-empty or session
   verification fails.

### Dev-server note (regression guard)

`pnpm dev` mounts Vite in middleware mode via `server/_core/vite.ts`, which reads
`vite.config.ts`. That config is a `defineConfig(fn)` **function** export; the file
resolves the function before spreading it (previously spreading the function gave an
empty config → blank page / main-module 404). Keep that resolution in place.

## Where to look next

- **Playbook (all agents)** — [`AGENTS.md`](../AGENTS.md)
- **High-level architecture** — [`README.md`](../README.md) + [`ARCHITECTURE.md`](../ARCHITECTURE.md)
- **Plan-driven work history** — [`docs/superpowers/plans/`](./superpowers/plans/) (historical)
- **Schema migration history** — `supabase/migrations/`
- **What's deferred / archived** — [`docs/archive/`](./archive/) (historical)
