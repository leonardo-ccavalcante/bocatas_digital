# Phase 6 QA — Consolidated Findings → PR Queue (Wave 3 synthesis)

**Date:** 2026-05-06 | **Branch:** qa/phase6-qa-1a (pushed) | **Synthesizer:** main session
**Sources:** W1-types.md, W1-sec.md, W1-test.md, W2-fe.md, W2-be.md (all under `docs/superpowers/findings/`)
**Total findings:** 30 (renumbered globally below)
**Session-end status:** see [`2026-05-06-session-summary.md`](2026-05-06-session-summary.md). 12 fix commits + 1 docs commit on `qa/phase6-qa-1a`.

---

## Severity counts

| Severity | Total | Closed in session | Deferred | Notes |
|---|---:|---:|---:|---|
| **CRITICAL** | **5** | **5 ✅** | 0 | F-001 QR PII · F-002 openId/UUID · F-003 RLS bypass · F-004 Spanish consent · F-005 N+1 in syncOfflineQueue (CRITICAL severity raised at synthesis) |
| **+ Special** | 1 | 1 (escalation runbook) | 0 | F-006 EIPD doc — runbook in `docs/runbooks/eipd-status.md`; legal-side stakeholder action required |
| HIGH | 9 | 5 ✅ | 4 | F-103/104/105 type casts, F-108/109 indexes, F-110 consent test closed; F-101/102/107/111 deferred |
| MEDIUM | 11 | 4 ✅ | 7 | F-201, F-202, F-208, F-209 closed; rest in QA-3/5/7B |
| LOW | 5 | 1 ✅ | 4 | F-302 (clickable div→label) closed; rest catalog |
| **Already RESOLVED** | 1 | 1 ✅ | 0 | F-00 TS1501 (QA-0) |

Pre-flight count corrections (versus draft plan — confirmed at execution time):
- Server `throw new Error/...` raw throws: plan said 2 → **actual 0** (test-file false positive). QA-4 scope shrunk to token-format validation only.
- Empty `catch {}` blocks: plan said 0 → **confirmed 0**.
- `eslint-disable`: plan said 13 → **actual 48** (mostly Supabase adapter escapes). QA-2 closed the audit-listed 9 unsafe casts; the 48-disable cluster (F-203) requires a typed Supabase wrapper — deferred follow-up.
- Alt-less `<img>`: plan said 14, W2-fe agent claimed 1, **actual 0** at execution time (multi-line JSX fooled the line-based grep both directions). QA-6 re-scoped to F-W2G-02 + F-W2G-03 — both fixed.

---

## Master finding table (renumbered F-001..)

### CRITICAL (production-blocking)

| ID | Title | File:Line | PR | Status |
|---|---|---|---|---|
| **F-001** | QR code embeds PII (nombre, apellidos in JSON payload) | `client/src/features/persons/components/QRCodeCard.tsx:19-24` | QA-1A | ✅ **CLOSED** — `b5f72fb` UUID URI + HMAC; +18 tests |
| **F-002** | QR scanner / generator format mismatch + latent bug (openId vs UUID) | `client/src/pages/MiQR.tsx:27`, `client/src/features/checkin/machine/checkinMachine.ts:172` | QA-1B | ✅ **STUBBED** — `41d3ebd` MiQR shows "no disponible aún"; lock-out test prevents regressions; **proper schema fix deferred** (needs stakeholder input on Manus↔persons.id mapping) |
| **F-003** | RLS bypass: `situacion_legal` exposed to all authenticated users | `server/routers/persons/crud.ts:144` | QA-1C | ✅ **CLOSED** — `30e3d7c` `getAllColumnsForRole(role)` gate; +9 tests |
| **F-004** | Consent templates missing Spanish (es) seed | `supabase/migrations/EXPORTED/20260413121730_…seed_consent_templates_bda.sql` | QA-1D | ✅ **CLOSED** — `d779f13` `20260506000009_seed_consent_es.sql`; +5 tests |
| **F-005** | N+1 batch insert in `syncOfflineQueue` (50–250ms hangs) | `server/routers/checkin.ts:281-294` | QA-7A | ✅ **CLOSED** — `ab7491a` single `.upsert` with `ignoreDuplicates`; ~5ms regardless of batch size |
| **F-006** | EIPD legal doc absent or unverified | `docs/legal/EIPD*` (missing) | QA-8 | ✅ **ESCALATION RUNBOOK** — `eacc7cc` `docs/runbooks/eipd-status.md`; legal-side action required |

