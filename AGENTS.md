# AGENTS.md

## Cursor Cloud specific instructions

Bocatas Digital is a single pnpm workspace (Node ≥ 20, pnpm 10) with three layers:
`client/` (Vite + React 19 SPA), `server/` (Express + tRPC), `shared/`. Standard
commands live in `package.json` scripts and `docs/dev-setup.md` / `README.md` —
reference those; only the non-obvious caveats are captured here.

### Services (all run locally in one dev process + Docker)

| Service | How to run | Required? |
|---|---|---|
| App (Vite + tRPC) | `pnpm dev` → http://localhost:3000 | Yes |
| Supabase local stack | `supabase start` (Docker) — app + auth data | Yes |
| MySQL auth DB | Docker MySQL 8 on :3306 — holds users + roles | Yes (see below) |

The update script only runs `pnpm install`. Docker, the Supabase CLI, MySQL, and
all service startup are NOT in it — start them yourself each session as below.

### Bringing the stack up from a fresh VM

1. Start Docker (not running by default):
   `sudo dockerd > /tmp/dockerd.log 2>&1 &` then `sudo chmod 666 /var/run/docker.sock`.
   Docker 29 needs `/etc/docker/daemon.json` with `storage-driver: fuse-overlayfs`
   and `features.containerd-snapshotter: false`, plus `iptables-legacy`.
2. Supabase: `supabase/config.toml` is git-ignored, so run `supabase init` once,
   then `supabase start` (prints ANON_KEY / SERVICE_ROLE_KEY). `supabase db reset`
   applies migrations. `supabase/seed.sql` is intentionally empty.
3. MySQL auth DB:
   `docker run -d --name bocatas-mysql -e MYSQL_ROOT_PASSWORD=rootpass -e MYSQL_DATABASE=bocatas_auth -e MYSQL_USER=user -e MYSQL_PASSWORD=pass -p 3306:3306 mysql:8`
   then create the schema with `DATABASE_URL="mysql://user:pass@localhost:3306/bocatas_auth" pnpm exec drizzle-kit push`.

### Environment files — IMPORTANT gotcha

The **server** loads `.env` via `import "dotenv/config"` (default file), NOT
`.env.local`. Vite (client) reads `.env.local`/`.env`. So server-only vars
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `DATABASE_URL`,
`OAUTH_SERVER_URL`, `VITE_APP_ID`) must be present in **`.env`** or the server
silently runs without DB access / with an ephemeral JWT. Simplest: copy
`.env.example` to both `.env` and `.env.local`, then fill in the Supabase keys
from `supabase start`, a stable `JWT_SECRET` (`openssl rand -base64 48`),
`DATABASE_URL=mysql://user:pass@localhost:3306/bocatas_auth`, a non-empty
`VITE_APP_ID`, and `SUPABASE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long`.

### Auth / login gotcha

The UI login is **Manus-OAuth-only** (no email/password form), and the OAuth
portal is not run locally. Auth identity **and role** come from the MySQL `users`
table (`getUserByOpenId`), so MySQL is effectively **required** despite docs
calling it "optional" — without it every protected/admin tRPC call is FORBIDDEN.
The seeded Supabase `auth.users` are only for RLS integration tests, not app login.

To get an authenticated browser session without the OAuth portal:
1. Seed an admin in MySQL: insert a row into `users` with a known `openId`
   (e.g. `dev-superadmin`) and `role='superadmin'`.
2. Forge the httpOnly session cookie `app_session_id` — a JWT signed with
   `JWT_SECRET` (HS256) containing `{ openId, appId, name }` where `appId` equals
   `VITE_APP_ID` and `name` is non-empty (see `server/_core/sdk.ts` `signSession`).
   Set it via a temporary non-production route or Chrome DevTools (use
   `SameSite=Lax`, not `None`, so Chrome accepts it over http). `VITE_APP_ID` must
   be non-empty or session verification fails.

### Lint / test / build

`pnpm lint` (0 errors; ~111 pre-existing warnings are fine), `pnpm check`,
`pnpm test` (vitest; DB-gated tests self-skip unless `RUN_LOCAL_SUPABASE_TESTS=true`),
`pnpm build`. Set placeholder Supabase env for tests/build if the stack isn't up
(see `.github/workflows/ci.yml`).

### Note on the dev-server fix

`pnpm dev` mounts Vite in middleware mode via `server/_core/vite.ts`, which reads
`vite.config.ts`. That config is a `defineConfig(fn)` **function** export; the file
now resolves the function before spreading it (previously spreading the function
gave an empty config → blank page / `/src/main.tsx` 404). Keep that resolution in
place.
