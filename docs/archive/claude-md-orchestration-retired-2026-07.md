> **FROZEN ARCHIVE — retired 2026-07.** This is the final state of the untracked
> workspace-root CLAUDE.md orchestration playbook, preserved verbatim before it was
> replaced by the tracked AGENTS.md (canonical) + a thin workspace bootstrap.
> Historical only — its scope trees, state snapshots, and SAT table are NOT current.

# CLAUDE.md — Bocatas Digital AI Orchestration Playbook

> This is NOT documentation. It is the command center for parallel AI agent execution.
> Global standards come from user-level skills (/karpathy, /code-review, /tdd, security review via mythos-cassandra). There is no `~/.claude/rules/` directory.
> This file covers only what is project-specific and not derivable from the code.

---

## 1. PROJECT IDENTITY

**Mission:** Replace 6 fragmented systems (Notion, Excel, cardboard punch, Google Sheets, GUF, text notes) with a unified digital platform for Asociación Bocatas — serving 4,000+ vulnerable people/year in Madrid.

**North Star Metric:** Personas registradas con al menos 1 check-in digital en los últimos 30 días.

### Stack

> Code lives in `repo/` (Vite client + Express server in one tree). Paths in this file are relative to `repo/` unless prefixed otherwise.

| Layer | Technology |
|-------|-----------|
| Frontend | Vite 7 SPA · React 19 · TypeScript (strict) · wouter (routing) · shadcn/ui (Radix) · Tailwind 4 |
| API layer | Express 4 + tRPC v11 (server-side in `repo/server/`) — single root router at `repo/server/routers.ts` |
| State | TanStack Query v5 (server) · Zustand (UI only) · XState v5 (check-in FSM only) |
| Validation | Zod (single source of truth — no duplication in components) |
| Data | Supabase (PostgreSQL + RLS + Realtime + Storage) · migrations in `repo/supabase/migrations/` · Drizzle ORM stub for legacy auth helpers only (not source of truth) |
| Edge | Supabase Edge Function `extract-document` (OCR) |
| PWA / Offline | `vite-plugin-pwa` + `workbox-window` · PowerSync deferred (end of Gate 1) |
| Messaging | Chatwoot (WhatsApp + email omnichannel) · n8n (workflow automation) · both on VPS, invoked via outbound webhooks |
| Test | Vitest (unit/integration) · Playwright (E2E) |
| Tooling | pnpm 10 · ESLint 10 · Prettier · knip · ts-prune · depcheck |
| CI/CD | GitHub Actions on every PR — `ci.yml` (lint · typecheck · Vitest) + `ci-types-drift.yml` (**database.types.ts vs migrations**, keyed on `supabase/migrations/**` + the types file) + `ci-migration-filenames.yml` (filename pattern) + Lighthouse + DB Integration Tests + GitGuardian |

### Team

| Person | Role | AI Tool |
|--------|------|---------|
| Leo | Product/Tech Lead | Claude Code |
| Felix | Sr. Engineer | Claude Code + Cursor |
| Nacho/Espe | Bocatas Stakeholders | — |
| Sole | Families Program Coordinator (Gate 2 stakeholder, primary GUF/WhatsApp operator) | — |

### Current Scope (actual state on `main` as of 2026-05-06)

**Gate 0 (DONE):** Schema SQL + Zod + RBAC + RLS + dev environment + EIPD legal doc. ~130 migrations applied flat under `supabase/migrations/` (dual-timestamp filenames; no `EXPORTED/` subdir) including `program_sessions`, `consents`, `consent_templates`, `deliveries`, `family_member_documents`, `family_invariants`.
**Gate 1 (IN PROGRESS):** Epic A (persons + QR) + Epic B (check-in + XState) + Epic C (dashboard + Realtime + CSV export) — all shipped at the router/UI layer, hardening in flight.
**Gate 2 (PARTIALLY SHIPPED, validating):** Programa de Familia — `families` router (split DONE — `server/routers/families/` directory, ~21 files), 14 UI components, GUF CSV import/export, compliance cards CM-1..CM-5. Validation/hardening tracked in git history + active sprint conversation (no single canonical plan doc).
**Out-of-original-spec, retained:** `announcements` pipeline (`server/routers/announcements/` directory ~1.3k LOC, audiences DSL, bulk import, n8n webhook + retry log) — full feature, kept.