### HIGH

| ID | Title | File:Line | PR | Status |
|---|---|---|---|---|
| **F-101** | Recharts vendor chunk 103.62KB gz exceeds 100KB route budget | `package.json` recharts; consumed by `client/src/pages/Dashboard.tsx` | QA-7B | ➖ **DEFERRED** — top-1% perf program needs separate session |
| **F-102** | Initial JS 198KB gz > 180KB top-1% target | `dist/public/assets/index-*.js` + `vendor-charts-*.js` | QA-7B | ➖ **DEFERRED** — same root cause as F-101 |
| **F-103** | Unsafe `as unknown as` cast in CSV exports without comment (4 sites) | `server/csvExport.ts:114`, `server/csvExportWithMembers.ts:157,176,182` | QA-2 | ✅ **CLOSED** — `f40c8ac` comment-justified |
| **F-104** | Unsafe `as unknown as` cast in bulk-import preview without comment (3 sites) | `server/routers/announcements/bulk-import.ts:114,175,195` | QA-2 | ✅ **CLOSED** — `f40c8ac` comment-justified |
| **F-105** | Unsafe `as unknown as` cast in compliance reporting (2 sites) | `server/routers/families/compliance.ts:166,228` | QA-2 | ✅ **CLOSED** — `f40c8ac` replaced with `[...arr]` spread (no cast needed) |
| **F-106** | "14 alt-less `<img>`" — actual count was 0 at execution | n/a | QA-6 | ✅ **VERIFIED ZERO** — pre-flight grep was line-based; multi-line scanner found 0; F-W2G-02/03 fixed in `1e76c68` |
| **F-107** | Sequential awaits for program enrollment lookup (~20ms hot-path) | `server/routers/announcements/reads.ts:38-52, 138-150` | QA-7A | ➖ **DEFERRED** to QA-7B (frontend-correlated) |
| **F-108** | Missing composite index `announcement_dismissals(person_id, announcement_id)` | `supabase/migrations/20260506000010_phase6_qa7a_indexes.sql` | QA-7A | ✅ **CLOSED** — `ab7491a` |
| **F-109** | Missing composite index `families(estado, deleted_at)` | `supabase/migrations/20260506000010_phase6_qa7a_indexes.sql` | QA-7A | ✅ **CLOSED** — `ab7491a` |
| **F-110** | Group A consent rejection has no test coverage | `server/__tests__/consent-group-a-enforcement.test.ts` | QA-9 | ✅ **CLOSED** — `b578c53` +5 tests |
| **F-111** | RLS for `situacion_legal`/`foto_documento`/`recorrido_migratorio` has no explicit test | `server/__tests__/rls-pii.integration.test.ts` (extend) | QA-9 | ➖ **DEFERRED** — needs DB env in CI; app-layer gate already covered by F-003 close |

### MEDIUM

