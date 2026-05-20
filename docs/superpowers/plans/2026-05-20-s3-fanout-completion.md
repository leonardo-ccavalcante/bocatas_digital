# S3 Fan-out Completion Plan

> Stage S3 of `~/.claude/plans/read-the-file-users-familiagirardicavalc-cheerful-meerkat.md`.
> server-mapa canary merged ([4b98344](.)). This plan covers the remaining 3 Feature Agents needed before S4 ship gate.
>
> **Date:** 2026-05-20 · **Branch:** `feat/schema-s0-micro-pr-0` · **Worktree:** `/repo-schema-s0/`

---

## 1. Scope

Three Feature Agents, dispatched via `/subagent-driven-development`:

| Agent | Source-plan tasks | Files | Depends on |
|---|---|---|---|
| **server-reports** | Phase 2 tasks #9, #10, #11 | `shared/reports/*.ts`, `server/routers/reports/{index,customQuery/{executor,allowlist,saved},templated/<9>}.ts` | M3 (`report_saved_queries` table) — already merged |
| **client-mapa** | Phase 2 task #8 | `client/src/features/mapa-tab/{index,MapaChoropleth,LayerToggle,DistritoPanel,hooks/useMapaData,utils/geojsonNormalize}.tsx` | server-mapa merged ✓ |
| **client-reports** | Phase 2 task #12 | `client/src/features/reports-tab/{index,TemplatesGrid,CustomQueryBuilder/<5>,SavedQueriesList,templates/<9>,utils/exportCsv}.tsx` | server-reports merged |

Phase 3 (S5-S8) is **out of scope** — gated by D2 hard gate (Phase 2 prod-green before Phase 3 code).
S4 ship gate (`/qa`, `/benchmark`, `/canary`) is **out of scope** — requires running browsers + deploy.

## 2. Parallel execution graph

```
[server-mapa] ────merged✓
                       │
            ┌──────────┼─────────────┐
            ▼                        ▼
[client-mapa]              [server-reports]
   (parallel)                (3 batches: customQuery+saved,
                              tasks A/B/C of 9 templates)
            │                        │
            └──────────┬─────────────┘
                       ▼
                [client-reports]
                 (after server-reports merge)
```

server-reports + client-mapa run in parallel (no shared files). client-reports waits on server-reports (consumes its tRPC contract).

## 3. Per-agent contracts

### 3.1 server-reports

**Pre-coding gate (D6):** writes its own CODEMAP in `server/routers/reports/CODEMAP.md` listing the 12 files (1 entities, 1 spec, 1 index, 3 customQuery sub-files, 9 templated files) with LOC budgets summing to ~1500 LOC.

**RED tests first (D5 + testing-strategy.md):**
- `shared/reports/__tests__/savedQuerySpec.test.ts` — allowlist enforcement, ungroupable field rejection, max-limit, evil field name rejection.
- `server/__tests__/reports/customQuery.test.ts` — role guard FORBIDDEN for voluntario, SQL-injection-like filter field rejected by Zod superRefine BEFORE reaching DB.
- `server/__tests__/reports/templated-shape.test.ts` — each of the 9 templated procedures returns the documented output shape.

**Files (12 total, each ≤300 LOC per D4):**
- `shared/reports/entities.ts` (~120 LOC) — ENTITY_FIELDS allowlist, ENTITY_TO_TABLE
- `shared/reports/savedQuerySpec.ts` (~80 LOC) — Zod schema + superRefine
- `server/routers/reports/customQuery/allowlist.ts` (~60 LOC) — re-export helpers
- `server/routers/reports/customQuery/executor.ts` (~180 LOC) — execute() + applyFilter()
- `server/routers/reports/customQuery/saved.ts` (~100 LOC) — list/save/delete CRUD
- `server/routers/reports/index.ts` (~40 LOC) — mergeRouters of customQuery + 9 templated
- `server/routers/reports/templated/{familiasAtendidas,padronPorVencer,informesPorRenovar,complianceSnapshot,familiasEnRiesgo,documentosFaltantes,resumenTrimestral,distribucionPorDistrito,evolucionHistorica}.ts` (9 files, ~80-150 LOC each)
- Wire into `server/routers.ts`: `reports: reportsRouter`.

