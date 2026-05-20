# Bocatas Digital — Tech Debt & Open Issues Tracker

> **Living document.** Tracks every known error, issue, and unresolved tech-debt item not yet fixed. Update the **Status** column as items are closed (link the fixing commit/PR). Generated 2026-05-20 by a 4-agent parallel audit (`/dispatching-parallel-agents`) applying `/systematic-debugging`, `/tech-debt`, and code-review + security-review lenses.
>
> **Scope of audit:** branch `feat/schema-s0-micro-pr-0` (Phase 2 shipped — Mapa + Reports). Covers the whole repo, not just Phase 2.
>
> **Scoring:** `Priority = (Impact + Risk) × (6 − Effort)`, each 1–5 (Effort inverted: lower = easier). Severity: **P0** blocks ship · **P1** fix-now · **P2** fast-follow · **P3** nit.
>
> **Verification:** ✅ = author read the code and confirmed · 🔶 = agent-reported, needs a confirming read · 📋 = known/intentional (tracked, not a bug).

---

## 0. Headline — fix these first (verified P1)

These are confirmed by reading the code, not just agent inference. All are **pre-existing** (not introduced by Phase 2) unless noted.

| ID | Sev | ✓ | Title | Location | Status |
|----|-----|---|-------|----------|--------|
| **C-01** | P1 | ✅ | **`persons.getById` leaks high-risk PII to voluntarios** — `protectedProcedure` + service-role + `.select("*")` + raw return, **no `redactHighRiskFields`**. Any authenticated voluntario receives `situacion_legal`, `recorrido_migratorio`, `foto_documento_url`, `notas_privadas`. The sibling `getAll` correctly role-gates columns; `families.getById` correctly redacts. Direct CLAUDE.md §3 violation. | `server/routers/persons/crud.ts:139-162` | ✅ **FIXED** 2026-05-20b — `redactHighRiskFields` + `notas_privadas` gate + RED test `persons.getById-redaction.test.ts` |
| **C-02** | P1 | ✅ | **DB-layer high-risk RLS is non-functional → app-layer is the *only* boundary.** Migration `20260508000001_high_risk_fields_rls.sql` is a stub (`PENDING REVIEW — DO NOT APPLY`); its grant-target roles (`admin_role`/`superadmin_role`) are `NOLOGIN NOINHERIT` stubs no app user maps to; and the app reads via `service_role` which bypasses RLS + column REVOKEs entirely. So the entire high-risk control rests on `redactHighRiskFields` at the procedure boundary — which C-01 shows had a hole (now fixed). | `supabase/migrations/20260508000001*`, `20260508000000*` | ✅ **RESOLVED code-side** 2026-05-20b — systemic audit confirmed `getById` was the only `persons.select(*)` hole; added regression guard `persons-high-risk-readpath-guard.test.ts`; `security-model.md` corrected (migration is NOT a live wall). **Migration apply stays a staging-gated human decision** (its 4 preconditions are legit) — issue #50 narrowed to that. |
| **C-03** | P1 | ✅ | **CSV formula injection.** `escapeCsvCell` does RFC-4180 quoting but does NOT neutralize formula triggers (`= + - @ \t \r`). Beneficiary-entered `nombre`/`apellidos` flow into funder-facing CSVs → executable formula on open in Excel/Sheets. | `client/src/features/reports-tab/utils/exportCsv.ts:29-35` | ✅ **FIXED** 2026-05-20b — string-only formula neutralization (negatives preserved) + RED tests |
| **C-04** | P1 | ✅ | **CSV PII redaction silently void on nested rows.** `redactRow` only inspects top-level keys, but templated reports embed `persons:{nombre,apellidos,telefono}`. Nested PII is never redacted, and `String(nestedObj)` → `[object Object]`. The redaction *contract* is broken; `telefono` is fetched and shippable. | `exportCsv.ts:41-51` + `templated/{familiasEnRiesgo,familiasAtendidas,padronPorVencer,informesPorRenovar}.ts` | ✅ **FIXED** 2026-05-20b — `flattenRow` + leaf-level redaction + RED tests (note: `telefono` export is product question R-03-adjacent) |
| **C-05** | P1 | ✅ | **Raw DB error text crosses the wire** (contradicts the helper's own "NEVER includes PII" docstring). `wrapDbError` interpolates raw Supabase `error.message`; `persons.getById:157` and `mapa.ts:127-131` do the same. Supabase constraint errors can echo column values + schema internals to the client. | `server/routers/reports/_shared.ts:59`; `persons/crud.ts:157`; `mapa.ts:127-131` | ✅ **FIXED** 2026-05-20b — generic client msg + correlationId; raw detail logged server-side only; RED tests. (Future debt: unify into a `_core` helper — 3 sites now.) |
| **C-06** | P1 | ✅ | **Mapa choropleth is color-only + false a11y claim.** Encodes density/compliance by fill color only; the header comment claims keyboard-accessible polygons via `aria-label` but none is ever set (only mouse `bindTooltip`). Keyboard + screen-reader users get zero access. Violates the non-negotiable WCAG 2.1 AA bar + "no color-only signal." | `client/src/features/mapa-tab/MapaChoropleth.tsx:107-197` | ✅ **FIXED** 2026-05-20b — added `DistritoDataTable` (always-rendered accessible table: values as TEXT, keyboard-actionable per distrito) + visible legend; removed false comment. 6 RED→GREEN a11y tests. Bonus: tab is now usable before the canonical GeoJSON lands. |

> **C-03 + C-04** share one fix (one `exportCsv` hardening pass). **C-05** is one `wrapDbError` change that also clears B-tier UI-error leakage. **C-01** is a one-line `redactHighRiskFields` call. These four edits clear most of the compliance-critical surface.

---

## 1. Test suite & CI (the "23 failures" explained)

**Root-cause verdict (Agent A):** the failing-test count is **environment-dependent** — ~23 in a bare local run, **~48 under CI's placeholder env** (`ci.yml` sets 4 placeholder Supabase vars pointing at `http://localhost` with no live DB). **47 of 48 are environment artifacts** (no live Supabase → `fetch failed`), and would pass against a real test DB. The "19 tests predate / fail in CI" note in `testing-strategy.md` is **inverted** — those 19 `bocatas.test.ts` env-assertions actually PASS under CI placeholders.

| ID | Sev | ✓ | Title | Location | Status |
|----|-----|---|-------|----------|--------|
| **T-01** | P2 | ✅ | **CI runs integration tests with no live DB** (placeholder `http://localhost`, no `services: postgres`, no `supabase start`). ~41 tests can never pass in CI. Either wire an ephemeral Postgres/Supabase into the test job, or gate all DB tests behind a consistent `skipIf(!hasLiveDb)` so CI is honestly green. | `.github/workflows/ci.yml:56-63` | ☐ open |
| **T-02** | P2 | ✅ | **Migration-lint test vs. migration text mismatch (was the only non-env failures).** `rls-column-grants.migration.test.ts` regex expected literal `GRANT SELECT(...) ON public.persons TO admin_role`, but the migration refactored grants into a dynamic `DO $$ EXECUTE format('GRANT…%I…')` loop, so the literal never matched. Not "absent grants" — a stale assertion. | `server/__tests__/rls-column-grants.migration.test.ts` | ✅ **FIXED** 2026-05-20b — 4 GRANT assertions rewritten to match the `format()`-loop form (template + role/table arrays + EXCEPTION catch). **Full-suite failures dropped 23→19** (now purely the env baseline). |
| **T-03** | P3 | 🔶 | **CI env incomplete:** `confirm-legacy-import-rpc.test.ts` needs `SUPABASE_JWT_SECRET`, absent from ci.yml's 4 placeholders → errors at suite load regardless of DB. | `ci.yml` env block | ☐ open |
| **T-04** | P3 | 🔶 | **Flaky timeout:** `soft-delete-recovery.test.ts` fails via 5000ms vitest timeout (Supabase client retries dead host) rather than failing fast — order/boundary-sensitive. | `server/__tests__/soft-delete-recovery.test.ts` | ☐ open |
| **T-05** | P3 | 🔶 | **Inconsistent skip hygiene:** `soft-delete-cascade` + `families-getbyid` hard-fail (ungated `beforeAll` live insert) instead of `skipIf`; `families-export.integration.test.ts` is hard-`.skip` (never runs even with a DB) → Phase 2 export regressions go uncaught. | those test files | ☐ open |
| **T-06** | P2 | ✅ | **30 hollow `// TODO: Verify…` assertions** — the mobile-responsiveness test file asserts nothing yet gates a Gate-1 LCP/mobile acceptance criterion (false green). | `client/src/features/responsiveness/__tests__/mobile-responsiveness.test.ts:50-222` | ☐ open |
| **T-07** | P3 | 📋 | `firma.audit.test.ts` — 4 `it.todo`: `delivery_signature_audit` write-path not yet wired in the router (genuine but tracked feature gap). | `server/__tests__/firma.audit.test.ts` | ☐ open |

> **No Phase 2 file appears in any failure** — the reports/mapa code is exercised by passing tests. No new logic regressions from Phase 2/3.

---

## 2. Security & compliance (beyond the P1 headliners)

| ID | Sev | ✓ | Title | Location | Status |
|----|-----|---|-------|----------|--------|
| **S-01** | P2 | 🔶 | **PII in logs on person-create failure:** `logProcedureError` receives `nombre` + `apellidos` in metadata — violates the no-PII-in-logs rule (the helper's own docstring forbids it). | `server/routers/persons/crud.ts:110-113` | ☐ open |
| **S-02** | P2 | 🔶 | **Dormant PII-logging landmine:** global `createLoggingMiddleware` does `JSON.stringify(input).slice(0,200)` with `logInputs` defaulting true — would capture person-create PII. Currently unwired anywhere; latent if enabled. | `server/_core/logging-middleware.ts:38-45` | ☐ open |
| **S-03** | P2 | 🔶 | **PostgREST filter injection** in `persons.search` / `checkin`: user `input.query` interpolated into `.or(ilike.%…%)` with no metacharacter escaping (`,()*:`). Not raw SQLi (PostgREST parameterizes), but can alter filter logic. `checkin` uses the redacted `persons_safe` view (limited blast radius); `persons.search` hits raw `persons`. | `persons/crud.ts:202`, `checkin.ts:205` | ☐ open |
| **S-04** | P2 | ✅ | **`distribucionPorDistrito` report bypasses k-anonymity** — returns exact per-distrito counts incl. small buckets + `sin_asignar`, while the sibling `mapa.distritoStats` enforces floor=3 for the same data. CSV from its modal has no k-anon toggle → re-identification risk if shared externally. | `server/routers/reports/templated/distribucionPorDistrito.ts:44-55` | ☐ open |
| **S-05** | P3 | 🔶 | **EIPD data-minimization check:** confirm `notas_privadas`, `recorrido_migratorio`, `situacion_legal` are each enumerated in the EIPD register. `notas_privadas` is excluded from `persons_safe` but is NOT in `HIGH_RISK_FIELDS` — verify its RGPD classification. | `persons/crud.ts` intake; `server/_core/rlsRedaction.ts` | ☐ open |

> **Verified clean (no action):** QR path (UUID + 8-hex sig, zero PII); `xlsx`/vulnerable-SheetJS absent from deps; consent verbal-translation fallback exists (`ConsentModal.tsx`); `families`/`reports`/`mapa` surfaces are correctly `adminProcedure`-guarded; all 6 prior SAT P2 items are genuinely implemented in code (not marked-done-but-not-done).

---

## 3. Phase 2 code-review findings (P2/P3 — Mapa + Reports)

| ID | Sev | ✓ | Title | Location | Status |
|----|-----|---|-------|----------|--------|
| **R-01** | P2 | 🔶 | **Unbounded JS-aggregation queries** — `familiasEnRiesgo`/`distribucionPorDistrito`/`evolucionHistorica` have no `.limit()` (unlike customQuery). `estado:"all"` fetches every non-deleted family → memory/latency at scale. | `templated/{familiasEnRiesgo,distribucionPorDistrito,evolucionHistorica}.ts` | ☐ open |
| **R-02** | P2 | 🔶 | **`documentosFaltantes` correctness:** (a) fetches ALL active families, not scoped to `programaId`, so cross-programa families are flagged "missing"; (b) ignores `scope` (familia vs miembro); (c) unbatched `.in("family_id", …)` → PostgREST URL-length limit on large sets. | `templated/documentosFaltantes.ts:33-100` | ☐ open |
| **R-03** | P2 | 🔶 | **Date-math edges:** `informesPorRenovar`/`padronPorVencer` have no lower bound (long-expired rows still match "próximo a renovar"); `resumenTrimestral` mixes bare-date vs `T23:59:59Z` bounds; UTC `toISOString` can be off-by-one near Madrid midnight. Confirm intent with product. | `templated/{informesPorRenovar,padronPorVencer,resumenTrimestral}.ts` | ☐ open |
| **R-04** | P2 | 🔶 | **`contains` operator doesn't escape LIKE wildcards** `%`/`_` → user metacharacters silently act as wildcards (wrong results, not SQLi). | `server/routers/reports/customQuery/executor.ts:74-75` | ☐ open |
| **R-05** | P2 | 🔶 | **Exact total disclosure on capped rows:** non-grouped path returns `total: count("exact")` even when rows are `.limit()`-capped → UI shows precise population size the cap meant to bound. | `executor.ts:221` | ☐ open |
| **R-06** | P2 | 🔶 | **Missing `enabled` gate:** `useMapaData` fires `distritoStats.useQuery` on mount regardless of tab visibility (verify parent lazy-mounts). | `client/src/features/mapa-tab/hooks/useMapaData.ts:19-20` | ☐ open |
| **R-07** | P3 | ✅ | **`spec_json: input.spec as any`** (no-`any` rule violation) — type the `report_saved_queries.spec_json` column as the DB `Json` type instead. | `customQuery/saved.ts:81` | ☐ open |
| **R-08** | P3 | 🔶 | CustomQueryBuilder builds at most ONE filter row though schema/executor support 10 (functional gap, not a bug). | `CustomQueryBuilder/index.tsx:75-77` | ☐ open |

---

## 4. Tech debt — Code / Architecture / Dependency / Documentation / Infra

Scored `Priority = (Impact+Risk)×(6−Effort)`. Sorted high→low.

| ID | Cat | ✓ | Pri | Title | Location | Status |
|----|-----|---|----:|-------|----------|--------|
| **D-01** | Code | 🔶 | 32 | **`(trpc.families as any)` ×~10 — types actually flow** (router wired in `routers.ts:39`, client imports `AppRouter`). Stale defensive casts; deletable today for immediate type-safety. | `ImportFamiliesModal`, `ExportFamiliesModal`, `DeliveryDocumentModal`, `MemberManagementModal` | ☐ open |
| **D-02** | Doc | ✅ | 30 | **CLAUDE.md §1 stale:** families router "1632 LOC, split planned (A.0a)" — **already split** (10 files, max 435). | `CLAUDE.md` §1, §4 | ☐ open |
| **D-03** | Doc | ✅ | 25 | **CLAUDE.md stale:** announcements "1247-LOC router" — **already split** (6 files, max 271). | `CLAUDE.md` §1 | ☐ open |
| **D-04** | Code | 🔶 | 24 | **Familias page `as any[]` / `(f: any)`** bypasses Zod end-to-end (violates "Zod single source of truth"). | `FamiliasInformesSociales.tsx`, `FamiliasVerificar.tsx`, `FamiliasEntregas.tsx` | ☐ open |
| **D-05** | Infra | 🔶 | 24 | **knip misconfigured** — errors on `drizzle.config.ts` (`DATABASE_URL`) + misses lazy routes → 32 false "unused files" (flags live routed pages). Dead-code detection is currently blind. | `knip.json`, `drizzle.config.ts` | ☐ open |
| **D-06** | Arch | 🔶 | 21 | **`(program as any).volunteer_*` / `supabase as any` RPC** — DB columns + `get_programs_with_counts` RPC absent from generated types. Re-run `supabase gen types` (never hand-patch — per project rule). | `ProgramaDetalle.tsx:161,164,341`; `programs.ts:87,277,337` | ☐ open |
| **D-07** | Dep | ✅ | 20 | **`docxtemplater` + `pizzip` declared, zero code references** (grep-confirmed) — docx-generation that never landed. Safe to remove. | `package.json:59,75` | ☐ open |
| **D-08** | Arch | 🔶 | 18 | **`as unknown as never`** to satisfy Supabase JSONB insert typing — define typed insert payloads from generated types. | `announcements/bulk-import.ts:122`, `families/legacy-import.ts:275`, `announcements/crud.ts:155` | ☐ open |
| **D-09** | Code | ✅ | 16 | **`error as unknown as Error`** in a PII-sensitive log helper — narrow with `instanceof Error`. | `families/_shared.ts:184` | ☐ open |
| **D-10** | Dep | 🔶 | 16 | **~24 packages minor/patch behind** (tRPC 11.6→11.17, TanStack Query 5.90→5.100, supabase-js 2.103→2.106). No majors, no known CVEs. tRPC bump most worthwhile. | `package.json` | ☐ open |
| **D-11** | Infra | 🔶 | 16 | **Dead-code tools not CI-gated** (`knip`/`ts-prune`/`depcheck` are devDeps but no scripts/CI wiring) — after D-05, add `pnpm knip` to CI. | `package.json` scripts | ☐ open |
| **D-12** | Code | 🔶 | 15 | **`zodResolver(...) as any` ×4** (RHF + Zod-v4 typing lag) — a typed `zodResolver` wrapper kills all four. | `InviteStaffModal`, `ProgramForm`, `IntakeWizard`, `AdminNovedades` | ☐ open |
| **D-13** | Doc | 🔶 | 12 | **No single canonical plan doc** (CLAUDE.md admits Gate-2 tracked "in git history + active sprint conversation"). `docs/todo.md` + `docs/handoffs/` + dated execution docs fragment onboarding. | `docs/` | ☐ open |
| **D-14** | Code | 🔶 | 12 | Supabase nested-join results untyped (`(family as any).persons`, `rawMember as unknown as Member`). | `IdentityVerifier.tsx:69`, `MemberManagementModal.tsx:313` | ☐ open |
| **D-15** | Arch | 📋 | 8 | **12 prod files >300 effective LOC** on the ESLint `warn` allowlist with a "split when next touched" policy (worst: `csvLegacyFamiliasMapper.ts` 651). Healthy/tracked. | `eslint.config.js:90-111` | ☐ open |
| **D-16** | Infra | 📋 | 0 | **PowerSync deferred** (offline = optimistic-local only) — Risk Assumption #5 unmitigated. Stress-test (disconnect → 20-30 check-ins → reconnect) BEFORE first real shift. | per CLAUDE.md §3/§7 | ☐ open |

> **Tool-trust caveats:** ESLint `max-lines` is well-governed (error@300, tests exempt, 12-file `warn` allowlist with policy). `knip`/`ts-prune` are **unreliable here** until D-05 — treat their counts as noise; only depcheck's D-07 is grep-confirmed. Raw type-escape counts: **133 total (58 prod / 75 test)**; **129 eslint-disable** (~110 `no-explicit-any`); **44 TODO/FIXME** (~30 are the T-06 stubs).

---

## 5. Recommended remediation order

1. **C-01** (one-line redaction call) → close the verified voluntario PII leak.
2. **C-03 + C-04** (one `exportCsv` hardening pass) → formula injection + nested redaction.
3. **C-05** (one `wrapDbError` change, cascades to UI leakage) → stop raw DB errors on the wire.
4. **C-02** (decide: finish+apply the high-risk RLS migration with real roles, or delete it and document app-layer-only) → resolves T-02 too.
5. **C-06** (accessible data table + legend for the choropleth) → WCAG bar.
6. **S-01/S-03/S-04** + **R-01/R-02/R-03** → the compliance + correctness fast-follow batch.
7. **D-01 + D-04 + D-06** (the tRPC/Supabase `as any` boundary) → biggest type-safety win for least effort; **D-02/D-03** doc fixes alongside.
8. **T-01** (CI gets a real test DB) → unblocks honest green + makes everything above test-covered.

---

## 6. How to use this doc

- Closing an item: flip `☐ open` → `✅ done (commit <sha> / PR #<n>)`.
- New findings: append with the next ID in the relevant section + score it.
- The audit that produced this is reproducible: 4 parallel read-only agents (test root-cause, tech-debt inventory, Phase 2 code review, security/compliance) — re-run after each major phase.
- `✅`-verified items are safe to action immediately; `🔶` items warrant a confirming read first; `📋` items are intentional/tracked.