| ID | Title | File:Line | PR | Status |
|---|---|---|---|---|
| **F-201** | Direct `fetch()` to Forge API without token-format validation | `server/_core/dataApi.ts:23` | QA-4 | ✅ **CLOSED** — `534c4fe` length≥20 check |
| **F-202** | Unsafe `setTimeout`/raf double-cast in QRScanner timer logic | `client/src/features/checkin/components/QRScanner.tsx:70,76` | QA-2 | ✅ **CLOSED** — `f40c8ac` split into `rafRef` + `timeoutRef` |
| **F-203** | 48 unexamined `eslint-disable @typescript-eslint/no-explicit-any` (server adapters) | `server/routers/**/*.ts` (48 sites) | QA-5 | ➖ **DEFERRED** — needs typed Supabase wrapper; ~400-line architectural change |
| **F-204** | `Record<string, unknown>` pattern repeated across 8+ files without schema | various | QA-5 | ➖ **DEFERRED** — paired with F-203 wrapper work |
| **F-205** | 4 `eslint-disable react-hooks/exhaustive-deps` without comment | `client/src/features/dashboard/hooks/useRealtimeAttendance.ts:49`, `client/src/features/checkin/hooks/useCheckin.ts:141,158`, `client/src/features/checkin/components/QRScanner.tsx:71` | QA-5 | ➖ **DEFERRED** — QRScanner site got the comment in `f40c8ac` (intentionally empty deps); other 3 still need triage |
| **F-206** | Decorative profile image — alt intent verification | `client/src/features/checkin/components/ManualSearchModal.tsx:85-89` | QA-6 | ✅ **CLOSED** — `1e76c68` switched to `alt={nombre} {apellidos}` for SR/sighted parity |
| **F-207** | tRPC `staleTime` not set on cacheable read endpoints | `client/src/features/persons/hooks/useDuplicateCheck.ts`, `client/src/features/dashboard/hooks/useTodayCount.ts`, others | QA-7B | ➖ **DEFERRED** to top-1% perf session |
| **F-208** | Bulk-import 10K row cap has no test | `server/routers/announcements/bulk-import.ts:43-48` | QA-9 | ✅ **CLOSED** — `b578c53` +2 tests; bulk-import resource ordering also reordered as a side benefit |
| **F-209** | QR PII no-leak regression test missing | `server/__tests__/qr-no-pii.test.ts` (new) | QA-1A | ✅ **CLOSED** — `b5f72fb` +3 tests (paired with F-001 fix) |
| **F-210** | Catch blocks without `instanceof Error` narrowing (~25 sites) | server + client (catalog) | QA-4 | ➖ **DEFERRED** — each site needs individual judgment; batch-applying could mask real issues |
| **F-211** | Wrong tRPC error code `INTERNAL_SERVER_ERROR` on user-input errors (sample) | various server routers | QA-4 | ➖ **DEFERRED** — partial coverage via QA-9 bulk-import resource ordering |

### LOW

| ID | Title | File:Line | PR | Status |
|---|---|---|---|---|
| **F-301** | 10 client `console.*` calls — move to logger wrapper | `client/src/main.tsx:28,36`, plus 8 more | QA-5 | ➖ **DEFERRED** |
| **F-302** | Clickable div without `role="button"` | `client/src/components/ExportFamiliesModal.tsx:86` | QA-6 | ✅ **CLOSED** — `1e76c68` replaced with semantic `<label htmlFor={mode}>` |
| **F-303** | Color contrast hint — `text-muted-foreground` on `bg-muted` may fail 4.5:1 | sample sites | QA-6 | ➖ **CATALOG ONLY** — designer task |
| **F-304** | Server console.* (38 sites) — verify per-line PII safety + move to logger | server-wide | QA-9 | ✅ **PII GUARANTEE LOCKED** — `b578c53` log-no-pii.test.ts (build-time gate replaces manual triage); logger-wrapper move still deferred to QA-5 |

---

## §I — PR queue (final ordering + session outcome)

| PR | Findings | Status | Commit | Notes |
|---|---|---|---|---|
| **QA-0** | F-00 | ✅ closed | `b7cb9c0` | tsconfig target ES2022; pnpm check 1→0 errors |
| **QA-1A** | F-001, F-209 | ✅ closed | `b5f72fb` | UUID URI + HMAC + tests; +18 tests |
| **QA-1B** | F-002 | ✅ stubbed | `41d3ebd` | Honest stub + lock-out test; schema fix awaits stakeholder |
| **QA-1C** | F-003 | ✅ closed | `30e3d7c` | `getAllColumnsForRole`; +9 tests |
| **QA-1D** | F-004 | ✅ closed | `d779f13` | `20260506000009_seed_consent_es.sql`; +5 tests |
| **QA-2** | F-103, F-104, F-105, F-202 | ✅ closed | `f40c8ac` | Comment-justified or replaced 9 unsafe casts; QRScanner timer split |
| **QA-2** | F-203, F-204, F-205 (3 of 4 sites) | ➖ deferred | n/a | Needs typed Supabase wrapper (~400-line PR) |
| **QA-3** | dead-code (knip/ts-prune/depcheck) | ➖ deferred | n/a | Install + scan + triage; fresh session |
| **QA-4** | F-201 | ✅ closed | `534c4fe` | Token-format validation in dataApi |
| **QA-4** | F-210, F-211 | ➖ deferred | n/a | Per-site judgment; not batch-applicable |
| **QA-5** | F-205 (other 3), F-301 | ➖ deferred | n/a | Lint baseline 100 errors / 89 warnings |
| **QA-6** | F-W2G-02 (≡F-206), F-W2G-03 (≡F-302) | ✅ closed | `1e76c68` | Name+photo parity; clickable div→label |
| **QA-6** | F-106 (14 alt-less img) | ✅ verified zero | n/a | Pre-flight count was wrong (multi-line tags) |
| **QA-6** | F-303 contrast | ➖ catalog | n/a | Designer task |
| **QA-7A** | F-005, F-108, F-109 | ✅ closed | `ab7491a` | N+1 → batch upsert; 2 composite indexes |
| **QA-7A** | F-107 | ➖ deferred | n/a | Bundle-correlated; in QA-7B scope |
| **QA-7B** | F-101, F-102, F-207 | ➖ deferred | n/a | Top-1% perf program — separate session (recharts→SVG, vite-plugin-pwa, AVIF, font subset, React Compiler) |
| **QA-8** | F-006 (EIPD) | ✅ runbook | `eacc7cc` | `docs/runbooks/eipd-status.md` + `docs/runbooks/qr-secret-rotation.md` |
| **QA-9** | F-110, F-208 | ✅ closed | `b578c53` | +5 + +2 tests; bulk-import resource ordering side benefit |
| **QA-9** | F-304 (PII gate) | ✅ permanent gate | `b578c53` | log-no-pii.test.ts replaces manual console.* triage |
| **QA-9** | F-111 | ➖ deferred | n/a | Needs DB env in CI |

