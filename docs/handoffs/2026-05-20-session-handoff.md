# Session Handoff — 2026-05-20

> **Next agent: read this top-to-bottom before any work.** Captures session state, what's done, what's next, and the skill chain for continuation.
>
> **Branch:** `feat/schema-s0-micro-pr-0` (15 commits, pushed to origin, PR-mergeable per "No conflicts")
> **Worktree:** `/Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo-schema-s0/`
> **Plan file:** `~/.claude/plans/read-the-file-users-familiagirardicavalc-cheerful-meerkat.md` (Phase 2+3 parallel-implementation plan)

---

## 1. What was accomplished this session

### Original goal
Execute Stage S0 (foundations) and Stage S1 (Phase 2 schema) of the parallel-implementation plan, then begin Stage S3 fan-out.

### Done (15 commits on `feat/schema-s0-micro-pr-0`)

| Stage | Commits | What |
|---|---|---|
| **S0** | `8cf3e89` `12b6610` `f3498e3` | Foundations: deps + Fraunces + max-lines ESLint + vendored Madrid postal-code data + drift-guard test (U7 RED→GREEN) + testing-strategy doc + 4 feature CODEMAPs |
| **S1** | `0fc9b31` | Phase 2 schema (M1 + M2 + M3): `madrid_distrito_for()`, families/persons `codigo_postal`+`distrito`, `report_saved_queries` table + RLS |
| **S2** | `8555384` | Karpathy thin vertical slice: `mapa.distritoStats` stub + `MapaChoropleth` skeleton + 12 toolchain-proof tests |
| **S3 (partial)** | `2c96cc5` | First S3 deliverable: `client-persons-step3` — `codigo_postal` field on RegistrationWizard |
| **CI rescue cascade** | `b5120ae` `323e4ae` `5024570` `dd264d5` `606c78f` `dfc5e47` `95532d6` `6d4da24` `39425b4` | 9 commits fixing prod-vs-repo schema gaps surfaced by `supabase start` + `types-drift` gates |

### Key artifacts

- **Plan file:** `~/.claude/plans/read-the-file-users-familiagirardicavalc-cheerful-meerkat.md` (Phase 2+3 parallel-implementation plan — locked decisions D1-D8, ~12 stages S0-S9)
- **Testing strategy:** `docs/superpowers/testing-strategy.md`
- **Feature codemaps:** `client/src/features/{mapa-tab,reports-tab,derivar}/CODEMAP.md` + `client/src/pages/admin/InstitucionesPage/CODEMAP.md`
- **Drift guard:** `server/__tests__/madrid-distrito-drift.test.ts` (9 tests, all GREEN)
- **Thin-slice tests:** `server/__tests__/mapa-router.test.ts` + `client/src/features/mapa-tab/__tests__/MapaChoropleth.test.tsx` (12 tests, all GREEN)

---

## 2. SAT triple-check + RL policy update from this session

**Cascade summary:** 7 same-shape CI failures (prod-vs-repo schema gaps) required 9 fix commits. Should have been ~3 with proper audit.

### Policy updates for next session

| Pattern | Old behavior | New policy |
|---|---|---|
| After 2nd same-shape CI failure | Patch each individually | **STOP, run comprehensive audit** (`grep "TO\|FROM\|CREATE POLICY" supabase/migrations/`) |
| When schema diff surfaces | Edit `database.types.ts` manually | **Run `supabase gen types --local`** in worktree (requires Docker); never hand-patch generated files |
| When CI has Supabase access | Apply migrations only | **First run `SELECT … FROM information_schema.columns/pg_proc/pg_roles`** to inventory ALL gaps; then capture in one migration |
| When SQL `EXCEPTION` catches a single SQLSTATE | Add narrowly | **Catch all 3 missing-object shapes**: `undefined_object` (42704), `undefined_column` (42703), `undefined_table` (42P01) |

### Tech debt logged
- **Task #12** (filed): add CI gate that runs `supabase start` on every migration PR. If this had existed, the cascade would have surfaced in 1 CI run, not 7.

---

## 3. What's left

### Immediate next work

The plan called for parallel Feature Agent fan-out (S3). 1 of 9 Feature Agents shipped (`client-persons-step3`). The remaining 8:

