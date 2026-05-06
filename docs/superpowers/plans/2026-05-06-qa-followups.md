# Phase 6.b — QA follow-ups: Top-1% Perf · Dead-code · Typed Supabase · Auth↔Persons mapping

> **For agentic workers:** Drive this with `superpowers:executing-plans`. Each PR (§4.A through §4.D) follows the same `/systematic-debugging` 4-phase + `/test-driven-development` RED→GREEN protocol. Use checkbox (`- [ ]`) syntax for tracking.
>
> **For human/Codex review:** This plan is self-contained. Read it cold. The prior session ([`2026-05-06-session-summary.md`](../findings/2026-05-06-session-summary.md)) closed every CRITICAL finding; this plan tackles the four follow-ups left on the cutting-room floor.

**Goal:** Take the codebase from "every CRITICAL fixed" (end of Phase 6 session 1, branch `qa/phase6-qa-1a`) to "every HIGH closed and the production-ready performance ceiling reached" — by shipping four atomic, independently-reviewable PRs:

1. **QA-3** — `/refactor-clean` (dead-code sweep via knip + ts-prune + depcheck).
2. **QA-5** — typed Supabase wrapper, closing the F-203 48-eslint-disable cluster.
3. **QA-7B** — top-1% performance program: recharts → light SVG, `vite-plugin-pwa`, AVIF/WebP, font subset, React Compiler (gated).
4. **F-002 follow-up** — Manus OAuth `openId` ↔ Supabase `persons.id` mapping, replacing the QA-1B stub with a working `MiQR.tsx`.

**Test baseline to preserve at every step:**
`pnpm check` 0 errors · `pnpm test` `19 env-failed | 880 passed | 26 skipped (925)` (the post-Phase-6 baseline; reproduce before any change with the §2 commands).

**Tech stack:** TypeScript strict + tRPC v11 + React 19 + Vite 7 + Vitest + Supabase (PostgreSQL+RLS) + Manus OAuth + jsQR + qrcode (unchanged).

---

## 1. Methodology — every skill maps to a concrete section

| Skill | Where it applies | What it produces |
|---|---|---|
| `/writing-plans` | This document | Bite-sized verifiable steps, exact paths, exact pass criteria |
| `/systematic-debugging` | §6 — every fix gets the 4 phases (gather → hypothesize → minimal repro → root-cause fix). No symptom patches. |
| `/test-driven-development` | §6 — every behavior-affecting fix gets a RED test before the fix |
| `/code-review` | §6 — self-review checklist before every commit (security, types, style, consistency) |
| `/coding-standards` | §3 — the rubric (no `any`, file size, error handling, immutability) |
| `/refactor-clean` | §4.A — explicitly the tool for QA-3 |
| `/requesting-code-review` | §7 — every PR body has an explicit "asks for review on:" section |
| `/receiving-code-review` | §7 — verify each suggestion against the codebase before accepting |
| `/sat` (Structured Analytic Techniques) | §J per-PR Key Assumptions Check + Red Team |
| `/executing-plans` | This whole plan | Mark `- [ ]` → `- [x]`; halt on blocker; update plan if scope changes |
| `/dispatching-parallel-agents` | §4.C only — perf-program sub-tasks measure independently | Wave-style discovery |
| `/subagent-driven-development` | §4.B + §4.C — typed-wrapper migration + each perf sub-task can be its own subagent | Isolation per workstream |

**Reinforcement-learning framing (continuing from session 1):** treat each fix as one episode. Verification gates are the reward signal. If `pnpm check` regresses on any sub-task, **roll back THAT sub-task only**, debug per `/systematic-debugging`, retry. Don't bundle.

---

## 2. Pre-flight (mandatory baselines — capture before §4 starts)

```bash
cd /Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo-followups
git fetch origin
git checkout -b qa/phase6b-followups origin/qa/phase6-qa-1a   # branch off session 1
pnpm install
pnpm check 2>&1 | tail -5    # expect 0 errors
pnpm test 2>&1 | tail -5     # expect 19 failed | 880 passed | 26 skipped (925)
pnpm lint 2>&1 | tail -3     # expect 100 errors / 89 warnings (Phase 6 baseline)
pnpm build 2>&1 | tee /tmp/build-baseline.txt  # capture chunk sizes
```

Baseline numbers to remember (any drift before §4 fires is itself a finding):

