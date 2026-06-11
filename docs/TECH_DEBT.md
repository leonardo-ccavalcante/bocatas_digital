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
| **C-02** | P1 | ✅ | **DB-layer high-risk RLS is non-functional → app-layer is the *only* boundary.** Migration `20260508000001_high_risk_fields_rls.sql` is a stub (`PENDING REVIEW — DO NOT APPLY`); its grant-target roles (`admin_role`/`superadmin_role`) are `NOLOGIN NOINHERIT` stubs no app user maps to; and the app reads via `service_role` which bypasses RLS + column REVOKEs entirely. So the entire high-risk control rests on `redactHighRiskFields` at the procedure boundary — which C-01 shows had a hole (now fixed). | `supabase/migrations/20260508000001*`, `20260508000000*` | ✅ **RESOLVED code-side** 2026-05-20b — systemic audit confirmed `getById` was the only `persons.select(*)` hole; added regression guard `persons-high-risk-readpath-guard.test.ts`; `security-model.md` corrected (migration is NOT a live wall). **Migration apply stays a staging-gated human decision** (its 4 preconditions are legit) — issue #50 narrowed to that. ⚠️ **2026-06-11 Mythos (TES-02, verified):** the `-- DO NOT APPLY` markers are *inert comments* — `supabase db reset` and CI apply the live DDL regardless, so the stub roles/REVOKEs DO land in local/CI. App-layer-only posture unchanged (service_role bypass), but the "won't apply" assumption is false. TES-10 (disputed, refuted by 1 Moira) re-states the NOLOGIN/NOINHERIT stub-role gap. |
| **C-03** | P1 | ✅→🔶 | **CSV formula injection.** `escapeCsvCell` does RFC-4180 quoting but does NOT neutralize formula triggers (`= + - @ \t \r`). Beneficiary-entered `nombre`/`apellidos` flow into funder-facing CSVs → executable formula on open in Excel/Sheets. | `client/src/features/reports-tab/utils/exportCsv.ts:29-35` | 🔁 **REOPENED server-side** 2026-06-11 Mythos (CAS-01, THE-02 — verified, confirmed). The 2026-05-20b fix landed **only in the client exporter** (`exportCsv.ts` `FORMULA_TRIGGERS`). The live GUF/funder server exporters are still raw: `csvExportWithMembers.ts:115`, `csvExport.ts:77`, `csvFamiliesWithMembers.ts:41` (all under `families.csvExport`, `adminProcedure`) serialize beneficiary `nombre`/`persona_recoge`/member names through `escapeCSVField` (RFC-4180 quoting, **no formula prefix**). Client fix confirmed good; server side never patched. CAS-08 (disputed) flags the XLSX import-preview path too. |
| **C-04** | P1 | ✅ | **CSV PII redaction silently void on nested rows.** `redactRow` only inspects top-level keys, but templated reports embed `persons:{nombre,apellidos,telefono}`. Nested PII is never redacted, and `String(nestedObj)` → `[object Object]`. The redaction *contract* is broken; `telefono` is fetched and shippable. | `exportCsv.ts:41-51` + `templated/{familiasEnRiesgo,familiasAtendidas,padronPorVencer,informesPorRenovar}.ts` | ✅ **FIXED** 2026-05-20b — `flattenRow` + leaf-level redaction + RED tests (note: `telefono` export is product question R-03-adjacent) |
| **C-05** | P1 | ✅→🔶 | **Raw DB error text crosses the wire** (contradicts the helper's own "NEVER includes PII" docstring). `wrapDbError` interpolates raw Supabase `error.message`; `persons.getById:157` and `mapa.ts:127-131` do the same. Supabase constraint errors can echo column values + schema internals to the client. | `server/routers/reports/_shared.ts:59`; `persons/crud.ts:157`; `mapa.ts:127-131` | 🔁 **REOPENED — systemic** 2026-06-11 Mythos (THE-01, SIS-02, CAS-03 — verified, confirmed; ARG-12 — verified). The 2026-05-20b fix patched only the **3 listed sites**; raw `error.message` still crosses the wire in **~20–26 other routers**: `families/_shared.ts:218`, `entregas/crud.ts:53,81,125,167,189`, `checkin.ts:187,229`, `dashboard.ts:80`, `admin.ts:42,112`, et al. Constraint errors can echo column VALUES (incl. Art.9 narrative). Original 3 sites confirmed still fixed. **The "unify into a `_core` helper" future-debt note is now the actual fix** — route all sites through `wrapDbError`. |
| **C-06** | P1 | ✅ | **Mapa choropleth is color-only + false a11y claim.** Encodes density/compliance by fill color only; the header comment claims keyboard-accessible polygons via `aria-label` but none is ever set (only mouse `bindTooltip`). Keyboard + screen-reader users get zero access. Violates the non-negotiable WCAG 2.1 AA bar + "no color-only signal." | `client/src/features/mapa-tab/MapaChoropleth.tsx:107-197` | ✅ **FIXED** 2026-05-20b — added `DistritoDataTable` (always-rendered accessible table: values as TEXT, keyboard-actionable per distrito) + visible legend; removed false comment. 6 RED→GREEN a11y tests. ✅ **RE-CONFIRMED FIXED** 2026-06-11 Mythos (IRI-01, verified) — `DistritoDataTable` renders always, false comment gone. NB: a *residual* choropleth focus-ring gap is filed as a new finding IRI-11 (P2), distinct from this original. |

> **C-03 + C-04** share one fix (one `exportCsv` hardening pass). **C-05** is one `wrapDbError` change that also clears B-tier UI-error leakage. **C-01** is a one-line `redactHighRiskFields` call. These four edits clear most of the compliance-critical surface.

---

## 1. Test suite & CI (the "23 failures" explained)

**Root-cause verdict (Agent A):** the failing-test count is **environment-dependent** — ~23 in a bare local run, **~48 under CI's placeholder env** (`ci.yml` sets 4 placeholder Supabase vars pointing at `http://localhost` with no live DB). **47 of 48 are environment artifacts** (no live Supabase → `fetch failed`), and would pass against a real test DB. The "19 tests predate / fail in CI" note in `testing-strategy.md` is **inverted** — those 19 `bocatas.test.ts` env-assertions actually PASS under CI placeholders.

| ID | Sev | ✓ | Title | Location | Status |
|----|-----|---|-------|----------|--------|
| **T-01** | P2 | ✅ | **CI runs integration tests with no live DB** (placeholder `http://localhost`, no `services: postgres`, no `supabase start`). ~41 tests can never pass in CI. Either wire an ephemeral Postgres/Supabase into the test job, or gate all DB tests behind a consistent `skipIf(!hasLiveDb)` so CI is honestly green. | `.github/workflows/ci.yml:56-63` | ☐ **open — CONFIRMED** 2026-06-11 Mythos (DIO-04, verified): placeholder localhost stands; ~79 tests + 13 files self-skip invisibly in CI. |
| **T-02** | P2 | ✅ | **Migration-lint test vs. migration text mismatch (was the only non-env failures).** `rls-column-grants.migration.test.ts` regex expected literal `GRANT SELECT(...) ON public.persons TO admin_role`, but the migration refactored grants into a dynamic `DO $$ EXECUTE format('GRANT…%I…')` loop, so the literal never matched. Not "absent grants" — a stale assertion. | `server/__tests__/rls-column-grants.migration.test.ts` | ✅ **FIXED** 2026-05-20b — 4 GRANT assertions rewritten to match the `format()`-loop form (template + role/table arrays + EXCEPTION catch). **Full-suite failures dropped 23→19** (now purely the env baseline). |
| **T-03** | P3 | 🔶→✅ | **CI env incomplete:** `confirm-legacy-import-rpc.test.ts` needs `SUPABASE_JWT_SECRET`, absent from ci.yml's 4 placeholders → errors at suite load regardless of DB. | `ci.yml` env block | ✅ **STALE → effectively resolved** 2026-06-11 Mythos (DIO-16, verified): the test now self-skips cleanly on missing `JWT_SECRET` (no suite-load error). No CI action needed; symptom gone. |
| **T-04** | P3 | 🔶 | **Flaky timeout:** `soft-delete-recovery.test.ts` fails via 5000ms vitest timeout (Supabase client retries dead host) rather than failing fast — order/boundary-sensitive. | `server/__tests__/soft-delete-recovery.test.ts` | ☐ **open — likely stale** 2026-06-11 Mythos (diogenes coverage, not separately filed): skip hygiene broadly adopted; re-verify under live-DB run. |
| **T-05** | P3 | 🔶 | **Inconsistent skip hygiene:** `soft-delete-cascade` + `families-getbyid` hard-fail (ungated `beforeAll` live insert) instead of `skipIf`; `families-export.integration.test.ts` is hard-`.skip` (never runs even with a DB) → Phase 2 export regressions go uncaught. | those test files | ☐ **open — PARTIAL** 2026-06-11 Mythos: cascade + slug paths now honest-gated (DIO-17, verified), BUT `families-export.integration.test.ts` is still hard `it.skip` → 4 export tests never run even with a DB (DIO-12, verified, P2). |
| **T-06** | P2 | ✅ | **30 hollow `// TODO: Verify…` assertions** — the mobile-responsiveness test file asserts nothing yet gates a Gate-1 LCP/mobile acceptance criterion (false green). | `client/src/features/responsiveness/__tests__/mobile-responsiveness.test.ts:50-222` | ☐ **open — CONFIRMED** 2026-06-11 Mythos (DIO-07, verified): 28 `expect(true).toBe(true)` still gate Gate-1 LCP/touch/a11y. (Repo-wide hollow-assert sweep found 42 such asserts; see new DIO-08 PhotoUploadInput.) |
| **T-07** | P3 | 📋 | `firma.audit.test.ts` — 4 `it.todo`: `delivery_signature_audit` write-path not yet wired in the router (genuine but tracked feature gap). | `server/__tests__/firma.audit.test.ts` | ☐ **open — PARTIALLY STALE** 2026-06-11 Mythos (DIO-17, verified): the `delivery_signature_audit` write-path IS now wired (`entregas/signature.ts:126`). Residual: that write is non-atomic w.r.t. the `firma_url` patch → ledger-gap on step-5 failure (new finding POS-05/ARG-09, P2). |

> **No Phase 2 file appears in any failure** — the reports/mapa code is exercised by passing tests. No new logic regressions from Phase 2/3.

---

## 2. Security & compliance (beyond the P1 headliners)

| ID | Sev | ✓ | Title | Location | Status |
|----|-----|---|-------|----------|--------|
| **S-01** | P2 | 🔶→✅ | **PII in logs on person-create failure:** `logProcedureError` receives `nombre` + `apellidos` in metadata — violates the no-PII-in-logs rule (the helper's own docstring forbids it). | `server/routers/persons/crud.ts:110-113` | ✅ **REFUTED / fixed** 2026-06-11 Mythos (SIS-20, verified; corroborated cassandra). `persons.create` `logProcedureError` now passes only `{validationWarnings}` (crud.ts:131) — no `nombre`/`apellidos`. No PII leak. Close. |
| **S-02** | P2 | 🔶→✅ | **Dormant PII-logging landmine:** global `createLoggingMiddleware` does `JSON.stringify(input).slice(0,200)` with `logInputs` defaulting true — would capture person-create PII. Currently unwired anywhere; latent if enabled. | `server/_core/logging-middleware.ts:38-45` | ✅ **REFUTED / mitigated** 2026-06-11 Mythos (SIS-21, verified; corroborated cassandra/themis). Middleware now pipes input through `redactLogValue` scrubber **and** is still unwired from the tRPC root → landmine inert. Risk much reduced; close (revisit only if wired). |
| **S-03** | P2 | 🔶→✅✗ | **PostgREST filter injection** in `persons.search` / `checkin`: user `input.query` interpolated into `.or(ilike.%…%)` with no metacharacter escaping (`,()*:`). Not raw SQLi (PostgREST parameterizes), but can alter filter logic. `checkin` uses the redacted `persons_safe` view (limited blast radius); `persons.search` hits raw `persons`. | `persons/crud.ts:202`, `checkin.ts:205` | ☐ **open — CONFIRMED + WIDER** 2026-06-11 Mythos (CAS-04, verified; same root in ARG-05). Still unescaped, and **4 sites** now: `persons/crud.ts:235`, `checkin.ts:251`, `families/crud.ts:70` (+ `customQuery/executor.ts:74`). No metachar escape of `% _ , ( ) :`. (ARG-14 adds a suspected left-join `.or()` correctness issue on `families.getAll`.) |
| **S-04** | P2 | ✅ | **`distribucionPorDistrito` report bypasses k-anonymity** — returns exact per-distrito counts incl. small buckets + `sin_asignar`, while the sibling `mapa.distritoStats` enforces floor=3 for the same data. CSV from its modal has no k-anon toggle → re-identification risk if shared externally. | `server/routers/reports/templated/distribucionPorDistrito.ts:44-55` | ☐ **open — CONFIRMED** 2026-06-11 Mythos (CAS-05, verified): k-anon floor still bypassed vs sibling `mapa.distritoStats`. |
| **S-05** | P3 | 🔶 | **EIPD data-minimization check:** confirm `notas_privadas`, `recorrido_migratorio`, `situacion_legal` are each enumerated in the EIPD register. `notas_privadas` is excluded from `persons_safe` but is NOT in `HIGH_RISK_FIELDS` — verify its RGPD classification. | `persons/crud.ts` intake; `server/_core/rlsRedaction.ts` | ☐ **open — UNVERIFIABLE in repo** 2026-06-11 Mythos (THE-06, verified-likely): `notas_privadas` confirmed NOT in `HIGH_RISK_FIELDS`; EIPD-register coverage is a legal-doc question outside the repo. Needs the RGPD register, not code. |

> **Verified clean (no action):** QR path (UUID + 8-hex sig, zero PII); `xlsx`/vulnerable-SheetJS absent from deps; consent verbal-translation fallback exists (`ConsentModal.tsx`); `families`/`reports`/`mapa` surfaces are correctly `adminProcedure`-guarded; all 6 prior SAT P2 items are genuinely implemented in code (not marked-done-but-not-done).

---

## 3. Phase 2 code-review findings (P2/P3 — Mapa + Reports)

| ID | Sev | ✓ | Title | Location | Status |
|----|-----|---|-------|----------|--------|
| **R-01** | P2 | 🔶→✅ | **Unbounded JS-aggregation queries** — `familiasEnRiesgo`/`distribucionPorDistrito`/`evolucionHistorica` have no `.limit()` (unlike customQuery). `estado:"all"` fetches every non-deleted family → memory/latency at scale. | `templated/{familiasEnRiesgo,distribucionPorDistrito,evolucionHistorica}.ts` | ☐ **open — CONFIRMED + WIDER** 2026-06-11 Mythos (ARG-06, ATL-09 — verified, confirmed). Still unbounded at `familiasEnRiesgo.ts:48`, `distribucionPorDistrito.ts:30`. ATL-04 (P1) extends this to `families.getAll` (no `.limit()`) **plus** `FamiliasList` rendering all rows with no virtualization — the full O(N) load path. |
| **R-02** | P2 | 🔶 | **`documentosFaltantes` correctness:** (a) fetches ALL active families, not scoped to `programaId`, so cross-programa families are flagged "missing"; (b) ignores `scope` (familia vs miembro); (c) unbatched `.in("family_id", …)` → PostgREST URL-length limit on large sets. | `templated/documentosFaltantes.ts:33-100` | ☐ **open — PARTIAL** 2026-06-11 Mythos (ARG-03, verified, confirmed): **(a) still open** — families fetched globally with no enrollment/programa filter (documentosFaltantes.ts:57), cross-programa families flagged missing. Per argos coverage, **(b) scope + (c) chunking are now FIXED** (`CHUNK_SIZE=100` + `Promise.all`). Remaining fix = (a) join `program_enrollments`. |
| **R-03** | P2 | 🔶 | **Date-math edges:** `informesPorRenovar`/`padronPorVencer` have no lower bound (long-expired rows still match "próximo a renovar"); `resumenTrimestral` mixes bare-date vs `T23:59:59Z` bounds; UTC `toISOString` can be off-by-one near Madrid midnight. Confirm intent with product. | `templated/{informesPorRenovar,padronPorVencer,resumenTrimestral}.ts` | ☐ **open — CONFIRMED** 2026-06-11 Mythos (ARG-07, verified-likely): bare-date vs timestamptz bound mismatch at `resumenTrimestral.ts:63`; renewal reports still have no lower bound. |
| **R-04** | P2 | 🔶 | **`contains` operator doesn't escape LIKE wildcards** `%`/`_` → user metacharacters silently act as wildcards (wrong results, not SQLi). | `server/routers/reports/customQuery/executor.ts:74-75` | ☐ **open — CONFIRMED** 2026-06-11 Mythos (ARG-05, verified, confirmed; shares root + fix with S-03/CAS-04). `executor.ts:74` still interpolates raw `%${value}%`. |
| **R-05** | P2 | 🔶 | **Exact total disclosure on capped rows:** non-grouped path returns `total: count("exact")` even when rows are `.limit()`-capped → UI shows precise population size the cap meant to bound. | `executor.ts:221` | ☐ **open — CONFIRMED** 2026-06-11 Mythos (ARG-08, verified, confirmed): `executor.ts:229` still returns exact full-table count on `.limit()`-capped rows. |
| **R-06** | P2 | 🔶→❌ | **Missing `enabled` gate:** `useMapaData` fires `distritoStats.useQuery` on mount regardless of tab visibility (verify parent lazy-mounts). | `client/src/features/mapa-tab/hooks/useMapaData.ts:19-20` | ❌ **REFUTED** 2026-06-11 Mythos (ATL-11, verified, confirmed; corroborated argos/sisyphus): `MapaTab` is `lazy()` AND conditionally rendered only when the mapa tab is active (Radix Tabs Presence lazy-mount, `ProgramTabs.tsx:110-114`); `useMapaData` has 5-min `staleTime`. No on-mount fire while hidden. Not a bug — close. |
| **R-07** | P3 | ✅ | **`spec_json: input.spec as any`** (no-`any` rule violation) — type the `report_saved_queries.spec_json` column as the DB `Json` type instead. | `customQuery/saved.ts:81` | ☐ open |
| **R-08** | P3 | 🔶 | CustomQueryBuilder builds at most ONE filter row though schema/executor support 10 (functional gap, not a bug). | `CustomQueryBuilder/index.tsx:75-77` | ☐ open |

---

## 4. Tech debt — Code / Architecture / Dependency / Documentation / Infra

Scored `Priority = (Impact+Risk)×(6−Effort)`. Sorted high→low.

| ID | Cat | ✓ | Pri | Title | Location | Status |
|----|-----|---|----:|-------|----------|--------|
| **D-01** | Code | 🔶 | 32 | **`(trpc.families as any)` ×~10 — types actually flow** (router wired in `routers.ts:39`, client imports `AppRouter`). Stale defensive casts; deletable today for immediate type-safety. | `ImportFamiliesModal`, `ExportFamiliesModal`, `DeliveryDocumentModal`, `MemberManagementModal` | ☐ **open — CONFIRMED** 2026-06-11 Mythos (SIS-16, verified, confirmed): `(trpc.families as any)` ×8 across the 4 modals; types still flow → safe to delete the casts. |
| **D-02** | Doc | ✅ | 30 | **CLAUDE.md §1 stale:** families router "1632 LOC, split planned (A.0a)" — **already split** (10 files, max 435). | `CLAUDE.md` §1, §4 | ☐ **open — CLAUDE.md drift re-confirmed** 2026-06-11 Mythos (SIS-05, verified, confirmed). Note: SIS-05 flags a *different* stale sentence — the `EXPORTED/` migration-layout claim in §1/§5 (the dir is gone; 124 flat migrations now). D-02's specific router-LOC line was not re-measured this run; both are the same "§1 is stale" debt. |
| **D-03** | Doc | ✅ | 25 | **CLAUDE.md stale:** announcements "1247-LOC router" — **already split** (6 files, max 271). | `CLAUDE.md` §1 | ☐ **open — see D-02** 2026-06-11 Mythos (SIS-05, verified): CLAUDE.md §1 staleness re-confirmed broadly; announcements-LOC line not separately re-measured. |
| **D-04** | Code | 🔶 | 24 | **Familias page `as any[]` / `(f: any)`** bypasses Zod end-to-end (violates "Zod single source of truth"). | `FamiliasInformesSociales.tsx`, `FamiliasVerificar.tsx`, `FamiliasEntregas.tsx` | ☐ **open — CONFIRMED** 2026-06-11 Mythos (SIS-17, verified, confirmed): `FamiliasInformesSociales` + `FamiliasEntregas` still use `(families as any[])` / `(f: any)`. |
| **D-05** | Infra | 🔶 | 24 | **knip misconfigured** — errors on `drizzle.config.ts` (`DATABASE_URL`) + misses lazy routes → 32 false "unused files" (flags live routed pages). Dead-code detection is currently blind. | `knip.json`, `drizzle.config.ts` | ☐ open |
| **D-06** | Arch | 🔶 | 21 | **`(program as any).volunteer_*` / `supabase as any` RPC** — DB columns + `get_programs_with_counts` RPC absent from generated types. Re-run `supabase gen types` (never hand-patch — per project rule). | `ProgramaDetalle.tsx:161,164,341`; `programs.ts:87,277,337` | ☐ open |
| **D-07** | Dep | ✅ | 20 | **`docxtemplater` + `pizzip` declared, zero code references** (grep-confirmed) — docx-generation that never landed. Safe to remove. | `package.json:59,75` | ❌ **REFUTED — DO NOT REMOVE** 2026-06-11 Mythos (ATL-12, SIS-03 — verified, confirmed). At HEAD `d3aff9e` both packages ARE actively used in server DOCX generation (the E1 Familia document feature landed after the 2026-05-20 grep). The original "zero references / safe to remove" disposition is stale and dangerous. Close as not-debt. |
| **D-08** | Arch | 🔶 | 18 | **`as unknown as never`** to satisfy Supabase JSONB insert typing — define typed insert payloads from generated types. | `announcements/bulk-import.ts:122`, `families/legacy-import.ts:275`, `announcements/crud.ts:155` | ☐ **open — related new finding** 2026-06-11 Mythos (TES-04, verified-likely, P1): `deliveries.registrado_por` shape is indeterminate (UUID-FK vs TEXT) so types can't catch a JWT-`sub` *text* write — the same "types papered over by casts" class. D-08's listed sites not separately re-verified. |
| **D-09** | Code | ✅ | 16 | **`error as unknown as Error`** in a PII-sensitive log helper — narrow with `instanceof Error`. | `families/_shared.ts:184` | ☐ open |
| **D-10** | Dep | 🔶 | 16 | **~24 packages minor/patch behind** (tRPC 11.6→11.17, TanStack Query 5.90→5.100, supabase-js 2.103→2.106). No majors, no known CVEs. tRPC bump most worthwhile. | `package.json` | ☐ open |
| **D-11** | Infra | 🔶 | 16 | **Dead-code tools not CI-gated** (`knip`/`ts-prune`/`depcheck` are devDeps but no scripts/CI wiring) — after D-05, add `pnpm knip` to CI. | `package.json` scripts | ☐ **open — CONFIRMED** 2026-06-11 Mythos (SIS-18, verified, confirmed): `knip`/`ts-prune`/`depcheck` still installed with no scripts or CI wiring. |
| **D-12** | Code | 🔶 | 15 | **`zodResolver(...) as any` ×4** (RHF + Zod-v4 typing lag) — a typed `zodResolver` wrapper kills all four. | `InviteStaffModal`, `ProgramForm`, `IntakeWizard`, `AdminNovedades` | ☐ open |
| **D-13** | Doc | 🔶 | 12 | **No single canonical plan doc** (CLAUDE.md admits Gate-2 tracked "in git history + active sprint conversation"). `docs/todo.md` + `docs/handoffs/` + dated execution docs fragment onboarding. | `docs/` | ☐ open |
| **D-14** | Code | 🔶 | 12 | Supabase nested-join results untyped (`(family as any).persons`, `rawMember as unknown as Member`). | `IdentityVerifier.tsx:69`, `MemberManagementModal.tsx:313` | ☐ open |
| **D-15** | Arch | 📋→🔶 | 8 | **12 prod files >300 effective LOC** on the ESLint `warn` allowlist with a "split when next touched" policy (worst: `csvLegacyFamiliasMapper.ts` 651). Healthy/tracked. | `eslint.config.js:90-111` | ☐ **open — PRECONDITION BROKEN** 2026-06-11 Mythos (SIS-01, verified, confirmed, **P1**): the allowlist is no longer "healthy" — **2 files now exceed `max-lines=300` as ERROR (not on the warn allowlist) and break `pnpm lint` on origin/main**, which (via the shared CI gate) reds every PR. 19 prod files >300 LOC total at HEAD. This is the §0/Memory "shared CI gate" landmine, live. (Related new: SIS-22 — `server/_core/**` fully excluded from ESLint, 4 large prod files evade all rules.) |
| **D-16** | Infra | 📋→🔶 | 0 | **PowerSync deferred** (offline = optimistic-local only) — Risk Assumption #5 unmitigated. Stress-test (disconnect → 20-30 check-ins → reconnect) BEFORE first real shift. | per CLAUDE.md §3/§7 | ☐ **open — concrete data-loss finding now exists** 2026-06-11 Mythos (POS-02, verified-likely, **P0**): the optimistic-local offline path is actively broken — `syncOfflineQueue` upsert cannot infer the **partial** `attendances` unique index (`42P10`), so the queue gets stuck and offline rows are dropped. Risk Assumption #5 is not just unmitigated, it has a confirmed failure mode (see also new POS-01/POS-03/POS-07). The PowerSync *deferral* decision stands, but offline correctness must be fixed regardless. |

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

---

## 2026-06-11 — Mythos audit (9 finders, SHA d3aff9e, triple check PASS)

> **Run.** 9 read-only finders (argos·bugs, cassandra·security, themis·RGPD, atlas·perf, poseidon·resilience, sisyphus·debt, theseus·data, iris·a11y, diogenes·test-truth) over the **whole repo** at audit SHA `d3aff9ee3f2fe1e6f1840106956e127999c11bed`. 0 finders failed, 0 caps applied (overflow noted for sisyphus/iris in the ledger). Mandatory triple check (Moiras cloto·MECE / laquesis·eng / atropos·SAT) **PASS**.
>
> **Counts.** **113 findings → 101 verified, 9 disputed, 3 refuted.** Split by cross-reference (over all 113): **41 carry a `known_ref`** to an existing TECH_DEBT/CLAUDE.md/issue item (Status columns above updated in place — 30 distinct existing items touched) and **72 are new**. Restricting to the **101 verified**: 39 re-verify a known item, **62 are new** (this section). By severity (all 113): 7×P0, 31×P1, 51×P2, 24×P3 — verified subset 7 / 28 / 45 / 21; the **new-verified subset tabled below is 6×P0, 14×P1, 29×P2, 13×P3 = 62**.
>
> **SHA note.** The audit ran on `d3aff9e`; **this PR branch is based on `37c1008`** (origin/main advanced 2 commits — `36c2d4b` merge + `37c1008` QR JWT_SECRET fix — during the run). Line numbers below are as observed at `d3aff9e`; re-confirm against `37c1008`/HEAD before fixing. Neither of the 2 intervening commits touches the files in the P0/P1 table.
>
> **Full ledger.** `findings.{json,md}` + coverage/handoffs live in **`docs/audits/mythos/` of the project root** (`/Users/.../Bocatas_Digital/docs/audits/mythos/`) — that path is **outside this git repo** (the repo root is `Bocatas_Digital/repo`), so the files are intentionally not part of this PR diff. This section is the in-repo cross-reference; the ledger is the source of record.
>
> **✓ column.** Per Mythos convention these are agent-reported, so **🔶** is used throughout — except a few measured by an executed command (atlas `pnpm build` byte-measurement; diogenes `gh api` branch-protection check), marked **✅**. `🔶` ≠ unverified — every row is `confirmed`/`likely` per a finder's file:line read; it means "no second confirming human read yet." `conf:` = the finder's own confidence (confirmed/likely/suspected).

### Verified P0 (blocks ship) — all 7 (6 new + POS-02, the concrete failure-mode under D-16)

> POS-02 carries `known_ref:D-16` (its Status is cross-referenced under D-16 above); it is repeated here so the P0 table is complete. The other 6 are new (empty `known_ref`).

| ID | Sev | ✓ | Title | Location | Status |
|----|-----|---|-------|----------|--------|
| **ATL-01** | P0 | ✅ | `/checkin` route script budget exceeded — **348KB gzip vs 300KB** gate (build-measured). | `client/src/pages/CheckIn.tsx:15` | ☐ Open |
| **ATL-02** | P0 | ✅ | **Lighthouse CI gate is `continue-on-error: true`** → budget/perf violations never block a PR (the bundle/LCP "enforcement" is theatre). | `.github/workflows/ci.yml:93` | ☐ Open |
| **POS-01** | P0 | 🔶 | `consents.upsert` **ON CONFLICT targets a unique constraint that does not exist** (`42P10`) — consent writes can fail/duplicate. | `server/routers/persons/consents.ts:104` | ☐ Open |
| **POS-02** | P0 | 🔶 | `syncOfflineQueue` upsert **can't infer the PARTIAL `attendances` unique index → `42P10`**, queue stuck, offline check-ins dropped. **(known item — xref D-16 above)** | `server/routers/checkin.ts` (sync path) | ☐ Open |
| **DIO-01** | P0 | ✅ | **`main` branch UNPROTECTED** — all 4 CI workflows are advisory, zero required checks (gh-api confirmed). | `.github/workflows/ci.yml:1` | ☐ Open |
| **DIO-02** | P0 | 🔶 | **`main` HEAD CI is RED yet code landed** — lint failure aborts the suite before tests run (xref D-15/SIS-01). | `.github/workflows/ci.yml:46` | ☐ Open |
| **DIO-03** | P0 | 🔶 | **Supabase Advisors security gate is a no-op** — skips on missing secret then exits 0 green (false assurance). | `.github/workflows/ci-supabase-advisors.yml:27` | ☐ Open |

### New verified P1 (fix-now) — 14

| ID | Sev | ✓ | Title | Location | Status |
|----|-----|---|-------|----------|--------|
| **ARG-02** | P1 | 🔶 | `syncOfflineQueue` discards `queuedAt`, pins server-flush date → **wrong `checked_in_date`** (cross-midnight flush corrupts funder counts). | `server/routers/checkin.ts:340` | ☐ Open |
| **ATL-03** | P1 | 🔶 | `persons.getAll` fetches **ALL persons with no `.limit()`** → O(N) admin page load (~4000 rows). | `server/routers/persons/crud.ts:203` | ☐ Open |
| **POS-03** | P1 | 🔶 | **Failed queued check-in is invisible to the volunteer** and silently stuck forever (no surfaced error). | `client/src/features/checkin/hooks/useCheckin.ts:169` | ☐ Open |
| **SIS-06** | P1 | 🔶 | CLAUDE.md §2/§3 reference **global agents/rules dirs that are missing** → `code-reviewer`/`security-reviewer`/`tdd-guide` unreachable as files (the PR review gate is operationally laquesis+cassandra). | `CLAUDE.md:99` | ☐ Open |
| **SIS-08** | P1 | 🔶 | CLAUDE.md §5 Risk#3 claims **"Lighthouse CI enforces budget" — false** (gate is `continue-on-error`; see ATL-02). | `CLAUDE.md:255` | ☐ Open |
| **TES-03** | P1 | 🔶 | Two "v2" `deliveries` supersede migrations use `CREATE TABLE IF NOT EXISTS` → **silent no-op, schema stays v1** (intent masked). | `supabase/migrations/20260504172506_create_deliveries_table.sql:6` | ☐ Open |
| **IRI-02** | P1 | 🔶 | `FamiliasList` table rows **suppress the visible focus ring** (`focus:outline-none`) — keyboard nav invisible (WCAG 2.4.7). | `client/src/features/familias-tab/FamiliasList.tsx:194` | ☐ Open |
| **IRI-03** | P1 | 🔶 | `DerivarList` + `InstitucionTypeahead` **suppress focus on keyboard-reachable items**. | `client/src/features/derivar/DerivarList.tsx:108` | ☐ Open |
| **IRI-04** | P1 | 🔶 | Registration wizard **`FieldError` not programmatically linked** to inputs (`aria-describedby`) — SR users miss validation errors. | `client/src/features/persons/components/RegistrationWizard/_shared.tsx:73` | ☐ Open |
| **IRI-05** | P1 | 🔶 | `ManualSearchModal` search results list **has no `aria-live` region** — the "Sin QR" fallback is opaque to screen readers (Gate-1 path). | `client/src/features/checkin/components/ManualSearchModal.tsx:76` | ☐ Open |
| **IRI-06** | P1 | 🔶 | **Non-Spanish consent text blocks lack `lang` attribute** (WCAG 3.1.2) — the one place multilingual text renders. | `.../RegistrationWizard/steps/Step7Consent.tsx:108` | ☐ Open |
| **IRI-08** | P1 | 🔶 | `ComplianceDashboard` StatCard warning: **`yellow-600` on `yellow-50` fails 3:1** non-text contrast. | `client/src/features/families/components/ComplianceDashboard.tsx:20` | ☐ Open |
| **DIO-06** | P1 | 🔶 | Lighthouse gate has been `continue-on-error` **5+ weeks**; the "auth scaffolding" excuse is now stale (companion to ATL-02). | `.github/workflows/ci.yml:102` | ☐ Open |
| **DIO-08** | P1 | 🔶 | `PhotoUploadInput.test.tsx` — **8 tests, 0 real assertions** (all `expect(true).toBe(true)`) → false-green coverage. | `client/src/components/__tests__/PhotoUploadInput.test.tsx:6` | ☐ Open |

### New verified P2 (fast-follow) — 29

| ID | Sev | ✓ | Title | Location | Status |
|----|-----|---|-------|----------|--------|
| **ARG-04** | P2 | 🔶 | `bulkMarkAttendance` skips `undo_log` → breaks subsequent `undoAttendance` audit trail. **[E5-contested path]** | `server/routers/families/rounds-closeout.ts:192` | ☐ Open |
| **ARG-09** | P2 | 🔶 | `recordSignature`: `firma_url` patched before audit insert; step-5 failure leaves a **signed delivery with no audit-ledger row** (xref T-07). | `server/routers/entregas/signature.ts:126` | ☐ Open |
| **CAS-06** | P2 | 🔶 | **Outbound family/announcement webhooks unsigned** → forgeable & replayable by anything that can reach the n8n endpoint. | `server/familyEvents.ts:121` | ☐ Open |
| **CAS-07** | P2 | 🔶 | `assign-reparto` edge function has **no in-handler auth** (currently unwired landmine; `conf:suspected`). **[E5-contested path]** | `supabase/functions/assign-reparto/index.ts:71` | ☐ Open |
| **ATL-05** | P2 | ✅ | i18n **eagerly loads 12 locale files** in the main entry chunk; only 4 are CLAUDE.md-required. | `client/src/lib/i18n.ts:6` | ☐ Open |
| **ATL-06** | P2 | ✅ | Main entry chunk **384KB raw / 117KB gzip**; no sub-splitting of route-agnostic heavy code. | `vite.config.ts:233` | ☐ Open |
| **ATL-07** | P2 | 🔶 | `persons.getAll` in Personas page **has no `staleTime`** → window-focus triggers full ~4000-row refetch. | `client/src/pages/Personas.tsx:71` | ☐ Open |
| **ATL-08** | P2 | ✅ | `leaflet`+`react-leaflet` **167KB chunk + 207KB GeoJSON** on mapa-tab first open. | `client/src/features/mapa-tab/index.tsx:25` | ☐ Open |
| **POS-04** | P2 | 🔶 | Realtime dashboard goes **stale-forever after 5 failed reconnects**; no catch-up on resubscribe. | `client/src/features/dashboard/hooks/useRealtimeAttendance.ts:65` | ☐ Open |
| **POS-06** | P2 | 🔶 | PWA `registerType:autoUpdate` makes the "Actualizar" toast **dead code**; updates apply silently mid-shift (`conf:likely`). | `vite.config.ts:155` | ☐ Open |
| **POS-07** | P2 | 🔶 | Offline flush `onError` **schedules no retry** → queue stuck until next online/length change (`conf:likely`; companion to POS-03). | `client/src/features/checkin/hooks/useCheckin.ts:175` | ☐ Open |
| **SIS-19** | P2 | 🔶 | **24 frontend-v4 TODO stubs in prod code** — UI components claim endpoints that do not exist. | `client/src/features/dashboard/components/SedesPerformanceTable.tsx:4` | ☐ Open |
| **SIS-22** | P2 | 🔶 | **`server/_core/**` entirely excluded from ESLint** — 4 large prod files evade all lint rules (xref D-15). | `eslint.config.js:25` | ☐ Open |
| **SIS-23** | P2 | 🔶 | `BUDGET.md` + `CONTEXT.md` live at **project root, not repo root** → CLAUDE.md links are broken. | `CLAUDE.md:351` | ☐ Open |
| **TES-06** | P2 | 🔶 | `EstadoFamiliaSchema` accepts `'suspendida'` but `families.estado` **CHECK is only `('activa','baja')`** → Zod↔SQL drift, insert can violate CHECK. | `client/src/features/families/schemas.ts:17` | ☐ Open |
| **TES-08** | P2 | 🔶 | CSV-import writes `relacion` straight from CSV **with no whitelist mapping** → `family_members` CHECK-violation risk. | `server/routers/families/csv-import.ts:224` | ☐ Open |
| **TES-09** | P2 | 🔶 | `ci-types-drift` gate depends on **missing `supabase/migrations/EXPORTED/`** — premise is stale (dir gone; xref D-02/SIS-05). | `.github/workflows/ci-types-drift.yml:41` | ☐ Open |
| **IRI-09** | P2 | 🔶 | `FamiliasList` + `PersonsTable` `<th>` elements **missing `scope` attribute**. | `client/src/features/familias-tab/FamiliasList.tsx:102` | ☐ Open |
| **IRI-11** | P2 | 🔶 | Mapa choropleth `MapContainer` has **`outline-none` with no visible focus replacement** (residual of C-06, now its own item). | `client/src/features/mapa-tab/MapaChoropleth.tsx:322` | ☐ Open |
| **IRI-13** | P2 | 🔶 | `PersonsTable` column headers **missing `scope='col'`** in admin/superadmin view. | `client/src/features/persons/components/PersonsTable.tsx:107` | ☐ Open |
| **IRI-14** | P2 | 🔶 | `RepartoPreview` Alert components carry status by **color only, no icon**. **[E5-contested path]** | `client/src/features/familias-reparto/components/RepartoPreview.tsx:113` | ☐ Open |
| **IRI-15** | P2 | 🔶 | `CloseoutScanner` warning dismiss button **lacks `type='button'`** (submit-in-form hazard). **[E5-contested path]** | `client/src/features/familias-reparto/components/CloseoutScanner.tsx:55` | ☐ Open |
| **IRI-17** | P2 | 🔶 | `MemberDocDots` status dots: **only hover `title` conveys document state** → touch devices (primary target) get nothing. | `client/src/features/familias-tab/MemberDocDots.tsx:78` | ☐ Open |
| **IRI-19** | P2 | 🔶 | **Missing skip-to-content link** for keyboard navigation across the full SPA. | `client/src/components/layout/AppShell.tsx:140` | ☐ Open |
| **IRI-21** | P2 | 🔶 | Inline QR scanner `<video>` element **has no accessible label** for screen readers. | `client/src/features/checkin/components/QRScanner.tsx:183` | ☐ Open |
| **DIO-09** | P2 | 🔶 | Coverage gate **non-binding** — threshold 25% vs actual 51% (26pt cushion); regressions invisible. | `vitest.config.ts:70` | ☐ Open |
| **DIO-10** | P2 | 🔶 | Coverage scope **excludes `lib/pages/components/store/hooks`** — the PostHog PII scrubber is unmeasured. | `vitest.config.ts:58` | ☐ Open |
| **DIO-11** | P2 | 🔶 | `rls-pii` + `dashboard.realtime` tests **gated on bespoke env vars CI never sets** → security tests are dead. | `server/__tests__/rls-pii.integration.test.ts:24` | ☐ Open |
| **DIO-18** | P2 | 🔶 | **Local `pnpm test` looks far greener than CI certifies** — 79 skips + Lighthouse/E2E absent (the false-green umbrella over T-01/DIO-04/DIO-08/DIO-11). | `vitest.config.ts:30` | ☐ Open |

### New verified P3 (nits) — 13

13 new P3 findings are recorded in the ledger and not tabled here: **ARG-10, ARG-11, ARG-13, ARG-14, ARG-15, THE-07, POS-08, POS-10, TES-12, IRI-23, IRI-25, DIO-14, DIO-15.** (Themes: unbatched/non-transactional reschedule loops, dead XState offline-queue state, webhook-targeting heuristics, Excel-serial date misparse, residual a11y nits, EIPD vendor-register coverage.) See `docs/audits/mythos/findings.md` (project root) for each.

### Disputed (9) and refuted (3) — for the record

> Recorded honestly per the atenea charter; **not** added as actionable items.

- **Disputed (9, refuted by 1 of 3 Moiras each):** CAS-08 (XLSX import-preview formula guard — xref C-03), TES-10 (NOLOGIN/NOINHERIT stub roles — xref C-02/issue#50), TES-11 (firmas-entregas bucket only created by a DO-NOT-APPLY migration), IRI-12, IRI-16, IRI-18, IRI-20, IRI-22, IRI-24 (a11y items the Moira judged duplicate/over-scoped or below the bar).
- **Refuted (3, refuted by ≥2 of 3 Moiras):** SIS-07 (`docs/agents/` "missing" — they resolve at **project root**, present), TES-05 (GUF CSV "UTF-8 mojibake" — encoding handled), IRI-07 (`KPICard` emerald-600 contrast — passes at the actual size). These are documented as NOT-bugs.

> **Backlog / waves.** This is the audit ledger. The prioritized SMART/MECE wave plan (formula scores, fixer routing, RED-test plans, E5-contested deferrals) is produced separately in the Mythos *plan* phase — see `docs/audits/mythos/plan.md` (project root) once written. Per CLAUDE.md §2, every re-verified-still-open known item above (T-*, S-*, R-*, D-*, C-*) re-enters that backlog alongside the 72 new findings.