| Feature Agent | Status | Rendezvous |
|---|---|---|
| **server-mapa** (real aggregation) | ⏸ Not started | M1 merged ✓; canary per Karpathy "overfit one example" |
| **server-reports** (9 templated + customQuery) | ⏸ Not started | M3 merged ✓ |
| **server-instituciones** | ⏸ Not started (Phase 3) | M4 — pending S5 |
| **server-derivar** | ⏸ Not started (Phase 3) | M7 + core-utils — pending S5 |
| **core-utils** (docxRender + pdfFromDocx) | ⏸ Not started (Phase 3) | LibreOffice infra |
| **client-mapa** (real react-leaflet) | ⏸ Not started | server-mapa merged + canonical GeoJSON |
| **client-reports** | ⏸ Not started | server-reports merged |
| **client-instituciones** | ⏸ Not started (Phase 3) | server-instituciones merged |
| **client-derivar** | ⏸ Not started (Phase 3) | server-derivar merged |

### Pending tasks (from session task list)

- **#3** S0 `/benchmark` baseline on Phase 1 routes — deferred; not blocking
- **#8** S3 fan-out — 1/9 done, 8 remaining
- **#9** S4 Phase 2 ship gate
- **#10** S5-S9 Phase 3 + closeout
- **#12** CI gate improvement (filed this session)

### Pending follow-ups (non-blocking)

