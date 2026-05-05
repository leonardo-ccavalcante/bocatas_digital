# Phase 6 QA — Consolidated Findings → PR Queue (Wave 3 synthesis)

**Date:** 2026-05-06 | **Branch:** qa/phase6-qa-0 | **Synthesizer:** main session
**Sources:** W1-types.md, W1-sec.md, W1-test.md, W2-fe.md, W2-be.md (all under `docs/superpowers/findings/`)
**Total findings:** 30 (renumbered globally below)

---

## Severity counts

| Severity | Count | Notes |
|---|---|---|
| **CRITICAL** | **4** | F-01 QR PII · F-02 openId/UUID · F-05 RLS bypass on situacion_legal · F-07 Spanish consent missing |
| **+ Special** | 1 | F-03 EIPD doc — out-of-code (legal escalation) |
| HIGH | 9 | bundle, perf, a11y, type-safety, missing tests |
| MEDIUM | 11 | type comments, perf tuning, MEDIUM a11y |
| LOW | 5 | console.log wrapper, minor a11y, contrast |
| **Already RESOLVED** | 1 | F-00 TS1501 (QA-0 done) |

Pre-flight count corrections (versus draft plan):
- Server `throw new Error/...` raw throws: plan said 2 → **actual 0** (test-file false positive). QA-4 scope shrinks to "catch narrowing".
- Empty `catch {}` blocks: plan said 0 → **confirmed 0**.
- `eslint-disable`: plan said 13 → **actual 48** (mostly Supabase adapter escapes). QA-2 scope grows.
- Alt-less `<img>`: plan said 14 → **confirmed 14** (W2-fe agent missed 13; main-session re-verified).

---

## Master finding table (renumbered F-001..)

### CRITICAL (production-blocking)

| ID | Title | File:Line | PR | Source |
|---|---|---|---|---|
| **F-001** | QR code embeds PII (nombre, apellidos in JSON payload) | `client/src/features/persons/components/QRCodeCard.tsx:19-24` | **QA-1** | pre-flight + W1-sec |
| **F-002** | QR scanner / generator format mismatch + latent bug (openId vs UUID) | `client/src/pages/MiQR.tsx:27`, `client/src/features/checkin/machine/checkinMachine.ts:172` | **QA-1** | pre-flight + W1-sec |
| **F-003** | RLS bypass: `situacion_legal` exposed to all authenticated users | `server/routers/persons/crud.ts:144` | **QA-1** | W1-sec F-05 |
| **F-004** | Consent templates missing Spanish (es) seed | `supabase/migrations/EXPORTED/20260413121730_…seed_consent_templates_bda.sql` | **QA-1** | W1-sec F-07 |
| **F-005** | N+1 batch insert in `syncOfflineQueue` (50–250ms hangs) | `server/routers/checkin.ts:281-294` | **QA-7A** (CRITICAL prevents top-1%) | W2-be F-W2B-01 |
| **F-006** | EIPD legal doc absent or unverified | `docs/legal/EIPD*` (missing) | **QA-8 — escalation, not code** | pre-flight + W1-sec F-03 |

### HIGH

| ID | Title | File:Line | PR | Source |
|---|---|---|---|---|
| **F-101** | Recharts vendor chunk 103.62KB gz exceeds 100KB route budget | `package.json` recharts; consumed by `client/src/pages/Dashboard.tsx` | **QA-7B** | W1-sec F-04 + W2-fe F-W2F-01 |
| **F-102** | Initial JS 198KB gz > 180KB top-1% target | `dist/public/assets/index-*.js` + `vendor-charts-*.js` | **QA-7B** | W2-fe F-W2F-02 |
| **F-103** | Unsafe `as unknown as` cast in CSV exports without comment (4 sites) | `server/csvExport.ts:114`, `server/csvExportWithMembers.ts:157,176,182` | **QA-2** | W1-types F-1 |
| **F-104** | Unsafe `as unknown as` cast in bulk-import preview without comment (3 sites) | `server/routers/announcements/bulk-import.ts:114,175,195` | **QA-2** | W1-types F-2 |
| **F-105** | Unsafe `as unknown as` cast in compliance reporting (2 sites) | `server/routers/families/compliance.ts:166,228` | **QA-2** | W1-types F-3 |
| **F-106** | 14 alt-less `<img>` elements (verified, not the 1 the agent claimed) | 14 sites in `client/src/`, see W2-fe F-W2G-01 | **QA-6** | W2-fe + main-session |
| **F-107** | Sequential awaits for program enrollment lookup (~20ms hot-path) | `server/routers/announcements/reads.ts:38-52, 138-150` | **QA-7A** | W2-be F-W2B-02 |
| **F-108** | Missing composite index `announcement_dismissals(person_id, announcement_id)` | migration TBD | **QA-7A** | W2-be F-W2B-03 |
| **F-109** | Missing composite index `families(estado, deleted_at)` | migration TBD | **QA-7A** | W2-be F-W2B-04 |
| **F-110** | Group A consent rejection has no test coverage | `server/__tests__/consents.test.ts` (missing) | **QA-9** | W1-test F-W1T-01 |
| **F-111** | RLS for `situacion_legal`/`foto_documento`/`recorrido_migratorio` has no explicit test | `server/__tests__/rls-pii.integration.test.ts` (extend) | **QA-9** | W1-test F-W1T-02 |

