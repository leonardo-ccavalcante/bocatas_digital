# AGENTS.md — Bocatas Digital playbook

> The canonical operating manual for every AI agent (Claude Code, Codex, Cursor) and
> human contributor in this repo. **Durable rules and live-source pointers only.**
> Never add "current state" snapshots, dates, counts, or feature inventories here —
> they rot and mislead. The drift gate (`scripts/check-agents-docs.mjs`, run on every
> PR) rejects stale-state patterns and broken path references in this file.

## Identity

Replace the fragmented legacy systems (Notion, Excel, cardboard punch card, Google
Sheets, GUF, text notes) with one digital platform for **Asociación Bocatas** —
4,000+ vulnerable people/year in Madrid. North Star: personas registradas con ≥1
check-in digital en los últimos 30 días. Domain vocabulary lives in `CONTEXT.md`
(canonical Spanish terms — never drift to synonyms).

| Person | Role |
|---|---|
| Leo | Product/Tech Lead — final call on conflicts, merges, scope |
| Felix | Sr. Engineer |
| Nacho / Espe | Bocatas stakeholders (comedor operations) |
| Sole | Families Program coordinator (Programa de Familia stakeholder) |

## Live state — query it, never trust prose

This file deliberately contains no scope trees, feature lists, table inventories, or
status snapshots. Current state comes from live sources:

| What | Source |
|---|---|
| Open work (bugs, debt, regressions) | `gh issue list --state open` — the ONLY live register |
| In-flight changes | `gh pr list` |
| What shipped recently | `git log --oneline -20 origin/main` |
| Feature / router inventory | `ls client/src/features server/routers` |
| Schema truth | `supabase/migrations/` + generated `client/src/lib/database.types.ts` |
| Domain vocabulary | `CONTEXT.md` |
| Architectural decisions | `docs/adr/` — read the ADRs touching your area before working in it |
| Security architecture | `ARCHITECTURE.md` |

In-repo ledgers and plan files (`docs/TECH_DEBT.md`, `docs/plans/`, audit snapshots)
are HISTORICAL. Never re-derive "what's open" from them — reconcile against
`origin/main` and the issue tracker instead.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vite SPA · React · TypeScript strict · wouter · shadcn/ui (Radix) · Tailwind |
| API | Express + tRPC — single root router `server/routers.ts`; feature routers under `server/routers/` |
| State | TanStack Query (server state, `queryKeys` per feature) · Zustand (UI only) · XState (check-in flow ONLY) |
| Validation | Zod — single source of truth, co-located per feature (`schemas.ts` or a `schemas/` dir) |
| Data | Supabase (Postgres + Storage + Realtime) · migrations in `supabase/migrations/` · Drizzle stub for the legacy MySQL auth DB only |
| Edge functions | `supabase/functions/` (document OCR, reparto assignment) |
| Messaging | Chatwoot + n8n on a separate VPS — the app server emits webhook events and NEVER sends WhatsApp/email itself; retries tracked in the webhook-log tables |
| Analytics | PostHog EU (`client/src/lib/posthog/`) — dead-code-eliminated until its env key is set |
| Test | Vitest · Playwright (`playwright.config.ts`) · Lighthouse CI (`lighthouserc.json`) |
| Tooling | pnpm (version pinned in `package.json`) · ESLint (`eslint.config.js`) · Prettier |

### CI gates (`.github/workflows/`)

Three workflows. `gh pr checks <PR>` is the source of truth for "done":

- `.github/workflows/ci.yml` — job **quality**: docs drift gate → lint → `pnpm check`
  → Vitest with a coverage gate (thresholds asserted inside the workflow) → build →
  Lighthouse CI on `/login` (LCP, JS bundle size, and accessibility score are
  BLOCKING — exact budgets in `lighthouserc.json`). Job **db-integration**: full
  server suite against a real local Supabase (observational; not yet required for
  merge).