- LibreOffice deploy decision (Felix) — still open
- EIPD addendum kickoff (Sole + RGPD lawyer) — still open (per D8 doesn't block dev)
- Bocatas canonical Word template upload — still open
- `client/src/assets/madrid-distritos.geojson` is placeholder; canonical datos.madrid.es file needed before client-mapa S3 merges
- Postal-code backfill for existing families rows (Sole, operational)

---

## 4. Recommended skill chain (per /gstack-router) for next session

Next session's natural opening: **resume S3 fan-out starting with server-mapa as the "Karpathy canary"**.

```
[Session start]
  ↓ Read this handoff + plan file
  ↓
[S3 server-mapa] (the canary — fully complete this one before fanning out further)
  → /tdd          — RED tests for: k-anonymity floor 3, distritoStats aggregation
  → /executing-plans — production code per phase2 plan tasks 5/6
  → /requesting-code-review → /code-review → /receiving-code-review
  → /qa           — real-browser smoke against /programas/programa_familias?tab=mapa
  → /ship         — merge into main (or PR off feat/schema-s0-micro-pr-0)
  ↓
[S3 fan-out] (only after server-mapa fully green per Karpathy "overfit one example")
  → Parallel worktrees per D1: server-reports, client-mapa, client-reports
  → Same /tdd + /executing-plans + review loop per agent
  ↓
[S4 Phase 2 ship gate] (HARD GATE before Phase 3)
  → /qa per tab → /benchmark sweep → /review → /ship → /land-and-deploy → /canary 24h
  → Leo manual: flip ENABLED_TABS for mapa + reports
  ↓
[S5-S9] Phase 3 (Derivar + Instituciones + DOCX/PDF) per plan
```

### Skills to use (in order)

| Skill | When | Why |
|---|---|---|
| `/using-superpowers` | Session boot | Establish skill orientation |
| `/gstack-router` | After reading this handoff | Confirm next-skill choice |
| `/tdd` | Start of each Feature Agent | RED-first per CLAUDE.md TDD rule |
| `/executing-plans` | Production code per source-plan task numbers | Avoid scope creep |
| `/requesting-code-review` | At PR open | Structured review request |
| `/code-review` | Reviewer invocation | Sonnet code-reviewer + Opus security-reviewer on PII/RLS paths |
| `/receiving-code-review` | After review feedback | Apply feedback discipline |
| `/qa` | Per tab before ship | Real-browser smoke |
| `/benchmark` | Per PR + ship gate | Lighthouse + LCP + bundle regression |
| `/ship` + `/land-and-deploy` + `/canary` | Phase ship gates only | Production discipline |

### Skills to AVOID (saves your context)

- `/design-shotgun` — visual exploration is done; bocatas-v4 IS the contract
- `/brainstorming` — plans are written; just execute
- `/plan-ceo-review` — already done in plan file
- `/design-html` — v4 is already JSX

---

## 5. Critical files to read on next-session boot

In order:

1. **`docs/handoffs/2026-05-20-session-handoff.md`** (this file)
2. **`~/.claude/plans/read-the-file-users-familiagirardicavalc-cheerful-meerkat.md`** — Phase 2+3 parallel plan (locked decisions D1-D8, stages S0-S9)
3. **`CLAUDE.md`** — project rules, agent orchestration, swim-lane ownership
4. **`docs/superpowers/specs/2026-05-06-programa-familia-5-tab-surface.md`** — 525-line spec
5. **`docs/superpowers/plans/2026-05-06-programa-familia-phase2.md`** — 13 checkbox tasks for Phase 2
6. **`docs/superpowers/testing-strategy.md`** — pyramid + per-agent RED test list
7. **`client/src/features/mapa-tab/CODEMAP.md`** — file tree + dependency graph for the next Feature Agent

For server-mapa specifically:

8. **`server/routers/mapa.ts`** — current stub (S2 thin slice); expand to real aggregation
9. **`server/_core/rlsRedaction.ts`** — `redactHighRiskFields` to apply on every row crossing the wire
10. **`server/routers/families/compliance.ts`** — `getComplianceStats` to reuse (do NOT duplicate)

---

## 6. Git state when handoff begins

```bash
cd /Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo-schema-s0
git log --oneline main..HEAD
# 39425b4 fix(types+migration): align database.types.ts with local gen + capture announcements.deleted_at
# 6d4da24 fix(types): align database.types.ts CLI header artifacts
# 95532d6 fix(migrations): canonical capture of remaining prod-vs-repo drift (Kind B)
# dd264d5 fix(migrations): systemic role-stub expansion — add voluntario_role
# 5024570 fix(migrations): broaden EXCEPTION catch in _high_risk_fields_rls
# dfc5e47 fix(migrations): capture 10 missing programs columns from prod
# 606c78f fix(migrations): canonical capture of get_programs_with_counts + rls_auto_enable (task #11)
# 323e4ae fix(migrations): bridge admin_role + superadmin_role for fresh-DB starts
# b5120ae fix(migrations): tolerate missing functions in phase2_revoke (CI job 76848789956)
# 2c96cc5 feat(s3): client-persons-step3 — capture codigo_postal at registration
# 8555384 feat(s2): Karpathy thin vertical slice — Phase 2 toolchain proof
# 0fc9b31 feat(s1): M1 + M2 + M3 — Phase 2 schema (codigo_postal + distrito + report_saved_queries)
# f3498e3 docs(s0): testing-strategy + 4 feature codemaps (U9)
# 12b6610 test(s0): U7 drift-guard test — Madrid postal-code TS↔SQL parity
# 8cf3e89 feat(s0): micro-PR #0 — Phase 2+3 parallel-plan foundations
```

Branch tracks `origin/feat/schema-s0-micro-pr-0`. Push reports "No conflicts" — PR is mergeable.

PR URL (open if not already): https://github.com/leonardo-ccavalcante/bocatas_digital/pull/new/feat/schema-s0-micro-pr-0

---

## 7. Locked decisions (from plan file — preserve in next session)

| # | Decision | Status |
|---|---|---|
| **D1** | Worktrees-per-agent (`Bocatas_Digital-{agent-id}/` sibling of repo/) | Active; current worktree at `repo-schema-s0/` |
| **D2** | Hard gate: Phase 2 prod-green before Phase 3 code starts | Honored; Phase 3 not started |
| **D3** | `_core` is dedicated lane (Schema Agent extended scope) | Defers to S5 |
| **D4** | 300 LOC max per file (ESLint enforced) | Active; rule in `eslint.config.js` |
| **D5** | `/karpathy` lens — root causes over fastest paths | Active; cascade taught the policy update |
| **D6** | `/codemap` per feature is pre-coding gate | Active; 4 codemaps committed |
| **D7** | `/benchmark` per PR + ship gate | DEFERRED (task #3 pending) |
| **D8** | EIPD fully decoupled from dev | Active; no blocker on engineering |

---

## 8. Karpathy recipe — where we are

| Step | Status |
|---|---|
| 1. Become one with the data | ✅ Plan files + spec + bocatas-v4 read on session boot |
| 2. End-to-end skeleton + dumb baseline | ✅ S2 thin slice (`8555384`) |
| 3. Overfit one example | ⏸ **Next** — complete server-mapa fully before fan-out |
| 4. Regularize | ✅ 300 LOC + TDD + codemap parity active |
| 5. Tune | ⏸ Phase 4 — `/qa` per tab |
| 6. Squeeze out last drops | ⏸ Phase 6 — `/cso` + Lighthouse |

**Next session's stake in the ground:** Karpathy step 3 — server-mapa as the canary. Get it ALL the way to merge before opening any other agent's worktree.

---

## 9. One-line resume command for next session

```
Read docs/handoffs/2026-05-20-session-handoff.md then continue Phase 2+3 parallel-implementation plan starting from S3 server-mapa (Karpathy step 3 canary).
```

---

*End of handoff. Next session: read top-to-bottom, then resume work from §3 + §4.*