| Metric | Pre-session expectation | Source |
|---|---|---|
| `pnpm check` | 0 errors | post-Phase-6 |
| `pnpm test` | 19 failed env-only / 880 passed / 26 skipped (925) | post-Phase-6 |
| `pnpm lint` | 100 errors / 89 warnings | Phase 6 baseline |
| Initial JS gz | ~94.56 KB (main) + ~103.62 KB (charts) = 198 KB combined | W2-fe audit |
| `as unknown as` casts in app code | 9 (7 with comments, 2 in `_shared` barrels) | post-QA-2 |
| `eslint-disable @typescript-eslint/no-explicit-any` server | ~48 (mostly `(db as any)` adapter pattern) | W1-types F-203 |
| Files >400 lines | 2 test files only (Phase 5b PR-G deferred) | session 1 |
| Migrations applied | 53 EXPORTED + 31 in-repo (incl. 20260506000009/000010 from session 1) | session 1 |

---

## 3. Coding-standards rubric (the bar every fix must clear)

Pulled verbatim from `~/.claude/rules/typescript/coding-style.md` and `~/.claude/rules/common/coding-style.md` — same rubric as session 1, repeated here for reviewer convenience.

**TypeScript:**
- [ ] No `any` in application code. `unknown` + narrowing only.
- [ ] No `as unknown as X` without a one-line *why* comment within 2 lines above.
- [ ] Public APIs (exported functions, components) have explicit parameter and return types.
- [ ] React props use a named `interface` or `type`; no `React.FC` unless required.
- [ ] No `// @ts-ignore` / `// @ts-expect-error` / `// eslint-disable*` without a one-line *why* comment.

**Style:**
- [ ] No `console.log` in production paths (server/* and client/src/* outside dev utilities).
- [ ] Files <400 lines · functions <50 lines · nesting ≤4 levels.
- [ ] Immutable patterns — spread-update, no in-place mutation of inputs.
- [ ] No half-implementation (placeholder URLs, fake TODO data) shipped.

**Error handling:**
- [ ] `catch (e: unknown)` narrows before reading; `instanceof Error` or schema parse.
- [ ] Server errors thrown as `TRPCError` with explicit code; never raw `Error`.
- [ ] Client mutations show user-readable toast on error; never silent.
- [ ] No leaked PII in error messages or logs.

**Security (CLAUDE.md §3 guard-rails):**
- [ ] No hardcoded secrets.
- [ ] All user input validated by Zod at the boundary.
- [ ] No string-concatenated SQL; Supabase query builder only.
- [ ] No PII in QR / logs / audit.
- [ ] RLS-sensitive fields (`situacion_legal`, `foto_documento`, `recorrido_migratorio`) only readable by superadmin/admin.

---

## 4. Per-PR plan

Each PR follows the **same outer template**:
1. Branch off latest `origin/qa/phase6-qa-1a`.
2. Capture baselines (§2).
3. Apply pre-flight assumption check (per-PR §J subsection).
4. Decompose into atomic commits — one finding per commit.
5. Verify gates (§5) after each commit.
6. Open PR; PR template (§7) explicitly invokes `/requesting-code-review`.
7. On review: apply `/receiving-code-review` (verify each suggestion against the code BEFORE accepting).

The differences are scope, fix protocol, and verification specifics. Each section below specifies all three.

---

### 4.A QA-3 — `/refactor-clean` dead-code sweep

**Order rationale:** smallest, fastest, lowest risk. Surfaces orphan exports left over from Phase 5b file moves so QA-5/7B don't accidentally rediscover them.

**Pre-flight assumptions (`/sat` Key Assumptions Check):**
- A1: `knip` flags tRPC procedure exports as unused because they're consumed via the router barrel. **Mitigation:** every "unused export" finding is verified manually by `grep -rn "<export-name>" client/src server/` before deletion. Records consumed only by tests are NOT dead.
- A2: Phase 5b's `families/_shared.ts`, `entregas/_shared.ts`, `persons/_shared.ts`, `announcements/_shared.ts` barrels intentionally re-export internal helpers. `ts-prune` will list them as unused outside the barrel. **Mitigation:** check the barrel `index.ts` for re-exports before flagging.
- A3: `depcheck` may flag dev-only deps used in CI. **Mitigation:** check `.github/workflows/` and root `package.json` scripts before deleting.
- A4: `knip` config is missing → false-positive flood. **Mitigation:** add `knip.json` configured for the project's entry points (`server/_core/index.ts`, `client/src/main.tsx`, the test glob) BEFORE the first scan.

**Commands:**

```bash
# Step 1: install
pnpm add -D knip@latest ts-prune@latest depcheck@latest

# Step 2: configure knip
cat > knip.json <<'EOF'
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "entry": [
    "server/_core/index.ts",
    "client/src/main.tsx",
    "vitest.config.ts",
    "vite.config.ts",
    "eslint.config.js"
  ],
  "project": [
    "server/**/*.ts",
    "client/src/**/*.{ts,tsx}",
    "shared/**/*.ts"
  ],
  "ignore": [
    "client/src/lib/database.types.ts",
    "client/src/components/ui/**",
    "supabase/functions/**",
    "drizzle/**"
  ],
  "ignoreDependencies": []
}
EOF

