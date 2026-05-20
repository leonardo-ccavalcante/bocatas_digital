# CODEMAP — server/routers/reports/

> DX-T1 deliverable. Describes the 12-file structure, per-file LOC budgets, and the recipe for adding a 10th templated report.

## Directory layout

```
shared/reports/
├── entities.ts                     (~120 LOC) — ENTITY_FIELDS allowlist (NO high-risk PII), ENTITY_TO_TABLE
├── savedQuerySpec.ts               (~80 LOC) — Zod schema + superRefine for allowlist enforcement
└── __tests__/
    ├── savedQuerySpec.test.ts      (RED first — allowlist, evil field, ungroupable, max-limit)
    └── entities.test.ts            (DX-T3 drift guard: every ENTITY_FIELDS field matches DB types)

server/routers/reports/
├── CODEMAP.md                       (this file — recipe for adding a 10th report)
├── _TEMPLATE.ts.skeleton            (copy-this-file pattern for new reports)
├── _shared.ts                       (~60 LOC) — withSoftDeleteFilter + wrapDbError helpers
├── index.ts                         (~40 LOC) — mergeRouters of customQuery + 9 templated routers
├── customQuery/
│   ├── allowlist.ts                 (~30 LOC) — re-exports ENTITY_TO_TABLE + field-name validator
│   ├── executor.ts                  (~180 LOC) — execute() with discriminated-union operator dispatch
│   └── saved.ts                     (~100 LOC) — list/save/delete CRUD on report_saved_queries
└── templated/
    ├── familiasAtendidas.ts         (~90 LOC) — date range query on families
    ├── padronPorVencer.ts           (~80 LOC) — families with padrón expiring within N days
    ├── informesPorRenovar.ts        (~80 LOC) — families with informe social due for renewal
    ├── complianceSnapshot.ts        (~40 LOC) — wraps compliance.getComplianceStats (REUSE, no duplicate)
    ├── familiasEnRiesgo.ts          (~80 LOC) — families with one+ CM red flag (reuses hasComplianceRedFlag)
    ├── documentosFaltantes.ts       (~120 LOC) — joins program_document_types + family_member_documents
    ├── resumenTrimestral.ts         (~100 LOC) — quarterly KPIs: year + quarter params
    ├── distribucionPorDistrito.ts   (~80 LOC) — group by distrito, count active families
    └── evolucionHistorica.ts        (~80 LOC) — last 12 months monthly bucketing

server/__tests__/reports/
├── customQuery.test.ts              (voluntario FORBIDDEN, evil field rejected by Zod BEFORE DB, CRUD via vi.mock)
└── templated-shape.test.ts         (~9 contract tests — each procedure returns documented shape)
```

## Dependency graph

```
shared/reports/entities.ts
  └── shared/reports/savedQuerySpec.ts
        └── server/routers/reports/customQuery/executor.ts
              └── server/routers/reports/customQuery/saved.ts
                    └── server/routers/reports/index.ts
                          └── server/routers.ts (appRouter.reports)

server/routers/reports/_shared.ts
  └── (imported by all 9 templated files + executor.ts)

server/routers/families/compliance.ts
  └── server/routers/reports/templated/complianceSnapshot.ts (REUSE getComplianceStats)

server/_core/mapaAggregation.ts
  └── server/routers/reports/templated/familiasEnRiesgo.ts (REUSE hasComplianceRedFlag)
```

## Compliance constraints

- ALL procedures use `adminProcedure`. Voluntarios receive FORBIDDEN.
- `ENTITY_FIELDS.persons` MUST NOT include `situacion_legal`, `foto_documento_url`, `recorrido_migratorio`.
- Every templated query goes through `withSoftDeleteFilter(q)`.
- Every DB error path goes through `wrapDbError(procedureName, error)`.
- No `f.value as never` in executor.ts — use typed discriminated union per operator.

## Recipe: adding a 10th templated report

1. **Copy `_TEMPLATE.ts.skeleton`** to `server/routers/reports/templated/<yourReport>.ts`.
2. **Replace placeholders**: `YOUR_PROC_NAME`, `YourInputSchema`, the select + filter body.
3. **Apply `withSoftDeleteFilter`** — the skeleton already includes this; do not remove it.
4. **Wrap DB error** with `wrapDbError("reports.<yourProcName>", error)`.
5. **Do NOT include high-risk PII fields** (`situacion_legal`, `foto_documento_url`, `recorrido_migratorio`) in any select.
6. **Export** a named `const yourReportRouter = router({ ... })`.
7. **Import + merge** in `server/routers/reports/index.ts`:
   ```typescript
   import { yourReportRouter } from "./templated/yourReport";
   export const reportsRouter = mergeRouters(
     ...existingRouters,
     yourReportRouter,
   );
   ```
8. **Add a contract test** in `server/__tests__/reports/templated-shape.test.ts`.
9. **Update this CODEMAP.md** — add the new file to the directory layout and dependency graph.
10. Run `node scripts/codemap-parity.mjs` (or rely on CI) to verify parity.