### Original spec (for reference — superseded by actual state above)

Gate 0 (now): Schema SQL + Zod + RBAC + RLS + dev environment + EIPD legal doc. NO UI.
Gate 1 (next): Epic A (person registration + QR) + Epic B (check-in) + Epic C (basic dashboard). NOTHING ELSE.

### Gate 1 Acceptance Criteria (Definition of Done)

| Feature | AS-IS | TO-BE (Gate 1 target) |
|---------|-------|----------------------|
| Check-in (QR) | ~30s punch card | < 8s end-to-end on real device |
| New person registration | ~20 min manual | < 5 min digital form |
| Dashboard: "how many today?" | Hours (manual count) | < 1 min (real-time) |
| Digital profiles complete | ~0% | > 80% active comedor users |
| Failed QR scan rate | N/A | < 5% |
| LCP (Moto G4, throttled 4G) | N/A | ≤ 2.5s |

---

## 2. AGENT ORCHESTRATION

### Swim Lanes (file-level ownership)

| Agent | Owns | Model | Tools | Boundary |
|-------|------|-------|-------|----------|
| Schema Agent | `repo/supabase/migrations/` · `repo/client/src/features/*/schemas{,.ts}` | Opus (first pass), Sonnet (iterate) | Supabase CLI, SQL | Never touches UI components or tRPC routers |
| Feature Agent | `repo/client/src/features/{name}/` · matching `repo/server/routers/{name}/` | Sonnet | Vite/React 19, wouter, tRPC v11, shadcn, TanStack Query | One feature per instance. Active: persons/, checkin/, dashboard/, auth/, families/, programs/, announcements/, entregas/. Future: courses/, volunteers/, reporting/, cases/, grants/, employment/ — do NOT pre-create. |
| Test Agent | `__tests__/` · `*.test.ts` · `*.spec.ts` | Sonnet | Vitest, Playwright | Writes tests FIRST (RED→GREEN→IMPROVE) |
| Review Agent | PR diff | Sonnet | mythos-laquesis + mythos-cassandra over `git diff` (operative gate; no global code-reviewer/security-reviewer agents exist) | Runs after every feature completion |
| CI Agent | `.github/workflows/` | Haiku | GitHub Actions | Lighthouse blocking (LCP ≤2.5s + script ≤300KB on /login; perf/a11y score = warn), lint, typecheck |

### Model Routing

| Task | Model | Rationale |
|------|-------|-----------|
| File search, exploration | Haiku | High-frequency, lightweight |
| Feature implementation | Sonnet | Primary coding model |
| Schema design, architecture | Opus | First-pass design requiring deep reasoning |
| RGPD/security review | Opus | High-stakes compliance |
| Code review | Sonnet | Balances quality and cost |
| Build error fixes | Sonnet | build-error-resolver agent |

### Coordination Rules

1. **File-level ownership is strict.** Agents do not edit files outside their swim lane.
2. **Schema changes are upstream.** Schema Agent runs first → Feature Agent picks up generated types.
3. **Type generation is automatic.** After every migration, regenerate types with the canonical `--schema public` recipe (see §6 Development). NEVER a bare `--local` — it adds the `graphql_public` block that the Types Drift Gate (`ci-types-drift.yml`) rejects.
4. **PR gate.** No merge without Review Agent green + **all** CI gates green — *verified via `gh pr checks <PR>` after push*, never assumed from local `pnpm check`/`test`. Local green is a hypothesis: the types-drift and migration-filename gates run ONLY in CI, keyed on changed paths. Before committing schema/types changes, run each touched gate's own command locally.
5. **Conflict resolution.** If two agents need the same file, the one with the deeper dependency wins. Escalate to Leo if unclear.
6. **Context budget.** Active MCPs < 10. Total enabled tools < 80. Run `/mcp` periodically to audit.

### Subagents to use from the project's `.claude/agents/`