# Step 3: scan
pnpm exec knip --reporter compact 2>&1 | tee findings/2026-05-06b-knip.txt
pnpm exec ts-prune 2>&1 | tee findings/2026-05-06b-ts-prune.txt
pnpm exec depcheck 2>&1 | tee findings/2026-05-06b-depcheck.txt

# Step 4: triage — for each unused export/dep, MANUALLY verify
#   grep -rn "<name>" client/src server/ shared/ supabase/migrations/
# before deleting. Tests-only references = keep.
```

**Tasks (one commit per cluster):**
- [ ] **3.1** install knip/ts-prune/depcheck + knip.json (commit: `chore(qa-3): install dead-code tooling`)
- [ ] **3.2** triage `knip` output → delete confirmed-dead files (commit: `chore(qa-3): remove N unused files surfaced by knip`)
- [ ] **3.3** triage `ts-prune` output → delete confirmed-unused exports (commit: `chore(qa-3): remove N unused exports surfaced by ts-prune`)
- [ ] **3.4** triage `depcheck` output → remove unused deps from package.json (commit: `chore(qa-3): drop N unused devDependencies`)
- [ ] **3.5** if any deletion uncovers a deeper bug (a "dead" file was actually loaded dynamically), STOP, file new finding, do NOT bundle.

**Hard rules:**
- One finding per commit. Do NOT batch all knip findings into one mega-commit.
- Every delete preceded by a manual `grep -rn` cross-reference cited in the commit body.
- Tests-only references are NOT dead.
- If `pnpm test` count drops by even one, roll back that delete.

**Verification gates** (every commit in QA-3):
- [ ] `pnpm check` — 0 errors.
- [ ] `pnpm test` — `19 failed | 880 passed | 26 skipped (925)` exactly.
- [ ] `pnpm build` — succeeds.
- [ ] Bundle size — does not regress (knip false positive could remove a route component).

**Time est:** ~1 hr · **Risk:** low-medium · **Subagent:** optional (single-session sufficient).

---

### 4.B QA-5 — Typed Supabase wrapper (closes F-203 48-disable cluster)

**Order rationale:** unblocks `pnpm lint` going green. Independent of QA-7B; can run in parallel in a worktree if the developer wants.

**Pre-flight assumptions (`/sat` KAC):**
- A1: The 48 `eslint-disable @typescript-eslint/no-explicit-any` are all `(db as any)` patterns avoiding Supabase JS SDK's deep type complexity. **Mitigation:** sample 5 sites; confirm pattern uniformity before designing the wrapper.
- A2: A typed wrapper will introduce a new dependency surface — every Supabase change in the SDK could break the wrapper. **Mitigation:** wrapper is a thin pass-through (no schema-aware types beyond what `Database` already provides) — failure mode is "wrapper compiles, queries still work" because we're not introducing new validation.
- A3: Supabase JS SDK's chained query builder returns inferred-types that ARE expressible — the `any` escapes were added when the SDK was less mature. **Mitigation:** confirm by trying one site without the cast first. If it compiles, the cast is just historical debt.

**Architecture sketch (`server/_core/db.ts` — NEW, ≤80 lines):**

```ts
// Thin typed wrapper around createAdminClient that exposes a single
// db.from(table) entry point typed against generated `Database`.
// Goal: replace `(db as any).from(...)` with `db.typed.from(...)`.
import { createAdminClient } from "../../client/src/lib/supabase/server";
import type { Database } from "../../client/src/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient<Database> | null = null;