**Role redaction discipline:**
- All procedures use `adminProcedure`. Voluntarios cannot reach reports.
- `complianceSnapshot` REUSES `getComplianceStats` from `server/routers/families/compliance.ts` — do NOT duplicate.
- `familiasEnRiesgo` REUSES `hasComplianceRedFlag` from `server/_core/mapaAggregation.ts` — do NOT duplicate.
- Templated reports that return `persons!titular_id(nombre, apellidos)` must NOT join high-risk fields (`situacion_legal`, `recorrido_migratorio`, `foto_documento_url`).
- Allowlist DOES NOT include high-risk PII fields (`situacion_legal`, `foto_documento_url`, `recorrido_migratorio`) on the persons entity.

**Out of scope for this PR:**
- `complianceSnapshot` does not stream to PDF. CSV export is client-side (Task 12).
- SQL aggregation inside customQuery is deferred — group/aggregate runs client-side over the limit-capped rows (per source plan §11 comment).

### 3.2 client-mapa

**Pre-coding gate (D6):** existing `client/src/features/mapa-tab/CODEMAP.md` already documents the planned 6 files. Update LOC budgets if any drift.

**RED tests first:**
- `MapaChoropleth.test.tsx` — keep existing 6 tests (thin slice contract); add: lazy import works, GeoJSON load failure surfaces placeholder.
- `LayerToggle.test.tsx` — switching layer triggers onChange.
- `DistritoPanel.test.tsx` — "Ver familias" CTA href targets `?tab=familias&distrito=<slug>`.
- `useMapaData.test.ts` — returns expected shape.
- `geojsonNormalize.test.ts` — maps GeoJSON `NOMBRE: "Centro"` → `DistritoSlug: "centro"` for all 21 distritos.

**Files (6, each ≤300 LOC per D4):**
- `index.tsx` (≤80 LOC) — composes LayerToggle + MapaChoropleth + DistritoPanel
- `MapaChoropleth.tsx` (~220 LOC) — react-leaflet GeoJSON polygons; uses S3 schema `{ rows, layer, kAnonymityFloor }`; renders 21 distritos colored by densidad or compliance ratio
- `LayerToggle.tsx` (≤60 LOC) — shadcn ToggleGroup (Densidad / Compliance)
- `DistritoPanel.tsx` (~180 LOC) — shadcn Sheet, "Ver familias" CTA via wouter
- `hooks/useMapaData.ts` (≤60 LOC) — wraps `trpc.mapa.distritoStats.useQuery({ layer })`
- `utils/geojsonNormalize.ts` (≤50 LOC) — maps GeoJSON NOMBRE → DistritoSlug

**Server contract reuse:** consumes `trpc.mapa.distritoStats` (already merged). Output shape `{ rows: Array<{distrito, count, compliance?}>, layer, kAnonymityFloor: 3 }`. The k-anon-suppressed cells render neutral gray + `<3 familias` tooltip (existing thin-slice already supports this).

**Bundle budget:** lazy-chunked via `React.lazy()` at `<TabsContent value="mapa">`. Target chunk ≤200KB gzipped (react-leaflet ~150KB + component code). Verified by `/benchmark` at S4 ship gate (deferred).

**GeoJSON asset:** `client/src/assets/madrid-distritos.geojson` is the placeholder from micro-PR #0. Canonical datos.madrid.es file replacement is a non-blocking follow-up (per handoff §3) — for now MapaChoropleth tolerates a missing/placeholder GeoJSON by rendering its empty state.

**ProgramTabs flip:** out of scope — Leo's manual micro-PR per parallel plan §6.

### 3.3 client-reports

**Pre-coding gate (D6):** writes its own CODEMAP in `client/src/features/reports-tab/CODEMAP.md` listing the planned files.