- `schema-agent` — schema and migration work (see `.claude/agents/schema-agent.md`)
- `feature-agent` — feature implementation (see `.claude/agents/feature-agent.md`)
- Code review / security review / TDD: no global agent files exist — use the mythos reviewers (laquesis · cassandra · themis over `git diff`) and the /code-review, /tdd skills
- `mythos-*` family (17 agents — routed: Fable 5 for cassandra/themis/atropos, Opus 4.8 for deep-reasoning lanes, Sonnet for mechanical lanes) — audit/plan/fix system: 9 read-only finders (argos·bugs,
  cassandra·security, themis·RGPD, atlas·perf, poseidon·resilience, sisyphus·debt, theseus·data,
  iris·a11y, diogenes·test-truth), 3 Moiras as mandatory triple check (cloto·MECE, laquesis·eng,
  atropos·SAT), atenea·plan+ADRs, apolo·karpathy-razor, quiron·tests, hefesto·cross-cutting, pitia·report.
  Run via `.claude/workflows/mythos-{audit,plan,fix,triple-check}.js` against the dedicated
  `repo-audit-mythos/` checkout (origin/main, NEVER the dirty `repo/`). Playbook: `.claude/skills/mythos/SKILL.md`.
  Ledger: `docs/audits/mythos/` + cross-refs into `repo` `docs/TECH_DEBT.md`.

---

## 3. RULES

> Global rules come from user-level skills (no `~/.claude/rules/` directory exists).
> Only project-specific constraints are listed here.

### Architecture

- **Feature-based structure only:** `repo/client/src/features/{persons,checkin,dashboard,programs,families,announcements,admin,...}/` on the client and matching `repo/server/routers/{name}/` on the server.
- **Zod is the single source of truth for validation.** Schema in `repo/client/src/features/{name}/schemas.ts` (or `schemas/` dir). Never duplicate in components.
- **XState only for check-in flow.** Do not apply to simple forms or other flows.
- **Zustand for global UI state only:** session, sidebar, offline indicator. No business logic in stores.
- **TanStack Query with `queryKeys` pattern per feature.** Supabase Realtime only for dashboard counters.
- **PowerSync deferred.** Do not configure until schema is stable (end of Gate 1).
- **Open Referral HSDS standard.** Person and service records follow HSDS field naming where applicable — enables future interoperability with partner NGOs.
- **WCAG 2.1 AA required** on all UI. Beneficiaries include elderly, low-literacy, and non-Spanish speakers. Semantic HTML, ARIA labels, and ≥4.5:1 contrast ratios are non-negotiable.
- **5-Phase Itinerary model.** Persons have `fase_itinerario` ENUM(0-4): 0=Acogida, 1=Estabilización, 2=Formación, 3=Inserción Laboral, 4=Autonomía. Required field in schema design.
- **Chatwoot/n8n are separate infrastructure.** Communication flows (WhatsApp, email notifications) go through Chatwoot + n8n on VPS — NOT through the Express/tRPC app server. Bocatas Digital sends webhook events; Chatwoot/n8n handle delivery. Outbound retries are tracked in `family_webhook_log` / `announcement_webhook_log`.
- **Primary device target:** Low-end Android (Moto G, Samsung A-series). Test on real hardware, not emulator only.
- **Low digital literacy UX:** Check-in result must be understood without reading text — color + icon only (green/amber/red). Forms completable in < 5 min with minimal typing.

### Compliance (non-negotiable)

- **EIPD must exist before any data collection.** No exceptions.
- **No PII in QR codes.** Internal UUID only — never name, phone, document number.
- **No PII in logs or error messages.** Use IDs, never personal data.
- **High-risk fields require extra protection:** `situacion_legal`, `foto_documento_url`, `recorrido_migratorio` — RLS read access restricted to superadmin/admin only.
- **Consent is multi-language by population threshold.** Schema has two enums: `idioma` (9 person-language values: es, ar, fr, bm, en, ro, zh, wo, other) and `consent_language` (4 template values: es, ar, fr, bm). Minimum required at any time: es, ar, fr, bm. Additional languages added when ≥5 active persons have that `idioma_principal`. UI chrome is Spanish-only — consent modal is the only place that renders non-Spanish text. If a person's `idioma_principal` has no active template, fallback flow shows Spanish + a banner instructing the volunteer to provide verbal translation; never silently render Spanish.