- `.github/workflows/ci-types-drift.yml` — regenerates DB types and diffs them
  against `client/src/lib/database.types.ts`. **Path-filtered**: it runs only when
  migrations or the types file change, so green on the other gates proves nothing
  about it.
- `.github/workflows/ci-migration-filenames.yml` — migration filename pattern. Also
  path-filtered.

Lint, coverage, and Lighthouse run over a fixed broad file set regardless of your
diff: a pre-existing error on `main` reds EVERY open PR. Fix it on `main` (or
cherry-pick the fix into each branch) — never patch around it.

## Environment & auth gotchas

Full onboarding, cloud-VM bringup, and test users: `docs/dev-setup.md`. The traps
that repeatedly bite agents:

- The **server** loads `.env` (dotenv default), NOT `.env.local`; Vite reads both.
  Server-only vars (Supabase URL/service-role key, JWT secret, MySQL URL, app id)
  must be in `.env` or the server silently runs without DB access.
- UI login is Manus-OAuth-only. Identity AND role come from the MySQL `users` table,
  so the MySQL auth DB is effectively REQUIRED locally even where docs call it
  optional. Seeded Supabase auth users are for RLS integration tests, not app login.
  OAuth-less session recipe: `docs/dev-setup.md`.
- DB-gated tests self-skip unless RUN_LOCAL_SUPABASE_TESTS=true — a green local
  `pnpm test` may mean "skipped", not "passed". The db-integration CI job runs them
  for real.

## Coordination & lanes

- **Schema is upstream.** Migration + Zod schema first; feature code picks up the
  regenerated types — never the other way round.
- **File-lane ownership is strict.** One feature per work stream: a stream owns
  `client/src/features/<name>/` plus its matching server router and does not edit
  outside its lane. Two streams needing one file → the deeper dependency wins;
  unclear → escalate to Leo.
- **Tests first** (RED → GREEN → IMPROVE): write the failing test, implement to
  green, refactor only after.
- **Do not pre-create folders for future modules** — create them when the feature
  actually starts.

## Rules

### Architecture

- Feature-based structure only: `client/src/features/<name>/` with a matching router
  under `server/routers/` (single file for small features).
- Zod is the single validation source of truth (ADR-0001) — never duplicate schemas
  in components; server-side validation is mandatory for all sensitive fields.
- XState for the check-in flow ONLY (ADR-0003). Zustand for global UI state only —
  no business logic in stores. Supabase Realtime only for dashboard counters.
- PowerSync is NOT configured — do not add offline-sync infrastructure without an ADR.
- Open Referral HSDS field naming for person/service records where applicable.
- **WCAG 2.1 AA is non-negotiable** — beneficiaries include elderly, low-literacy,
  and non-Spanish speakers. Semantic HTML, ARIA labels, ≥4.5:1 contrast. The
  Lighthouse accessibility gate blocks merges.
- Primary device: low-end Android — test on real hardware, design mobile-first.
  Check-in results must be understandable without reading text (color + icon).
  Forms completable in under 5 minutes with minimal typing.
- UI chrome is Spanish-only; the consent modal is the ONLY place non-Spanish text
  renders (ADR-0006: template languages are data-driven by population threshold;
  missing template → Spanish + verbal-translation banner, never silent Spanish).
- Messaging flows live in Chatwoot + n8n on the VPS (ADR-0005) — no WhatsApp/email
  SDK in the app server, ever.
- Use beneficiary-friendly language, never institutional ("tarjeta de miembro", not
  "sistema de registro de beneficiarios").

### Compliance (non-negotiable)

- **EIPD before any data collection — no exceptions.** Never collect data not listed
  in it; data minimization is mandatory.
- No PII in QR codes (internal UUID only). No PII in logs or error messages — IDs only.
- High-risk fields (`situacion_legal`, `foto_documento_url`, `recorrido_migratorio`):
  read access restricted to superadmin/admin.