**RED tests first:**
- `CustomQueryBuilder/__tests__/FieldPicker.test.tsx` — only filterable fields appear; ungroupable hidden in groupBy
- `__tests__/exportCsv.test.ts` — CSV escapes `"`, `,`, `\n` correctly; high-risk PII NEVER appears in exported CSV regardless of admin role (defense in depth)
- `__tests__/TemplatesGrid.test.tsx` — 9 cards rendered, click opens modal, sections grouped correctly
- `__tests__/SavedQueriesList.test.tsx` — saved query list renders, run-saved roundtrips through executor

**Files (per source-plan task #12, CustomQueryBuilder pre-split per D4 into 5 files):**
- `index.tsx` (≤120 LOC) — tab composition: TemplatesGrid + CustomQueryBuilder + SavedQueriesList
- `TemplatesGrid.tsx` (~150 LOC) — 9 cards grouped by section, opens modals
- `CustomQueryBuilder/{index,FieldPicker,OperatorPicker,GroupByPicker,PreviewPane}.tsx` (5 files, ≤120 LOC each)
- `SavedQueriesList.tsx` (~120 LOC) — list shared+own saved queries, run + delete
- `templates/<9>.tsx` (one modal per templated report, each ≤180 LOC)
- `utils/exportCsv.ts` (~50 LOC)
- `hooks/useTemplatedReports.ts` (~60 LOC) — wraps the 9 tRPC procedures

**CSV redaction:** `exportRowsAsCsv` accepts a `redactFields?: string[]` option. Any high-risk field (`situacion_legal`, `foto_documento_url`, `recorrido_migratorio`) is stripped at export time. The function is the ONE chokepoint; never inline CSV building elsewhere.

**ProgramTabs flip:** out of scope — Leo's manual micro-PR per parallel plan §6.

## 4. Common discipline (applies to all 3 agents)

1. **TDD:** every agent commits RED tests in commit #1 of its work. Production code commits flip RED→GREEN.
2. **300 LOC max per file** (D4). ESLint max-lines rule already in place.
3. **No `any`. No `as unknown as X`.** Use `.returns<T>()` for Supabase typing. Use `vi.mock` for test isolation.
4. **No PII in logs.** All TRPCError messages use IDs only.
5. **Reuse, don't duplicate.** `redactHighRiskFields`, `hasComplianceRedFlag`, `getComplianceStats`, `K_ANONYMITY_FLOOR` already exist. Import them.
6. **Codemap parity (D6):** each agent updates its CODEMAP.md in the same commit as production-code changes. `scripts/codemap-parity.mjs` enforces.
7. **No XState outside checkin.** No Zustand for non-UI state.
8. **WCAG 2.1 AA on all UI:** semantic HTML, ARIA labels, ≥4.5:1 contrast.

## 5. Acceptance per agent

- `pnpm check` zero errors
- `pnpm lint` zero errors (warnings allowed)
- `pnpm vitest run <agent's tests>` 100% green
- `node scripts/codemap-parity.mjs` clean
- File count + LOC per CODEMAP within budgets
- Full-suite failure count does NOT increase from current 23

## 6. Final QA (post-fan-out)

`/sat` Structured Analytic Techniques deep-pass before commit:
1. **Key Assumptions Check** — list 5 load-bearing assumptions of the fan-out work; flag any that's unvalidated.
2. **ACH** on the auth/RLS surface — alternate hypothesis: "voluntario can reach reports via tRPC introspection". Disconfirm.
3. **Devil's Advocacy** on customQuery — adversary tries to extract high-risk PII via crafted filter+groupBy combos. Disconfirm via allowlist + redaction.
4. **What If?** on k-anonymity — "what if a single-family distrito is the only result returned, can we infer presence from the empty bucket?" Surface the answer.

## 7. Commit message format

Per established branch convention:
```
feat(s3): <agent-id> — <one-line summary> (phase2 task #N)
```