### Code Quality (project-specific; enforced by eslint.config.js — max-lines 300 ERROR with legacy warn allow-list)

- Files < 400 lines · Functions < 50 lines · No nesting > 4 levels
- TypeScript strict mode · No `any` · No `as unknown as X`
- Zod schemas co-located with their feature: `repo/client/src/features/persons/schemas/` (or `schemas.ts` for smaller features)
- Server-side validation mandatory for all sensitive fields

### Integration Constraints

- **GUF (Banco de Alimentos):** No API. Data synced via **CSV upload** from GUF exports. Deletions in GUF are NON-RECOVERABLE in GUF — store GUF data locally in `families` table. Never treat GUF as source of truth. Export CSV before any Go-Live migration.
- **WhatsApp / Email:** Handled entirely by **Chatwoot** (on VPS). Bocatas Digital emits events (new registration, check-in alert, etc.); n8n workflows on VPS translate those to messages. No direct WhatsApp SDK in the Express/tRPC app server.
- **Legacy systems to sunset (8 total):** Notion, Excel, Google Sheets, GUF, Google Drive, paper files, Sole's personal WhatsApp, group WhatsApp. Migration assessment is Gate 0 (G0.8). Do NOT auto-import in Gate 1.
- **Physical delivery signatures (Families):** Currently required for Banco de Alimentos subsidy verification. Gate 2 digital signatures must be legally equivalent — confirm format with RGPD lawyer before Gate 2 build.
- **PostHog (product analytics + session replay, EU):** Code in `client/src/lib/posthog/`. EU host (`eu.i.posthog.com`). **Disabled until `VITE_PUBLIC_POSTHOG_KEY` is set** (unset ⇒ dead-code-eliminated, 0 bytes). Session replay is ENABLED but **fully masked** (mask-all-text + mask-all-inputs + `.ph-no-capture` blocks all media/PII; no canvas; no network bodies). Autocapture OFF — only PII-free events. Identify **staff only** (id+role). `before_send` PII scrubber. **Do NOT set the prod key until the EIPD addendum covering session replay is signed** (`docs/legal/eipd-addendum-posthog-session-replay-DRAFT.md`). Recorder (rrweb) loads from EU CDN, not bundled. See `docs/integrations/posthog.md`.

### Occam's Razor (simplicity enforcement)

- **Three similar lines > premature abstraction.** No helpers for one-time use.
- **No feature flags.** No backwards-compat shims. Change the code directly.
- **No design for Modules 3-9** (courses, volunteering, case management, grants, employment matching) in active gates — schema stubs only. Families is now active (Gate 2 in flight); courses/volunteers/cases/grants/employment remain deferred.
- **No heavy chart libraries.** Bundle < 300KB enforced by Lighthouse CI.

---

## 4. PROBLEM DECOMPOSITION (MECE — Gates 0+1 only)