export function getTypedDb(): SupabaseClient<Database> {
  if (!_client) _client = createAdminClient() as SupabaseClient<Database>;
  return _client;
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
```

If the SDK already returns the right types when called normally, the wrapper is just `getTypedDb()` returning a properly-typed client — no per-table API. Try this **simplest possible** approach first; only escalate to a fuller wrapper if the simple version doesn't eliminate the disables.

**Tasks:**
- [ ] **5.1** Sample-check: open 3 random sites with `(db as any)`, try removing the cast — does it compile? Document the result. (No commit.)
- [ ] **5.2** If yes (compiles without cast): write `server/_core/db.ts` thin wrapper; replace `createAdminClient()` callers in 5 highest-frequency files. Verify lint count drops. (Commit: `refactor(qa-5): introduce typed Supabase client wrapper`)
- [ ] **5.3** Roll out wrapper to remaining files. One commit per `server/routers/<feature>/` directory; `pnpm check` + `pnpm lint` green between each.
- [ ] **5.4** Remove the 48 `eslint-disable @typescript-eslint/no-explicit-any` comments. Final commit: `refactor(qa-5): drop 48 eslint-disable now that types are correct`.
- [ ] **5.5** If §5.1 returns "doesn't compile" — STOP. File a finding documenting which Supabase API surface needs a different wrapper shape; design that in a separate commit.

**Hard rules:**
- Wrapper file ≤80 lines. If it grows past 200, you've reinvented the SDK — STOP and rethink.
- One feature directory per commit.
- `pnpm check` + `pnpm test` green after every commit.
- F-204 (Record<string,unknown> pattern) and F-205 (3 remaining `react-hooks/exhaustive-deps` disables) ride along ONLY if they're trivial; otherwise file as separate findings and defer.

**Verification gates:**
- [ ] `pnpm check` 0 errors.
- [ ] `pnpm test` baseline.
- [ ] **`pnpm lint`** — error count drops by ≥40 (the 48 disables minus a few unavoidable). Final target: ≤10 lint errors total.
- [ ] No new `as any` introduced — `rg ': any\b|\bas any\b' server/ client/src/ shared/ --type ts | grep -v '\.test\.'` count must DROP, not rise.

**Time est:** ~3-4 hrs · **Risk:** medium (touches every router) · **Subagent:** recommended — `/subagent-driven-development` per feature directory.

---

### 4.C QA-7B — Top-1% performance program

**Order rationale:** depends on a stable type baseline (QA-5). Splits naturally into 5 sub-PRs (B.1–B.5), each independently shippable.

**Pre-flight assumptions (`/sat` KAC):**
- A1: Recharts is the only heavy dependency on the dashboard route. **Verify:** `pnpm exec vite-bundle-visualizer` per route. If something else is heavier, re-target.
- A2: The dashboard's chart needs are simple enough that a hand-rolled SVG sparkline (~50 lines) is sufficient. **Verify:** open `client/src/pages/Dashboard.tsx`; count chart variants used. If >2 variants, consider `visx` modular instead.
- A3: `vite-plugin-pwa` works with the existing Vite 7 + React 19 setup. **Verify:** open the plugin's `peerDependencies`; check matrix.
- A4: React Compiler RC is stable enough for production behind a feature flag. **Verify:** open release notes for `babel-plugin-react-compiler`; if there are open `@critical` issues, ship the flag OFF and don't enable until resolution.
- A5: The Supabase deployment uses Supavisor pooling. **Verify:** `cat .env.example` for `:6543` (pooler) vs `:5432` (direct).

**Sub-PR ordering (B.1 first, B.5 last — each its own commit-set):**

#### B.1 — Bundle audit + recharts replacement

```bash
pnpm add -D vite-bundle-visualizer
pnpm exec vite-bundle-visualizer  # outputs HTML report

# Identify heaviest chunks; recharts is the known F-101.
# Inspect Dashboard.tsx for the actual chart usage.
```

- [ ] **B.1.1** Bundle baseline with `vite-bundle-visualizer` (commit findings to `findings/2026-05-06b-bundle.html`).
- [ ] **B.1.2** Inspect every recharts import; list the chart types actually used (LineChart, BarChart, etc.). If ≤2 simple types: hand-roll SVG sparkline at `client/src/components/charts/MiniSparkline.tsx` (~50 lines, no deps). If >2: import only the needed `recharts/lib/...` sub-modules with `optimizeDeps` config.
- [ ] **B.1.3** Replace Dashboard imports; delete `recharts` from `package.json`.
- [ ] **B.1.4** Re-run bundle visualizer; verify vendor-charts chunk drops to <30 KB gz.

#### B.2 — `vite-plugin-pwa` (Service Worker app shell)

```bash
pnpm add -D vite-plugin-pwa workbox-window
```

- [ ] **B.2.1** Configure `vite.config.ts` with `VitePWA({ registerType: 'autoUpdate', ... })`. Pre-cache: app shell, top 6 routes, person-search hook chunks.
- [ ] **B.2.2** Add `client/src/lib/swUpdate.ts` — listens to `controllerchange`, shows `toast.message("Nueva versión disponible — toca para actualizar", { action: { label: "Actualizar", onClick: () => location.reload() }})`.
- [ ] **B.2.3** Test: build → preview → toggle airplane mode → reload → app shell loads from SW. Online again → see update toast on next deploy.
- [ ] **B.2.4** Document SW update path in `docs/runbooks/pwa-update.md` (~20 lines).

#### B.3 — Image pipeline (AVIF + WebP)

- [ ] **B.3.1** Inspect `compressImage` in `client/src/features/persons/utils/imageUtils.ts`; extend with WebP encoder (canvas → toBlob('image/webp')).
- [ ] **B.3.2** AVIF for hero images only — `<picture><source srcset="...avif" type="image/avif"><source srcset="...webp" type="image/webp"><img></picture>` pattern.
- [ ] **B.3.3** All `<img>` get `loading="lazy"` and `decoding="async"`.

#### B.4 — Font subsetting

- [ ] **B.4.1** Identify the project's font (likely Inter from `index.html`).
- [ ] **B.4.2** Use `glyphhanger` or pre-built CDN subset URLs to load Latin + Latin-Ext on the app shell (es is covered by Latin-Ext).
- [ ] **B.4.3** Lazy-load Arabic / French / Bambara variants only on the consent-language pages (dynamic font-face via `document.fonts.add()`).
- [ ] **B.4.4** Verify `font-display: swap` everywhere.

#### B.5 — React Compiler (gated rollout)

```bash
pnpm add -D babel-plugin-react-compiler
```

- [ ] **B.5.1** Add to `vite.config.ts`'s React plugin: `babel: { plugins: [['babel-plugin-react-compiler', {}]] }` GATED on `process.env.VITE_REACT_COMPILER === '1'`. Default OFF.
- [ ] **B.5.2** With flag ON, run `pnpm test` + `pnpm build` + manual device test (RegistrationWizard, CheckIn, Dashboard).
- [ ] **B.5.3** Document the flag in `.env.example` + `docs/runbooks/react-compiler-rollout.md`. Ship with flag OFF; flip to ON in a follow-up commit only after a full QA pass on real devices.

#### Cross-cutting: tRPC staleTime + measurement loop

- [ ] **B.6.1** Verify `httpBatchLink` enabled in `client/src/lib/trpc.ts` (already verified in W2-fe; just confirm).
- [ ] **B.6.2** Per-query staleTime: `persons.getById` 60s; `families.getById` 60s; `attendances.todayCount` 5s; `programs/consentTemplates` 5min (already correct).
- [ ] **B.6.3** Add `web-vitals` and report LCP/INP/CLS to dev console (NOT to a server endpoint — would itself become a PII vector via `event.entries[0].element` in some browsers).

**Final QA-7B gates:**
- [ ] `pnpm build` — initial JS ≤180 KB gz; per-route chunk ≤100 KB gz.
- [ ] `pnpm exec lhci autorun` (mobile) — ≥99/4; LCP <1.5s; INP <100ms; CLS <0.05.
- [ ] Real device smoke: Moto G4 cold-start <2s, warm <500ms; Samsung A12 same.
- [ ] PWA smoke: airplane mode → reload → app shell loads from SW.

**Time est:** 3-4 hrs (split across the 5 sub-PRs) · **Risk:** medium (visible UX changes). **Subagent:** recommended — one per B.x sub-PR.

---

### 4.D F-002 follow-up — Manus `openId` ↔ `persons.id` mapping

**Order rationale:** depends on stakeholder input (which Manus user maps to which `persons` row). Independent of QA-3/5/7B; runs whenever the question is answered.

**Pre-flight assumptions (`/sat` KAC):**
- A1: Beneficiaries who have a Manus account today are a SUBSET of `persons` rows. Some `persons` rows have no Manus account (registered by a volunteer, never used the beneficiary PWA). **Decision required from stakeholder:** is this 1:1, 1:0..1, or 1:N?
- A2: The Manus user's email or phone may match a `persons.email` or `persons.telefono` — but not always. **Verification:** ask Leo + Sole how the matching is meant to happen.
- A3: The `users` table is in MySQL (drizzle), `persons` in Supabase Postgres. A foreign-key cross-DB constraint is impossible; the link is application-level only. **Mitigation:** add a column `persons.auth_open_id` (TEXT, indexed, nullable, unique) — application-side referential integrity.
- A4: Re-issuing QRs to existing beneficiaries is operationally fine; they re-print on next visit. **Verification:** confirm with Espe; if production already has live QR cards in beneficiary hands, plan a transition window.

**Stakeholder decision matrix (capture answers BEFORE writing code):**

| Question | Answer (TBD with Leo / Espe / Sole) |
|---|---|
| Who is allowed to access `MiQR.tsx`? Just registered Manus users? Or all `persons`? | |
| When a Manus user signs up, who associates them with their `persons` row? Self-service via email match, or admin-driven? | |
| Email-match risk: a beneficiary with a shared family email could accidentally link to another person — is this acceptable, or is admin approval required? | |
| What happens to existing live QR cards (printed JSON-format from pre-QA-1A)? Re-issue all on next visit, or accept a transition window? | |
| Should `persons.auth_open_id` be visible in admin UI (debug column) or strictly internal? | |

**Architecture sketch (assuming admin-driven 1:1 mapping with email-fallback):**

```ts
// 1. Migration: add auth_open_id to persons, with unique index.
//    supabase/migrations/2026MMDDhhmmss_add_persons_auth_open_id.sql
ALTER TABLE persons ADD COLUMN auth_open_id TEXT;
CREATE UNIQUE INDEX uq_persons_auth_open_id
  ON persons (auth_open_id)
  WHERE auth_open_id IS NOT NULL AND deleted_at IS NULL;

// 2. New tRPC procedure `persons.linkAuthUser` (admin-only):
//    Input: { personId, openId } → updates persons.auth_open_id.
//    Idempotent; refuses if openId already linked to a different person.

// 3. Auth context middleware extension:
//    On every request, after resolving Manus user, look up
//    persons.auth_open_id = ctx.user.openId. Attach as ctx.person (nullable).
//    Cache in-memory per session.

// 4. MiQR.tsx un-stub:
//    if (!ctx.person) → show the existing "no disponible aún" message
//      with extra copy: "Pídele a un voluntario que te asocie tu cuenta."
//    if (ctx.person) → call persons.getMyQrPayload() (new procedure that
//      uses ctx.person.id as the UUID, signs with QR_SIGNING_SECRET).
//      Render with the QA-1A canonical URI.

// 5. Admin UI: small "Asociar cuenta de usuario" button on the person
//    detail page that calls linkAuthUser({ personId, openId: <input> }).
```

**Tasks:**
- [ ] **D.1 Stakeholder Q&A** — capture answers to the matrix above. NO CODE until this is done. (Commit: `docs(f-002): stakeholder Q&A for Manus↔persons mapping` — even if only the matrix is filled.)
- [ ] **D.2 Migration + RLS** — add `persons.auth_open_id` + unique index + RLS policy that lets a person read their OWN row when `auth_open_id = current_setting('jwt.claims.sub')` (or equivalent for Manus session).
- [ ] **D.3 Server: `persons.linkAuthUser` adminProcedure** + duplicate-link rejection test.
- [ ] **D.4 Server: extend context with `ctx.person` lookup** + test that returns null when unlinked.
- [ ] **D.5 Server: `persons.getMyQrPayload` protectedProcedure** — wraps `getQrPayload({ personId: ctx.person.id })` with explicit "must be linked" guard.
- [ ] **D.6 Client: un-stub `MiQR.tsx`** — branch on `ctx.person` presence; render canonical QR when linked, friendly message + CTA when not.
- [ ] **D.7 Client: admin UI** — add "Asociar cuenta de usuario" button on person detail page (same person-detail page used by QRCodeCard).
- [ ] **D.8 Tests:** linkAuthUser dedup; getMyQrPayload guard; MiQR stub-branch behavior.
- [ ] **D.9 Update `qr-no-pii.test.ts`** — remove the `MiQR.tsx` "must not contain QRCode.toCanvas" lock now that it's a real generator again. Replace with the same PII-key check as `QRCodeCard.tsx`.
- [ ] **D.10 Update `docs/runbooks/eipd-status.md`** — note that `persons.auth_open_id` is now a tracked PII column (de facto identifier).

**Hard rules:**
- Stakeholder Q&A FIRST. Without answers, you'll build the wrong thing. The plan §J KAC was explicit about this.
- One commit per task above (10 commits). Atomic.
- `pnpm test qr-no-pii` MUST pass at every step — protects the F-001 regression.
- Schema migration is `IF NOT EXISTS` for column + unique index.

**Verification gates:**
- [ ] `pnpm check` 0 errors.
- [ ] `pnpm test` baseline + new tests passing.
- [ ] `pnpm test qr-no-pii` green (the lock-out test now becomes the canonical-format test).
- [ ] Smoke: register a person → admin links Manus account → beneficiary visits `/mi-qr` → sees real QR → volunteer scans it → check-in succeeds.

**Time est:** ~2-3 hrs *after* stakeholder Q&A · **Risk:** medium (touches schema + auth + UI). **Subagent:** optional.

---

## 5. Verification gates (every PR)

| # | Gate | Command | Pass criterion |
|---|---|---|---|
| 1 | TS clean | `pnpm check` | 0 errors |
| 2 | Test parity | `pnpm test 2>&1 \| tail -5` | `19 failed env-only / 880 passed / 26 skipped (925)` (or +N for new RED→GREEN) |
| 3 | Lint | `pnpm lint` | for QA-3/5: should DROP from 100 baseline; for QA-7B/F-002: 0 new errors |
| 4 | File-size cap | `find ... \| awk '$1 > 400'` | empty (excl. test files PR-G) |
| 5 | Build | `pnpm build` | succeeds; for QA-7B: per-route chunk ≤100 KB gz; initial JS ≤180 KB gz |
| 6 | Self-review checklist | manual against §3 rubric | every box ticked |
| 7 | Lighthouse (QA-7B only) | `pnpm exec lhci autorun` mobile | ≥99/4; LCP <1.5s; INP <100ms |
| 8 | QR-no-PII (F-002 only) | `pnpm test qr-no-pii` | green; the canonical-format check covers MiQR.tsx now |

If any gate fails: STOP, file a new finding, do NOT bundle into the current PR.

---

## 6. Fix protocol per finding (every commit follows this)

Per `/systematic-debugging` and `/test-driven-development`:

1. **Phase 1 — Gather** (read-only). Confirm the finding. Read surrounding 50 lines. `git blame` for context.
2. **Phase 2 — Hypothesize.** Root cause vs symptom?
3. **Phase 3 — Minimal repro / RED test.** For behavior-affecting fixes: write a failing test FIRST. For type-only / cleanup fixes: skip.
4. **Phase 4 — Root-cause fix (GREEN).** Smallest possible diff.
5. **Self-review (`/code-review`).** Run §3 rubric.
6. **Verify gates** (§5).
7. **Commit.** One finding per commit. Message format: `fix(<area>): <finding> [<severity>]`.

If a fix surfaces a deeper issue: file a NEW finding, do NOT bundle.

---

## 7. PR template (every QA PR uses this)

```markdown
## Summary
<2 bullets — what this PR does + which findings close>

## Findings addressed
- F-NNN <one-liner>
- F-NNN <one-liner>

## Asks for review on (per /requesting-code-review)
- <specific risk 1 — e.g. "verify the typed-wrapper doesn't break Realtime subscriptions">
- <specific risk 2 — e.g. "verify recharts replacement renders correctly on Safari iOS 15">

## Verification
- pnpm check: 0 errors
- pnpm test: 19 failed env-only / 880 passed / 26 skipped (925) preserved
- pnpm lint: <delta from baseline>
- pnpm build: <delta on bundle size>
- New tests added: <list>
- Behavior change: <none / minimal — explained>
- Lighthouse (if applicable): <numbers>

## Out of scope (deliberately deferred)
- <thing 1>
- <thing 2>
```

When review comes back (per `/receiving-code-review`):
- Verify each suggestion against the actual code BEFORE accepting.
- Disagreements get a one-paragraph response, not silent ignore.
- "LGTM" on a HIGH finding without a verification step is not acceptable.

---

## 8. PR sequencing

| Order | PR | Hard prerequisite | Time est | Risk |
|---|---|---|---|---|
| 1 | **QA-3** dead-code | none (off `qa/phase6-qa-1a`) | 1 hr | low-medium |
| 2 | **QA-5** typed Supabase wrapper | QA-3 merged (clean type baseline) | 3-4 hrs | medium |
| 3 | **QA-7B** top-1% perf | QA-5 merged (lint baseline trustworthy) | 3-4 hrs | medium |
| 4 | **F-002** auth↔persons mapping | Stakeholder Q&A done (D.1) | 2-3 hrs | medium |

QA-3 and QA-5 can stack as a single sequential workstream. QA-7B can begin once QA-5 lands. F-002 runs WHENEVER stakeholder answers arrive — independent of perf work.

After all 4 land, run `/refactor-clean` once more (catches anything QA-7B's bundle-tweaks left behind) and run `pnpm test --coverage` for a coverage snapshot.

---

## 9. Out of scope (deliberately deferred)

- **Behavior changes** outside CLAUDE.md guard-rail violations.
- **Test-file splits >400 lines** (`server/persons.test.ts`, `server/ocrDeliveryExtraction.test.ts`) — Phase 5b PR-G handles those.
- **Real PowerSync rollout** — Dexie cache (introduced post-QA-1A in a separate path) covers QA-1A's needs; PowerSync is a separate gate per CLAUDE.md.
- **Schema migrations beyond F-002's `auth_open_id` column** — defer.
- **README / CLAUDE.md docs updates** — single docs PR after QA-3/5/7B/F-002 land.
- **Performance below 99 Lighthouse** — top-1% means ≥99 stretch 100, not literally 100 in every category every run (CI variance).
- **Bringing the 19 env-failing tests to green** — they're env-dependent; needs CI Supabase credentials, separate workstream.

---

## 10. Codex evaluation rubric

A reviewer using this plan should verify:

- ✅ **Each PR has a mechanical pre-flight assumption check** (§4.A.A1..A4, §4.B.A1..A3, §4.C.A1..A5, §4.D.A1..A4) that runs BEFORE code lands.
- ✅ **Each fix is one finding per commit.** No "while I'm here" bundling.
- ✅ **Behavior-affecting fixes have a RED test before the fix.** Type-only fixes skip — explicit.
- ✅ **Severity rubric applied:** CRITICAL=security/RGPD/regression; HIGH=test gap/perf ceiling/bundle violation; MEDIUM=type comment/staleTime; LOW=cosmetic.
- ✅ **Karpathy lock:** §4.B Wrapper file ≤80 lines (if it grows past 200 → STOP). §4.A every delete preceded by manual `grep` cross-reference.
- ✅ **Per-PR test parity proven**, not asserted. The baseline (`19 / 880 / 26 / 925`) is repeated in every gate so drift is impossible to miss.
- ✅ **Stakeholder dependency on F-002 made explicit.** Q&A before code.
- ✅ **Verification gates are mechanical** — runnable commands with pass criteria, not subjective judgment.

The most common failure mode for follow-up sweeps is **scope ratcheting**. The fix protocol + PR template + per-PR §J KAC are designed to prevent it. If a fix touches files outside the original finding's blast radius, STOP and file a new finding.

---

## 11. How to start (new session)

```bash
cd /Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo-followups
git fetch origin
git checkout -b qa/phase6b-followups origin/qa/phase6-qa-1a
pnpm install
pnpm check 2>&1 | tail -5      # capture baseline (expect 0 errors)
pnpm test 2>&1 | tail -5       # capture baseline (expect 19/880/26/925)
pnpm lint 2>&1 | tail -3       # capture baseline (expect 100/89)
pnpm build 2>&1 | tee /tmp/build-baseline.txt  # capture chunk sizes

# Then read this plan + the prior PR queue:
#   docs/superpowers/findings/2026-05-06-consolidated.md
#   docs/superpowers/findings/2026-05-06-session-summary.md

# Pick PR order: QA-3 → QA-5 → QA-7B → F-002 (or F-002 in parallel after stakeholder Q&A).
```

When the plan executes, mark `- [ ]` → `- [x]` per task.

---

## 12. Reviewer notes

- The QA-3 dead-code sweep is most prone to false positives. **Karpathy lock:** every "unused" finding requires manual `grep -rn` confirmation cited in the commit body. If a deletion drops `pnpm test` count by even one, ROLL BACK.
- QA-5 typed wrapper might reveal that the `(db as any)` pattern was actually correct for SDK quirks. If `§5.1` returns "doesn't compile without cast", STOP and rethink — don't force a wrapper that doesn't add type safety.
- QA-7B is the biggest. Sub-PR boundaries (B.1–B.5) are designed so each is independently shippable. Don't merge them into one mega-PR; the bundle-size gates per sub-PR are what catch regressions.
- F-002 is gated on stakeholder Q&A. **Do not write code without it.** Building the wrong mapping model is worse than the current stub.

If anything in this plan is unclear or unverifiable, surface it before §4 starts.
