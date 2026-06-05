# Verify the Legacy "Programa de Familia" importer works — locally, no prod, no lawyer

**TL;DR:** The RGPD/EIPD addendum, the prod migration apply, and the §5 weak-match
UI **do not block testing that the importer works**. They gate **prod go-live**.
Locally, with **synthetic (non-PII) data** against the Docker Supabase, you can
exercise the entire importer end-to-end right now. Talk to the lawyer *after*
you've confirmed it works — which is the point of this runbook.

## Why those three items don't block local testing

| Item | What it actually gates |
|------|------------------------|
| EIPD addendum for the Art.9 narrative | Importing **real** social-report text into **prod**. Synthetic local text needs no addendum. |
| `bulk_import_previews` purge job | The plaintext stash carrying **real** Art.9 text in **prod**. Local dev data is disposable. |
| Prod migration apply + staged review | Touching **prod**. Local migrations are already applied via `supabase db reset`. |
| §5 weak-match confirmation UI | Only *weak* `name_first_apellido` matches (they stay flag-only either way). The core import works without it. |

## Path A — automated end-to-end (deterministic proof)

Runs a real synthetic CSV through the **exact tRPC procedures the UI calls**, all
the way to real DB rows: roster `preview → confirm (skip)` → `update` re-sync →
INFORMES narrative enrich.

```bash
# from repo root, with Docker + the local Supabase stack up
npx supabase start                 # if not already running
npx supabase db reset              # apply all migrations (incl. 20260605000001-02)
set -a; . ./.env.test.local; set +a # local Supabase creds (gitignored)
corepack pnpm exec vitest run server/__tests__/legacy-familias-e2e.integration.test.ts
```

Green means: a 5-family synthetic CSV created real `families` + `persons` +
`familia_miembros` + `programa_familias` enrollments; `update` mode re-synced
them idempotently; and the INFORMES narrative backfilled onto family 1030.

> `.env.test.local` is gitignored. Regenerate it with:
> `npx supabase status -o env` (map `API_URL→VITE_SUPABASE_URL`,
> `ANON_KEY→VITE_SUPABASE_ANON_KEY`, `SERVICE_ROLE_KEY→SUPABASE_SERVICE_ROLE_KEY`,
> `JWT_SECRET→SUPABASE_JWT_SECRET`, plus `RUN_LOCAL_SUPABASE_TESTS=true`).

The same harness covers the focused proofs:
`confirm-legacy-import-upsert.integration.test.ts` (update/enrollment/idempotency),
`enrich-informes-rpc.integration.test.ts` (enrich backfill).

## Path B — drive the UI yourself (visual confirmation)

```bash
cp .env.example .env.local         # fill in Supabase + Manus OAuth (for login)
set -a; . ./.env.local; set +a
corepack pnpm dev                  # http://localhost:3000
```

Then in the app: **Programas → Programa de Familia → Importar**. The modal has two
lanes:
- **Padrón (familias):** upload `tests/fixtures/legacy-familias-prueba.csv`. Toggle
  **"actualizar familias existentes"** to re-run in update mode.
- **Informes sociales (enriquecer):** upload an INFORMES sheet to backfill the
  narrative + member data onto families already in the padrón.

Login needs Manus OAuth (`OAUTH_SERVER_URL` etc.) — without it the server still
boots and serves, but you can't authenticate. Path A bypasses login entirely.

## When the three gates DO matter (before prod)

1. Sign the **EIPD addendum** for the Art.9 narrative.
2. Add the **`bulk_import_previews` purge job** (TTL is query-time only today).
3. Apply migrations to prod manually + run the staged review (backup/GUF export →
   Docker dry-run → ~5-family canary on prod → full → rollback by `legacy_numero`).
4. (Optional) build the §5 weak-match confirmation UI so weak matches can be
   promoted to writes.