```
Bocatas Digital Gate 0+1
├── GATE 0: DATA FOUNDATION (2 weeks — NO UI)
│   ├── G0.1 Schema SQL
│   │   ├── Core: persons, attendances, program_enrollments, locations
│   │   ├── Stubs: families, courses, volunteers, grants (minimal, no RLS yet)
│   │   └── JSONB columns for unstructured future data (10-15% of fields)
│   ├── G0.2 Zod schemas (mirror SQL, co-designed with Bocatas)
│   ├── G0.3 RBAC: 4 roles (superadmin, admin, voluntario, beneficiario)
│   ├── G0.4 RLS policies (row-level security per role per table)
│   ├── G0.5 Seed data (test personas for each role)
│   ├── G0.6 Dev environment
│   │   ├── supabase init + start (local)
│   │   ├── Vite + React 19 + Express + tRPC v11 + TypeScript + shadcn/ui scaffold
│   │   ├── GitHub Actions (lint + typecheck on every PR)
│   │   ├── .env.example with all documented variables
│   │   └── Lighthouse CI baseline
│   ├── G0.7 EIPD (with specialized RGPD lawyer — parallel to engineering)
│   └── G0.8 Data migration assessment
│       ├── Audit 8 legacy systems with Espe/Nacho (2h session)
│       ├── Define MVP import scope: which personas, which tables
│       └── GUF CSV export before Go-Live (capture before any deactivations)
│
└── GATE 1: COMEDOR MVP (6 weeks — STRICT SCOPE)
    ├── EPIC A: Person Registration + QR
    │   ├── A.1 Registration form (name, country, phone, language — minimal)
    │   ├── A.2 Duplicate detection (name + phone fuzzy match)
    │   ├── A.3 Digital consent flow (Spanish + beneficiary's primary language)
    │   ├── A.4 Profile 360° + QR generation (UUID only)
    │   ├── A.5 QR card display/print
    │   └── A.6 i18n framework setup (react-i18next + i18next-browser-languagedetector, Spanish-only UI for now)
    │
    ├── EPIC B: Check-in (replaces cardboard punch)
    │   ├── B.1 QR scan camera (< 8 seconds end-to-end)
    │   ├── B.2 XState machine (idle → scanning → registered/already/not_found)
    │   ├── B.3 Visual feedback (green/amber/red cards — no text dependency)
    │   ├── B.4 Manual fallback ("Sin QR" button → name search < 2s)
    │   ├── B.5 No duplicate same-day same-service-point rule
    │   ├── B.6 Basic offline (optimistic local state — full PowerSync in Gate 1 final)
    │   └── B.7 Demo/practice mode (no real data written)
    │
    └── EPIC C: Dashboard (funder visibility)
        ├── C.1 KPI cards: today / this week / this month
        ├── C.2 Trend chart: last 4 weeks (lightweight — no heavy libs)
        ├── C.3 Supabase Realtime (< 5s delay)
        ├── C.4 CSV export (anonymized: date, hour, id_persona, service_point, method)
        └── C.5 Mobile-readable layout
```

**What is NOT in Gates 0-1:** OCR document scanner · 4-language UI · Families program · Courses · Volunteer DB · Beneficiary PWA · Case management · Grant tracking · Employment matching · Interoperability protocol.

### Active scope (actual on `main`, 2026-05-06)

Beyond the original 0+1 spec, the following are shipped and in active hardening:

```
Bocatas Digital (actual)
├── Persons + QR (Gate 1, shipped, hardening)
├── Check-in + XState + offline (Gate 1, shipped, hardening)
├── Dashboard + Realtime + CSV export (Gate 1, shipped, hardening)
├── Programs + Enrollment (Gate 1+, shipped, hardening)
├── Auth + RBAC (4 roles, shipped, hardening)
├── Families / Programa de Familia (Gate 2, partially shipped, validating)
│   ├── families CRUD (router split DONE — server/routers/families/, ~21 files)
│   ├── family_member_documents + RLS
│   ├── deliveries + signature scaffold
│   ├── GUF CSV import/export
│   └── compliance cards CM-1..CM-5
├── Announcements (out-of-original-spec, shipped, hardening)
│   ├── audiences DSL · bulk import preview · n8n webhook + retry log
└── OCR + Document Archive (shipped — `extract-document` Edge Function + `uploads-tab` UI: upload · classify · pending queue · archive, scoped per `programa_id`)
```

**Confirmed-existing Familia schema tables** (all migrated under `supabase/migrations/`): `families`, `family_members` (post `migrate_miembros_data_v2`), `family_member_documents`, `deliveries`, `program_sessions`, `consents`, `consent_templates`, `app_settings`, `delivery_signature_audit` (migration 20260509000001), `family_webhook_log` (migration 20260512000001), `family_saved_views` (migration 20260601000006). Pending in active sprint: `guf_export_log`.

---

## 5. RISK ASSUMPTIONS (SAT)

Key assumptions that agents must be aware of. Validate before building features that depend on them.