- **DB RLS is NOT the enforcement boundary.** All DB access uses the service-role
  client, bypassing RLS app-wide; tRPC procedure guards + `redactHighRiskFields` are
  the ONLY PII wall (ADR-0002, `ARCHITECTURE.md`, issue #50). Treat every router as
  security-critical. A DB-RLS migration exists but is marked DO-NOT-APPLY.
- PostHog: session replay fully masked, autocapture off, staff-only identify. Do NOT
  set the production key until the session-replay EIPD addendum is signed (drafts in
  `docs/legal/`). Details: `docs/integrations/posthog.md`.
- Special-category data (RGPD Art. 9/10, e.g. colectivos): consent-gated collection +
  app-layer encryption + a signed EIPD addendum BEFORE storing anything new of this
  class.

### Code quality (enforced by `eslint.config.js`)

- `max-lines` 300 per file is an ERROR; a hardcoded legacy allow-list downgrades
  named pre-existing files to warn. New files hard-fail CI at 300 — extract, don't
  grandfather.
- Functions < 50 lines · nesting ≤ 4 levels · TypeScript strict · no `any` ·
  no `as unknown as X`.
- Three similar lines beat a premature abstraction. No single-use helpers, no feature
  flags, no backwards-compat shims — change the code directly.
- No heavy chart libraries — the Lighthouse bundle budget blocks them.

### Data & integrations

- **GUF (Banco de Alimentos): no API — CSV only** (ADR-0004). GUF deletions are
  non-recoverable; never treat GUF as source of truth; export a GUF CSV before any
  migration that could deactivate records, and validate field completeness against
  the schema before importing.
- **`upsert_legacy_person` is the SOLE legacy-import writer.** Every new typed person
  column must be taught to it explicitly, or imports silently drop that field. Never
  add a second import writer.
- **Migrations must be existence-tolerant, multi-shape SQL**: environments diverge,
  so guard for undefined_object AND undefined_column AND undefined_table together
  (IF EXISTS / DO-block guards), not just one shape.
- Physical delivery signatures must remain legally equivalent to wet signatures for
  the Banco de Alimentos subsidy — confirm any format change with the RGPD lawyer.
- Never auto-import legacy-system data — migration scope is validated with the
  stakeholders first.

### Performance budgets

- Check-in < 8 seconds end-to-end on a real low-end device; manual "Sin QR"
  name-search < 2 seconds.
- LCP and JS bundle size on `/login`: blocking in ci.yml (budgets in
  `lighthouserc.json`).
- New-person registration < 5 minutes.

## Commands & workflows

Setup (first time, cloud VM, test users): `docs/dev-setup.md`.

```bash
pnpm dev          # tsx watch server (Express + Vite middleware), port 3000
pnpm lint         # ESLint
pnpm check        # tsc --noEmit
pnpm test         # Vitest (DB-gated tests self-skip — see gotchas above)
supabase db reset # re-apply all migrations + seed
pnpm exec playwright test
pnpm exec lhci autorun
pnpm docs:check   # docs drift gate (same checks CI runs, plus a local-only
                  # workspace-bootstrap warning that never affects the exit code)
```

### Regenerating DB types — canonical recipe

```bash
supabase gen types typescript \
  --db-url "$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')" \
  --schema public > client/src/lib/database.types.ts
```

NEVER a bare `supabase gen types --local` — it adds a graphql_public block that reds
the types-drift gate. NEVER hand-edit the generated types file — re-run the recipe.
After regenerating, `head -1` the file: some CLI versions leak a `Connecting to …`
info line into stdout, corrupting the file — and a regen-and-diff check will NOT
catch it (both copies carry the same junk line). Strip it; the file must start
with `export type Json`.

### SECURITY DEFINER functions — DROP+CREATE loses grants

Recreating a function (`DROP FUNCTION … CASCADE; CREATE …`) resets its EXECUTE
grants: after the standard `REVOKE … FROM PUBLIC, anon, authenticated`, the app's
`service_role` is left with NO grant and every call 42501s ("permission denied")
— the failure only appears at runtime, not at migration time. Every convergence
migration must end with an explicit
`GRANT EXECUTE ON FUNCTION … TO service_role;` (see `20260723100003`).

### Workflow: feature

1. Read the driving issue (`gh issue view <n> --comments`), the `CONTEXT.md` terms,
   and the ADRs touching the area.
2. Schema first if new tables are needed (workflow below); then tests (RED); then
   implement (GREEN); then refactor (IMPROVE).
3. Verify: mirror every touched CI gate locally, push, then poll
   `gh pr checks <PR>` — CI is the source of truth; local green is a hypothesis.
4. Finish with the Reflection (below).

### Workflow: schema change

1. Write the migration (existence-tolerant SQL) in `supabase/migrations/` following
   the filename pattern gate.
2. `supabase db reset` — must apply cleanly.
3. Regenerate types with the canonical recipe, then verify the drift gate locally:
   regen into a tempfile and `diff` it against `client/src/lib/database.types.ts` —
   they must be identical BEFORE you commit.
4. Update the feature's Zod schema and tRPC procedures.
5. New typed person columns → update `upsert_legacy_person` in the same change.

## Guard rails

- Do NOT declare work "done" from local green — the path-filtered gates run only in
  CI; `gh pr checks` after push is the verdict.
- The GitHub issue tracker is the ONLY live register of open work. Static ledgers
  produce stale conclusions — reconcile against `origin/main` + open issues.
- Before commit/merge/finish: **triple-check** — re-read the full diff against the
  requirement adversarially; evidence before assertions (real command output, not
  recollection).
- With multiple sibling worktrees, "file absent locally" usually means a stale
  checkout — `git fetch` and check `origin/main` before concluding anything is
  missing.
- Surface contradictions with ADRs explicitly ("contradicts ADR-0007 because…");
  never silently override a recorded decision.

## Reflection — mandatory before ending any process

Before ending any unit of work — feature, fix, audit, review, or session — run this
loop. Do not skip it when things "went fine"; routine successes leak lessons too.

1. **Gather evidence.** Collect proof of the claimed outcome: the commands you ran
   and their real output (`pnpm lint` / `pnpm check` / `pnpm test`,
   `gh pr checks <PR>`), the exact diff shipped, a repro or screenshot for UI claims.
   If evidence is missing, the process is not finished — go produce it.
2. **Extract lessons.** What did you learn that a future agent (any tool) would
   otherwise re-learn the hard way? What almost went wrong? What did review or CI
   catch that you had asserted was fine? One sentence each, phrased durably — no
   dates, no "current state".
3. **Route every lesson to exactly one home:**

   | Lesson type | Route to | How |
   |---|---|---|
   | Durable rule, recipe, or gotcha (any agent) | This file, or the matching doc (`CONTEXT.md`, `docs/agents/`, `docs/dev-setup.md`) | Small PR, or fold into the current PR |
   | Project state: bug, follow-up, debt, regression | GitHub issues — the only live register | `gh issue create` / comment |
   | Architectural decision made or reversed | `docs/adr/` | New ADR via PR |
   | Personal to your own tooling | Your tool's own memory/config | Per-tool (Claude Code: see the workspace CLAUDE.md) |

4. **Close the loop on the register.** Update or close the driving issue with the
   evidence attached. State left only in the conversation is state lost.

An unrouted lesson is a lost lesson. If genuinely nothing was learned, say so
explicitly in your closing summary — silence is not a valid reflection.

*Optional enforcement (Claude Code):* `scripts/claude-reflection-stop-hook.sh` blocks
session-end once when a session shipped a commit/PR without reflecting — inert until
enabled; the settings snippet is in the script header.

## Registers & docs

- Issue tracker conventions: `docs/agents/issue-tracker.md`
- Label vocabulary: `docs/agents/triage-labels.md`
- Domain-docs consumption rules: `docs/agents/domain.md`
- Domain glossary: `CONTEXT.md` · Decisions: `docs/adr/` · Security: `ARCHITECTURE.md`
- Onboarding & environment: `docs/dev-setup.md`