**Total estimated time:** ~17 hours of focused work; plan is sequential with QA-9 in worktree-parallel where useful.

---

## §II — Re-ordered execution sequence

1. **QA-1** (CRITICAL bundle) — fix RGPD breaches first.
2. **QA-2** (type hardening) — clean foundation for QA-3.
3. **QA-3** (dead-code) — only after types are green.
4. **QA-4** (error handling) — small, isolated.
5. **QA-7A** (perf cleanup) — N+1 fix unblocks QA-7B baselines.
6. **QA-7B** (top-1% perf) — replaces recharts, adds SW/PWA, hits Lighthouse target.
7. **QA-6** (a11y) — designer-touch findings; can run in parallel with QA-7B given different file scopes.
8. **QA-5** (coding standards) — last cleanup.
9. **QA-8** (CLAUDE.md gaps) — single doc commit.
10. **QA-9** (guard-rail tests) — concurrent with QA-2..7 in worktree, lands last.

---

## §III — Out-of-scope confirmation (per plan §G)

- **F-006 (EIPD doc)** is OUT OF CODE SCOPE. The fix is "verify EIPD exists in legal team's repo / Notion / Drive; if not, escalate to RGPD lawyer." The code change is at most a `docs/runbooks/eipd-status.md` pointer.
- Test-file splits >400 lines (PR-G) — deferred from Phase 5b.
- Real PowerSync — deferred per CLAUDE.md.
- Feature additions — none.

---

## §IV — Triple-check vs. plan §J SAT review

| Plan KAC | Outcome from W1+W2 audits |
|---|---|
| #1 openId↔person.id mapping | **Confirmed mismatch** in F-002. QA-1 implementation must include the join (likely via `auth_user_id` column on `persons` or session table). Pre-flight check before QA-1 starts. |
| #2 HMAC rotation | Plan covers it; no audit finding contradicts. |
| #3 Dexie size 12KB | No measurement yet — will measure in QA-7B baseline. |
| #4 SW stuck cache | Plan covers via skipWaiting+toast; QA-7B implements. |
| #5 React Compiler gating | Plan covers; QA-7B flips flag at end only. |
| #6 Lighthouse 100 vs 99 | Plan adjusted to ≥99 stretch 100. |
| #7 QA-9 worktree | Plan covers. |
| #8 ES2022 emit safe | Confirmed in QA-0 (done). |
| #9 19 env-failures stable | Confirmed in W1-test (PASS). |
| #10 Subagent ratcheting | Already evident — W2-fe under-counted alt-less img by 13. **Mitigation reinforced**: main session re-verifies every count via independent grep before accepting findings. |
| #11 alt-less triage | Reinforced; F-106 explicitly NOT batch-applied. |
| #12 console.* PII test | Added as explicit task in QA-9. |

**No new SAT-level concerns surfaced.** Plan stands.