| # | Assumption | Risk if Wrong | Test / Mitigation |
|---|-----------|---------------|-------------------|
| 1 | Volunteers adopt QR over cardboard punch | Permanent revert to cardboard | Manual fallback is first-class (not exception). Measure adoption weekly. If < 60% by week 2 of Gate 1, call UX review. |
| 2 | Schema covers all 9 operational processes | Hidden process breaks schema post-Gate 0 | Co-design session with Nacho/Espe before finalizing schema. Reserve JSONB columns for unknowns. |
| 3 | Low-end phones run PWA at LCP ≤ 2.5s | Volunteers abandon app | Lighthouse CI enforces budget (BLOCKING since Wave 4: LCP ≤2.5s + script ≤300KB, desktop preset on /login — authed routes pending LHCI auth fixture). Real-device testing (Moto G, Samsung A-series) remains manual. |
| 4 | Supabase RLS + EIPD is sufficient for RGPD | Legal audit finds gaps | EIPD with specialized lawyer (not generic). Define data controller, EU server location, ARCO rights. **Consent-language gap mitigation:** if `idioma_principal` has no active `consent_templates` row, render Spanish + verbal-translation banner; never silently render Spanish. |
| 5 | PowerSync handles offline in field conditions | Data loss or duplicates during service shift | Stress test: disconnect, 20-30 check-ins, reconnect, verify no duplicates. Do BEFORE first real shift. |
| 6 | OCR works on damaged/multilingual documents (Gate 2) | Low accuracy → volunteers revert to manual entry | OCR is Gate 2. Manual fallback always exists. Pre-release: test on real NIE, Syrian ID, CNIE originals — not scanned copies. |
| 7 | Legacy data is clean enough to import without manual correction | Dirty data → duplicate persons or broken profiles at launch | Gate 0 audit session with Espe. Define MVP migration scope — not everything must be imported. |
| 8 | GUF CSV exports contain sufficient fields to reconstruct families records | Missing fields → incomplete family profiles at Gate 2 | Export GUF CSV before any deactivations. Validate field completeness against schema in Gate 0 audit. |

---

## 6. COMMANDS & WORKFLOWS

### Setup

```bash
cd repo
supabase init && supabase start          # Local Supabase instance
pnpm install
cp .env.example .env.local               # Fill in values
supabase db reset                        # Apply migrations + seed
# Regenerate DB types — see the canonical recipe under Development (must match ci-types-drift.yml).
supabase gen types typescript --db-url "$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')" --schema public > client/src/lib/database.types.ts
```

### Development

```bash
cd repo
pnpm dev                                 # tsx watch server/_core/index.ts (Express + Vite middleware)
supabase db reset                        # Reset + re-seed local DB
# CANONICAL DB-type regen — MUST match the Types Drift Gate (ci-types-drift.yml): public-only, token-free.
# A bare `supabase gen types --local` ADDS the graphql_public block and reds the gate (learned: PR #112).
supabase gen types typescript --db-url "$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')" --schema public > client/src/lib/database.types.ts
pnpm lint                                # ESLint over client/src server shared
pnpm check                               # tsc --noEmit
pnpm test                                # Vitest
pnpm exec playwright test                # Playwright E2E (config: playwright.config.ts)
pnpm exec lhci autorun                   # Lighthouse CI (config: lighthouserc.json)
```

### Workflow: New Feature (spec-driven)

```
1. Read the spec section for this epic (Sprint doc or BUDGET.md Gate breakdown)
2. Schema Agent: write migration + Zod schema if new tables needed
3. Run `supabase db reset`, then regenerate types with the canonical `--schema public` recipe (§6 Development)
4. Test Agent: write tests FIRST (RED) — unit + integration
5. Feature Agent: implement to pass tests (GREEN)
6. Refactor only after tests pass (IMPROVE)
7. Review Agent: mythos-laquesis + mythos-cassandra over the diff
8. CI Agent: lint + typecheck + Lighthouse blocking (LCP/script budgets on /login)
9. PR: no merge without Review + CI green
```

### Workflow: Schema Change

```
1. Write SQL migration in repo/supabase/migrations/ (timestamped filename)
2. supabase db reset  (verifies migration applies cleanly)
3. Regenerate types — canonical `--schema public` recipe (§6 Development); NEVER bare `--local`
4. VERIFY the Types Drift Gate locally BEFORE committing — regen into a tempfile and diff; must be identical:
   `supabase gen types typescript --db-url "$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')" --schema public > /tmp/t.ts && diff /tmp/t.ts repo/client/src/lib/database.types.ts`
5. Update Zod schema in repo/client/src/features/{name}/schemas.ts (or schemas/)
6. Update matching tRPC procedure(s) in repo/server/routers/{name}/
7. Notify: downstream Feature Agents that types have changed
```

