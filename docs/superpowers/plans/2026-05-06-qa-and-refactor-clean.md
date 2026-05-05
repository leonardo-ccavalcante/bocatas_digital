# Phase 6 — Production-ready QA, Debug, and Refactor-Clean Sweep

> **For agentic workers:** Drive this with `superpowers:executing-plans`. Each audit (§4) is a read-only discovery; each fix (§7) is a verified PR. Use checkbox (`- [ ]`) syntax for tracking.
>
> **For human/Codex review:** This plan is self-contained. Read it cold; you should be able to execute or critique without prior session history.

**Goal:** Take the codebase from "shipping-ready architecture" (Phase 5b) to **production-ready quality** by running a deep, systematic audit across 9 quality dimensions, capturing every finding into a backlog, and fixing them in small verified PRs — with **zero behavior change** and the existing test baseline (`19 failed (env-dependent) | 839 passed | 26 skipped | 884 total`) preserved at every step.

**What this plan is NOT:**
- A re-architecture. Not adding features.
- A test-coverage push to 80%+. Coverage gaps are *catalogued* here, but only the highest-risk gaps get fixed.
- A behavior fix. Bugs that change behavior are filed but only fixed if they violate CLAUDE.md guard-rails (RGPD, PII, etc.).

---

## 1. Methodology — every skill maps to a concrete section

Every workstream below corresponds to a real action, not a name-drop.

| Skill | Where it applies | What it produces |
|---|---|---|
| `/writing-plans` | This document | Bite-sized verifiable steps, exact paths, exact pass criteria |
| `/systematic-debugging` | §6 — every audit finding gets the 4-phase treatment (gather → hypothesize → minimal repro → root-cause fix). No symptom patches. |
| `/test-driven-development` | §7 — every behavior-affecting fix gets a regression test FIRST (RED), then minimal fix (GREEN), then refactor. |
| `/code-review` | §6 — self-review checklist before every commit (security, types, style, consistency). |
| `/coding-standards` | §3 — the rubric (no `any`, file size, error handling, immutability). Both `~/.claude/rules/common/` and `~/.claude/rules/typescript/` apply. |
| `/refactor-clean` | §4.B — only AFTER each PR merges. Don't run during in-flight refactor (its agentic deletes can clip files still consumed by an in-flight sub-file). |
| `/requesting-code-review` | §7 — every PR body includes an explicit "asks for review on:" section so the reviewer focuses on the right risks. |
| `/receiving-code-review` | §7 — when Codex (or human) returns review, NO performative agreement. Verify each suggestion against the codebase before accepting. |
| `/executing-plans` | This whole plan | Mark `- [ ]` → `- [x]` per step; halt on blocker; update plan if scope changes. |

**Reinforcement-learning framing (continuing from Phase 5b):** treat each fix as one episode. Verification gates are the reward signal. If `pnpm check` regresses, **roll back THAT fix only** — debug root cause — retry. Don't bundle many fixes per commit; small atomic episodes are easier to reason about.

---

## 2. Pre-flight (mandatory baselines — capture before §4 audits start)

```bash
cd /Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo-followups
git checkout cleanup/phase5b-pr-b   # or branch off origin/main
git fetch origin
pnpm install
pnpm check 2>&1 | tail -10          # expect only audit-no-pii.test.ts:47 TS1501
pnpm test 2>&1 | tail -8            # expect 19 failed | 839 passed | 26 skipped (884)
```

Capture these baselines verbatim into the relevant audit section so any regression is obvious.

**Pre-flight assumption to verify before §4 starts:** the 19 env-dependent failing tests must be the **same 19** as the Phase 5b baseline. If a different test fails, that is itself a finding (filed in Audit E).

---

## 3. Coding-standards rubric (the bar every fix must clear)

Pulled verbatim from `~/.claude/rules/typescript/coding-style.md` and `~/.claude/rules/common/coding-style.md`. Reviewer checks every changed line against this list.