### MEDIUM

| ID | Title | File:Line | PR | Source |
|---|---|---|---|---|
| **F-201** | Direct `fetch()` to Forge API without token-format validation | `server/_core/dataApi.ts:31` | **QA-4** | W1-sec F-06 |
| **F-202** | Unsafe `setTimeout`/raf double-cast in QRScanner timer logic | `client/src/features/checkin/components/QRScanner.tsx:70,76` | **QA-2** | W1-types F-4 |
| **F-203** | 48 unexamined `eslint-disable @typescript-eslint/no-explicit-any` (server adapters) | `server/routers/**/*.ts` (48 sites) | **QA-2** (consolidate via typed Supabase wrapper) | W1-types F-5 |
| **F-204** | `Record<string, unknown>` pattern repeated across 8+ files without schema | `server/csvExport.ts:114`, `server/csvExportWithMembers.ts:157,176,182`, `server/routers/announcements/crud.ts:132`, `server/routers/families/crud.ts:298`, `server/routers/ocr.ts:205`, `client/src/pages/NovedadDetalle.tsx:111-112`, `client/src/pages/FamiliaDetalle/index.tsx:243` | **QA-2** | W1-types F-6 |
| **F-205** | 4 `eslint-disable react-hooks/exhaustive-deps` without comment | `client/src/features/dashboard/hooks/useRealtimeAttendance.ts:49`, `client/src/features/checkin/hooks/useCheckin.ts:141,158`, `client/src/features/checkin/components/QRScanner.tsx:71` | **QA-5** | W1-types F-8 |
| **F-206** | Decorative profile image — alt intent verification | `client/src/features/checkin/components/ManualSearchModal.tsx:85-89` | **QA-6** | W2-fe F-W2G-02 |
| **F-207** | tRPC `staleTime` not set on cacheable read endpoints | `client/src/features/persons/hooks/useDuplicateCheck.ts`, `client/src/features/dashboard/hooks/useTodayCount.ts`, others | **QA-7B** | W2-fe F-W2F-04 + W2-be F-W2B-05 |
| **F-208** | Bulk-import 10K row cap has no test | `server/routers/announcements/bulk-import.ts:43-48` | **QA-9** | W1-test F-W1T-03 |
| **F-209** | QR PII no-leak regression test missing | `server/__tests__/qr-no-pii.test.ts` (new) | **QA-1** (paired with F-001 fix) | W1-test F-W1T-04 |
| **F-210** | Catch blocks without `instanceof Error` narrowing (~25 sites) | server + client (catalog) | **QA-4** | W1-test F-W1T-07 |
| **F-211** | Wrong tRPC error code `INTERNAL_SERVER_ERROR` on user-input errors (sample) | various server routers | **QA-4** | spotted during synthesis |

### LOW

| ID | Title | File:Line | PR | Source |
|---|---|---|---|---|
| **F-301** | 10 client `console.*` calls — move to logger wrapper | `client/src/main.tsx:28,36`, plus 8 more | **QA-5** | W1-types F-7 |
| **F-302** | Clickable div without `role="button"` | `client/src/components/ExportFamiliesModal.tsx:86` | **QA-6** | W2-fe F-W2G-03 |
| **F-303** | Color contrast hint — `text-muted-foreground` on `bg-muted` may fail 4.5:1 | sample sites | **QA-6 (catalog only)** | W2-fe F-W2G-05 |
| **F-304** | Server console.* (38 sites) — verify per-line PII safety + move to logger | server-wide | **QA-5 / QA-9** | from pre-flight |

---

## §I — PR queue (final ordering)

| PR | Findings | Hard prerequisite | Time est |
|---|---|---|---|
| **QA-0** | F-00 (TS1501) | none — done | ~5 min ✓ |
| **QA-1** | **F-001, F-002, F-003, F-004, F-209** | none | ~3-4 hrs |
| **QA-2** | F-103, F-104, F-105, F-202, F-203, F-204 | none (parallel-safe with QA-1 result review) | ~2-3 hrs |
| **QA-3** | dead-code (knip/ts-prune/depcheck) | QA-2 done | ~1 hr |
| **QA-4** | F-201, F-210, F-211 | QA-1 done (so error-paths are stable) | ~1.5 hrs |
| **QA-5** | F-205, F-301, F-304 | none | ~1 hr |
| **QA-6** | F-106, F-206, F-302, F-303 | none | ~1.5 hrs (designer-judged for F-106) |
| **QA-7A** | F-005, F-107, F-108, F-109 | none | ~1 hr |
| **QA-7B** | F-101, F-102, F-207 | QA-7A done (indexes ready) | ~3-4 hrs |
| **QA-8** | F-006 (escalate to legal, not code) | n/a | 5 min code (note in CLAUDE.md or runbook) |
| **QA-9** | F-110, F-111, F-208 + new audit-no-pii-logs.test.ts (J.12) | parallel-safe in worktree | ~1.5 hrs |

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