---

## 7. GUARD RAILS

**Scope**
- Do NOT build UI in Gate 0 — schema + infra first, always (HISTORICAL: Gate 0 done)
- Do NOT add Modules 3-9 code (courses, volunteers, cases, grants, employment) — stubs in schema only. Families is now active (Gate 2 in flight, validating).
- Do NOT configure PowerSync until schema is stable (end of Gate 1)
- Do NOT translate UI chrome — UI is Spanish-only outside the consent modal. Consent template language set is data-driven per the population threshold rule (see §3 Compliance).
- Do NOT build GUF API integration — GUF has no API; use CSV import only
- Do NOT build WhatsApp/email sending in the Express/tRPC app server — Chatwoot + n8n on VPS own that layer
- Do NOT auto-import legacy data — migration strategy must be validated with Espe/Nacho first
- Do NOT pre-create feature folders for future modules (courses/, volunteers/, cases/, grants/, employment/) — create at gate start

**Compliance**
- Do NOT store PII in QR codes — internal UUID only
- Do NOT skip EIPD — it is the legal shield for the entire project
- Do NOT log PII — use IDs in all logs and error messages
- Do NOT collect data not listed in the EIPD — data minimization is mandatory

**Code Quality**
- Do NOT use `any` type — ever
- Do NOT duplicate Zod schemas — one source of truth per feature
- Do NOT use heavy chart libraries — bundle budget is 300KB total
- Do NOT use XState outside the check-in flow
- Do NOT violate WCAG 2.1 AA — semantic HTML, ARIA labels, ≥4.5:1 contrast ratios on all UI

**Verification (CI is the source of truth)**
- Do NOT declare a branch "done" from local `pnpm check`/`test` green — verify via `gh pr checks <PR>` after push. The types-drift + migration-filename gates run ONLY in CI, keyed on changed paths; local green is a hypothesis, not proof. (Learned: PR #112 sat red while reported "all green".)
- Do NOT regenerate `database.types.ts` with a bare `--local` — always `--schema public` (matches `ci-types-drift.yml`); a bare `--local` adds `graphql_public` and reds the gate. See §6.
- Do NOT hand-edit `database.types.ts` — it is generated; re-run the canonical recipe.
- The GitHub issue tracker is the ONLY live register of open work (bugs · tech-debt · regressions). `repo/docs/TECH_DEBT.md` and `docs/audits/mythos/*` are HISTORICAL snapshots, NOT live registers — never re-derive "what's open" from them; query issues (`gh issue list`). (Learned 2026-07-07: a stale `TECH_DEBT.md` re-derived C-05 as "open" when it was already fixed at the tRPC `errorFormatter` boundary — a static-read false-positive. Reconcile against `origin/main`, not the ledger.)

**Language & UX**
- Do NOT use institutional language — "tarjeta de miembro" not "sistema de registro de beneficiarios"
- Do NOT design desktop-first — mobile viewport is the primary target
- Do NOT require text to understand the check-in result — use color + icon (accessibility + multi-language)

---

> For the full 6-gate stage-gate breakdown (deliverables, effort, budget, roles):
> see [BUDGET.md](./BUDGET.md)
>
> Global coding standards, git workflow, testing requirements and security checklist:
> user-level skills (/karpathy, /code-review, /tdd, /testing-strategy) — no `~/.claude/rules/` exists

---

## Agent skills

### Issue tracker

Issues live as GitHub issues in `leonardo-ccavalcante/bocatas_digital` (via `gh`, run from inside `repo/`). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical label vocabulary — `needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` live **inside `repo/` (tracked in git)**, NOT at the untracked workspace root, so they travel with the code and are reviewed in PRs. Only `CLAUDE.md` (this orchestration command-center) stays at the workspace root by design. See `docs/agents/domain.md`. (Canonicalized 2026-07-08 via #117 — before that, ADRs/CONTEXT.md drifted between two `docs/` trees and the ADR numbers collided at 0008/0009. `docs/agents/*` are still root-only — a sibling follow-up.)