**TypeScript:**
- [ ] No `any` in application code. `unknown` + narrowing only.
- [ ] No `as unknown as X` casts unless documented with a one-line *why* comment.
- [ ] `Record<string, unknown>` is fine for unknown-shape data; not fine as a lazy substitute for a typed schema.
- [ ] Public APIs (exported functions, components) have explicit parameter and return types.
- [ ] React props use a named `interface` or `type`; no `React.FC` unless required.
- [ ] No `// @ts-ignore` / `// @ts-expect-error` without a one-line *why* comment that includes a TODO link or upstream-bug reference.

**Style:**
- [ ] No `console.log` in production code paths (server/* outside of `*.test.ts`, client/src/* outside of dev-only utilities).
- [ ] Files <400 lines (Phase 5b cap). Functions <50 lines. Nesting ≤4 levels.
- [ ] Immutable patterns — spread-update, no in-place mutation of inputs.
- [ ] No half-implementation (placeholder URLs, fake TODO data, etc.) shipped to prod paths.

**Error handling:**
- [ ] Every `catch (e)` narrows `e` (`instanceof Error` or schema parse) before reading properties.
- [ ] Server errors thrown as `TRPCError` with explicit code; never raw `Error`.
- [ ] Client mutations show user-readable toast on error; never silent swallow.
- [ ] No leaked PII in error messages or logs (CLAUDE.md guard-rail).

**Security (extends `~/.claude/rules/common/security.md`):**
- [ ] No hardcoded secrets. All sensitive values via `ENV` or `process.env`.
- [ ] All user input validated by Zod at the boundary (tRPC input schema).
- [ ] No string-concatenated SQL — Supabase query builder only.
- [ ] No PII in QR codes, logs, or audit rows (CLAUDE.md guard-rail).
- [ ] RLS-sensitive fields (`situacion_legal`, `foto_documento`, `recorrido_migratorio`) only readable by superadmin/admin.

---

## 4. Audit phase — read-only discovery (no fixes yet)

Each audit produces a **findings list** in the corresponding markdown stub (`docs/superpowers/findings/2026-05-06-audit-X.md`). Findings are then triaged in §6.

### 4.A TypeScript strictness audit

**Why first:** strict types catch the largest class of latent bugs at compile time.

**Commands:**
```bash
# Count `any` usages in app code
rg -n '\b: any\b|\bas any\b|<any>|: any\[\]|as any\[\]' \
   server/ client/src/ shared/ \
   --type ts --type tsx \
   | grep -v '\.test\.\|\.spec\.\|node_modules' | tee findings/audit-A-any.txt

# Count `as unknown as`
rg -n 'as unknown as' server/ client/src/ shared/ --type ts --type tsx \
   | grep -v '\.test\.\|node_modules' | tee findings/audit-A-unknown-cast.txt

# Count eslint-disable
rg -n 'eslint-disable\|@ts-ignore\|@ts-expect-error' \
   server/ client/src/ shared/ --type ts --type tsx \
   | grep -v node_modules | tee findings/audit-A-disable.txt
```

**Triage rule:** every `any` in production code paths is a finding. `as unknown as` requires a *why* comment within 2 lines or it's a finding. `// eslint-disable` without a *why* comment is a finding.

### 4.B Dead-code audit (drives /refactor-clean)

**Why:** Phase 5b moved many files; orphaned exports almost certainly exist.

**Commands:**
```bash
# Add knip + ts-prune (if not already present)
pnpm add -D knip ts-prune depcheck

# Run all three — combined output is the working list
npx knip --reporter compact 2>&1 | tee findings/audit-B-knip.txt
npx ts-prune 2>&1 | tee findings/audit-B-ts-prune.txt
npx depcheck 2>&1 | tee findings/audit-B-depcheck.txt
```

**Triage rule:** every "unused export" or "unused file" finding is a candidate for deletion. **Verify each one** — knip has false positives for tRPC procedure exports consumed via the router barrel. Files referenced only in tests are NOT dead (they're test fixtures).

### 4.C Security audit (CLAUDE.md is non-negotiable here)

**Why:** RGPD compliance is the legal shield for the entire project. CLAUDE.md §3 lists guard-rails; this audit verifies them.

**Commands:**
```bash
# Hardcoded secrets
rg -nE 'sk-[a-zA-Z0-9]{20,}|api[_-]?key\s*[:=]\s*["'"'"'][^"'"'"']{16,}' \
   server/ client/src/ shared/ | grep -v '\.example\|node_modules\|\.test\.\|\.lock' | tee findings/audit-C-secrets.txt

# PII in console.log / console.error (logs PII = RGPD violation)
rg -n 'console\.(log|error|warn|info)' server/ \
   --type ts | grep -v '\.test\.\|node_modules' | tee findings/audit-C-server-console.txt

# Server console.log handling — every entry must be reviewed for PII
# Look for patterns: nombre, apellidos, telefono, email, numero_documento, situacion_legal

# Direct fetch() calls bypassing tRPC (potential auth-skip)
rg -n 'fetch\(' server/ client/src/ \
   --type ts --type tsx | grep -v '\.test\.\|node_modules' | tee findings/audit-C-fetch.txt

# Look for raw SQL via .rpc() — verify args sanitized
rg -n '\.rpc\(' server/ --type ts | grep -v '\.test\.\|node_modules' | tee findings/audit-C-rpc.txt

# RLS-sensitive fields used outside admin paths
rg -n 'situacion_legal|foto_documento|recorrido_migratorio' \
   client/src/ --type ts --type tsx \
   | grep -v '\.test\.\|node_modules' | tee findings/audit-C-pii-fields.txt
```

**Triage rule:** any console.log printing user-PII fields is a CRITICAL finding (must fix in same session). Any `as any` around tRPC ctx that bypasses role-gates is CRITICAL. RLS-field reads outside admin role-checked paths are CRITICAL.

### 4.D Coding-standards audit

**Commands:**
```bash
# File size > 400 (re-verify Phase 5b cap holds)
find server client/src shared -name '*.ts' -o -name '*.tsx' \
   2>/dev/null \
   | xargs wc -l 2>/dev/null \
   | awk '$1 > 400 && $2 != "total"' \
   | grep -v node_modules \
   | grep -v 'database.types\.ts' \
   | grep -v 'ui/sidebar\|ui/chart\|ui/menubar\|ui/dropdown-menu' \
   | tee findings/audit-D-files-over-400.txt

# Function size — heuristic: count contiguous non-blank lines after `function` / `=>` / method
# (no clean tool — use code-reviewer agent for this dimension)

# Lint
pnpm lint 2>&1 | tee findings/audit-D-lint.txt
```

**Triage rule:** any file >400 lines that is NOT a test file (deferred to PR-G) is a finding. Lint warnings are findings; lint errors are blockers.

### 4.E Test-coverage audit

**Why:** map coverage gaps to risk, not to a coverage-percentage target.

**Commands:**
```bash
# Coverage report
pnpm test --coverage 2>&1 | tee findings/audit-E-coverage.txt

# List the 19 env-dependent failing tests
pnpm test 2>&1 | grep -E '× |FAIL' | tee findings/audit-E-failing.txt

# Verify they match the Phase 5b baseline (env-dependent only)
diff findings/audit-E-failing.txt docs/baselines/phase5b-failing-tests.txt || echo "DRIFT!"
```

**Triage rule:** failures that aren't env-dependent are CRITICAL findings (regression). Coverage gaps in CLAUDE.md guard-rail paths (RGPD consent, RLS, PII) are HIGH. Other gaps are LOW.

### 4.F Performance audit

**Commands:**
```bash
# Client bundle budget (Lighthouse — CI threshold is 95+)
pnpm build 2>&1 | tee findings/audit-F-build.txt
# Look for chunks > 300KB (CLAUDE.md guard-rail)

# Server queries — find N+1 patterns
rg -n '\.eq\(' server/ --type ts | wc -l
rg -nB1 -A4 'forEach.*async\|for.*await' server/ --type ts \
   | grep -v '\.test\.\|node_modules' | tee findings/audit-F-async-loops.txt

# Missing indexes — list every column referenced in WHERE / EQ / GTE
# Manual cross-reference with supabase/migrations/ — flag any missing
```

**Triage rule:** bundle chunks >300KB are findings. `await` inside forEach (N+1 risk) is a finding. WHERE-clause columns without indexes are findings.

### 4.G Accessibility audit (WCAG 2.1 AA — CLAUDE.md guard-rail)

**Why:** beneficiaries include elderly, low-literacy, non-Spanish speakers. Semantic HTML and ARIA are non-negotiable.

**Commands:**
```bash
# Buttons without accessible labels
rg -nE '<button[^>]*>(\s*<[^>]+>\s*)*\s*</button>' \
   client/src/ --type tsx | grep -v '\.test\.\|node_modules' \
   | tee findings/audit-G-empty-buttons.txt

# Images without alt
rg -nE '<img[^>]*' client/src/ --type tsx | grep -v 'alt=' \
   | grep -v 'node_modules' | tee findings/audit-G-img-no-alt.txt

# Click handlers on non-interactive elements (div onClick without role)
rg -nE '<div[^>]*onClick' client/src/ --type tsx \
   | grep -v 'role=' | grep -v 'node_modules' \
   | tee findings/audit-G-clickable-divs.txt

# Color-only feedback (CLAUDE.md: must include icon, not just color)
rg -nE 'bg-(red|green|amber|yellow)-' client/src/features/checkin \
   --type tsx | tee findings/audit-G-checkin-color.txt
```

**Triage rule:** check-in result UI MUST use color + icon + text together (CLAUDE.md). Empty buttons / unlabeled images are findings. Clickable divs without `role="button"` and `tabIndex={0}` are findings.

### 4.H Error-handling audit

**Commands:**
```bash
# Empty catch blocks (silent swallow)
rg -nE 'catch[^{]*\{\s*\}|catch\s*\([^)]*\)\s*\{\s*\}' \
   server/ client/src/ --type ts --type tsx \
   | grep -v '\.test\.\|node_modules' | tee findings/audit-H-empty-catch.txt

# catch(error) without narrowing
rg -nE 'catch\s*\(\s*[a-zA-Z_]+\s*\)' server/ client/src/ \
   --type ts --type tsx | grep -v '\.test\.\|node_modules' \
   | tee findings/audit-H-unnarrowed.txt

# Server: throws that aren't TRPCError
rg -nE 'throw new (Error|TypeError|RangeError)' server/ --type ts \
   | grep -v '\.test\.\|node_modules' | tee findings/audit-H-raw-throws.txt
```

**Triage rule:** empty catch blocks are findings. Server `throw new Error(...)` (instead of TRPCError) is a finding (loses tRPC error code → 500 instead of 400/404/403). Catch with un-narrowed `error.message` access is a finding.

### 4.I CLAUDE.md compliance audit

**Why:** project-specific guard-rails not covered by global rules.

Verify each guard-rail from CLAUDE.md §3 + §7:

- [ ] **No PII in QR codes** — `rg -n 'qr.*nombre\|qr.*telefono\|qr.*documento' client/src server/` ⇒ should be empty
- [ ] **No PII in logs** — covered by 4.C
- [ ] **EIPD legal doc exists** — `ls docs/legal/EIPD*` should return at least one file
- [ ] **Multi-language consent** (4 languages — es/ar/fr/bm) — `rg -n 'consent.*idioma' supabase/migrations/` should show all 4 languages seeded
- [ ] **No XState outside check-in** — `rg -n 'createMachine\|useMachine' client/src/` ⇒ only checkin/
- [ ] **No heavy chart libraries** — `cat client/package.json | jq '.dependencies'` ⇒ no recharts/chartjs/d3
- [ ] **Feature folder boundaries** — Schema Agent files (migrations, schemas) ↔ Feature Agent files (UI) — no UI imports inside `supabase/migrations/`
- [ ] **OCR is Gate 2** — verify no auto-OCR runs in Gate 1 paths (RegistrationWizard OCR is opt-in via button)
- [ ] **GUF: CSV-only, no API** — `rg -n 'guf.*api\|api.*guf' server/ client/src/` ⇒ should be empty
- [ ] **No WhatsApp SDK in Next** — `rg -n 'whatsapp\|whatsAPI\|twilio' client/src/ server/` ⇒ should be empty (handled by Chatwoot/n8n)

**Triage rule:** any guard-rail violation is a CRITICAL finding (legal/compliance risk).

---

## 5. Findings consolidation (output of §4)

After all audits run, consolidate into one ranked file:

```
docs/superpowers/findings/2026-05-06-consolidated.md
```

Format per finding:

```
## F-NN: <one-line title>
**Severity:** CRITICAL | HIGH | MEDIUM | LOW
**File(s):** path:line[, path:line]
**Category:** A/B/C/D/E/F/G/H/I (audit dimension)
**Why:** <one sentence>
**Fix sketch:** <one sentence>
**Verification:** <pnpm check + which test files cover it>
**Risk if ignored:** <one sentence>
```

**Severity rubric:**
- **CRITICAL** — security, RGPD, RLS-bypass, PII leak, behavior-changing bug. Fix THIS session.
- **HIGH** — type holes that mask bugs, dead code in critical paths, missing indexes on hot queries, untested guard-rail. Fix in next 1–2 sessions.
- **MEDIUM** — coding-standards drift, minor a11y, console.log in non-PII paths. Fix in batch PRs.
- **LOW** — cosmetic, comment cleanup, stale TODOs. Backlog.

---

## 6. Fix protocol per finding (every fix follows this)

Per `/systematic-debugging` and `/test-driven-development`:

1. **Phase 1 — Gather** (read-only). Confirm the finding exists. Read the surrounding 50 lines. Check git blame for *why* the code is the way it is.
2. **Phase 2 — Hypothesize**. Write down: what is the root cause? Is the finding the disease or just the symptom?
3. **Phase 3 — Minimal repro / RED test**. For behavior-affecting fixes: write a failing test FIRST. For type-only / cleanup fixes: skip (no behavior to assert).
4. **Phase 4 — Root-cause fix (GREEN)**. Smallest possible diff. No tangential cleanups.
5. **Self-review (`/code-review`)**. Run the §3 rubric against the diff before staging.
6. **Verify gates**:
   - `pnpm check` — only the pre-existing TS1501.
   - `pnpm test` — same `19 failed | 839 passed | 26 skipped (884)` baseline (or +N passing if RED test was added).
   - File size still ≤400 lines.
7. **Commit**. One finding per commit. Message format: `fix(<area>): <finding F-NN one-liner> [<severity>]`.

If a fix surfaces a deeper issue: file a NEW finding, do NOT bundle into current commit.

---

## 7. Fix sequencing — PR queue

PRs land in this order. Each is independently reviewable. Each ends with `pnpm check` clean + test parity.

| PR | Title | Severity scope | Est. commits |
|---|---|---|---|
| **QA-1** | Security & RGPD critical fixes | CRITICAL | 3–5 |
| **QA-2** | TypeScript hardening (`any` → `unknown`, narrow casts) | HIGH | 5–10 (one per file) |
| **QA-3** | Dead-code sweep (per `/refactor-clean`) | MEDIUM | 2–4 |
| **QA-4** | Error-handling consistency | HIGH | 3–6 |
| **QA-5** | Coding-standards cleanup (lint, console.log, file size) | MEDIUM | 4–8 |
| **QA-6** | Accessibility fixes (WCAG 2.1 AA) | HIGH | 3–5 |
| **QA-7** | Performance fixes (queries, bundle) | MEDIUM | 2–4 |
| **QA-8** | CLAUDE.md compliance gaps | CRITICAL/HIGH (varies) | 1–3 |
| **QA-9** | Test coverage for guard-rails (CONSENT/RLS/PII) | HIGH | 3–6 |

**PR sequencing constraints:**
- QA-1 always first (CRITICAL takes precedence).
- QA-3 (dead-code) runs AFTER QA-2 (typecheck must be green before knip/ts-prune output is reliable).
- QA-9 may run in parallel with any other (test-only changes).

---

## 8. PR template (every QA-N PR uses this)

```markdown
## Summary
<2 bullets>

## Findings addressed
- F-NN <one-liner>
- F-NN <one-liner>

## Asks for review on (per /requesting-code-review)
- <specific risk 1>
- <specific risk 2>

## Verification
- pnpm check: TS1501 baseline only
- pnpm test: 19 failed | 839 passed | 26 skipped (884) preserved
- New tests added: <yes/no — listed below>
- Behavior change: <none / minimal — explained>

## Out of scope (deliberately deferred)
- <thing 1> → tracked as F-NN
```

When review comes back (per `/receiving-code-review`):
- Verify each suggestion against the actual code BEFORE accepting.
- Disagreements get a one-paragraph response in the PR thread, not silent ignore.
- "LGTM" on a CRITICAL fix without a verification step is not acceptable.

---

## 9. Verification gates (must all pass before any QA-N PR is considered "done")

| # | Gate | Command | Pass criterion |
|---|---|---|---|
| 1 | TS clean | `pnpm check` | only TS1501 baseline |
| 2 | Test parity | `pnpm test 2>&1 \| tail -5` | `19 failed \| 839 passed \| 26 skipped (884)` (or +N passing for new RED→GREEN tests) |
| 3 | Lint | `pnpm lint` | zero new errors; warnings only allowed if also in baseline |
| 4 | File-size cap | `find ... \| awk '$1 > 400'` | empty (excl. test files PR-G) |
| 5 | No new findings | re-run §4 audits on changed paths | finding count ≤ pre-PR count |
| 6 | Self-review checklist (§3) | manual | every box ticked |
| 7 | Build (for client-affecting PRs) | `pnpm build` | succeeds; bundles ≤300KB |

If any gate fails: STOP. Apply `/systematic-debugging` Phase 1 (root cause). Don't bundle a fix into the current PR; file a new finding and continue with the next PR.

---

## 10. Out of scope (deliberately deferred)

- **Test-file splits** (>400 lines in `*.test.ts`) — Phase 5b PR-G handles this.
- **Feature additions** of any kind — this is QA, not product work.
- **Performance optimization beyond the 300KB bundle budget** — separate Phase if needed.
- **Schema migrations** unless required to fix a CRITICAL finding (RGPD).
- **Renaming for "clarity"** — not a bug; not in scope.
- **CLAUDE.md / README documentation updates** — single docs PR after QA-1..9 land.

---

## 11. Codex evaluation rubric

A reviewer using this plan should verify:

- ✅ **Each audit dimension has a mechanical command** (not subjective judgment) and a triage rule.
- ✅ **Every fix is one finding** — no "while I'm here" bundling.
- ✅ **Every behavior-affecting fix has a RED test before the fix**.
- ✅ **Severity rubric is applied consistently** — CRITICAL is reserved for security/RGPD/regression; "looks ugly" is not CRITICAL.
- ✅ **Karpathy lock**: any "while I'm here" cleanup that's not in the original finding is flagged for removal.
- ✅ **Per-PR test parity proven**, not asserted.

Likely friction points:

- **§4.B dead-code false positives** — knip flags tRPC procedure exports as unused because they're consumed via the router barrel. Manual verification per finding is mandatory.
- **§4.C PII triage** — what counts as PII in a log? CLAUDE.md says "no PII in logs"; project answer: any field from the §3 RLS-sensitive list, plus `nombre + apellidos`, plus `numero_documento`. IDs and timestamps are fine.
- **§4.G accessibility** — color-only feedback is not always wrong (e.g. urgent banners); check-in result UI specifically must combine color + icon + text.

---

## 12. How to start

```bash
cd /Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo-followups
git checkout -b qa/phase6-audit origin/cleanup/phase5b-pr-b   # or origin/main once Phase 5b lands
mkdir -p docs/superpowers/findings
pnpm install
# 1. Capture baselines (§2)
pnpm check 2>&1 | tail -10
pnpm test 2>&1 | tail -8
# 2. Run §4 audits in order (A → I), feeding results into findings/
# 3. Consolidate (§5)
# 4. Triage and start QA-1 (§7)
```

When the plan executes, mark `- [ ]` → `- [x]` in §4 and §7 in this doc as each step completes.

---

## 13. Reviewer notes

If anything in this plan is unclear or unverifiable, surface it before §4 starts. The cost of clarifying a methodology question upfront is far smaller than the cost of unwinding a bad audit halfway through.

The most common failure mode for QA sweeps is **ratcheting scope**: discovering a finding leads to "well, while I'm here…" and the diff blows up. The fix protocol in §6 + the PR template in §8 are designed to prevent that. If a fix touches files outside the original finding's blast radius, STOP and file a new finding.
