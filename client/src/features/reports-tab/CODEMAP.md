# Reports Tab — CODEMAP

> Stage S3 client-reports Feature Agent works against this contract. First commit on the agent's worktree branch. Production code lands after this file is reviewer-approved.

## Source plan
- **Tasks:** Phase 2 plan tasks **4, 5, 7, 8, 12, 13** (`docs/superpowers/plans/2026-05-06-programa-familia-phase2.md`)
- **Visual reference:** `Design/bocatas-v4/project/familias.jsx` (Reports subview) + `dashboard.jsx` (KPI patterns)
- **Server rendezvous:** `server/routers/reports/` (9 templated procedures + customQuery) — must be merged first

## File tree (planned)

```
client/src/features/reports-tab/
├── CODEMAP.md                              (this file)
├── index.tsx                               ≤ 80 LOC
├── TemplatesGrid.tsx                       ≤ 150 LOC — 9-card grid, click opens modal
├── SavedQueriesList.tsx                    ≤ 150 LOC — saved custom queries (own + shared)
├── CustomQueryBuilder/                              — pre-split per D4
│   ├── index.tsx                           ≤ 200 LOC — composes pickers + preview
│   ├── FieldPicker.tsx                     ≤ 120 LOC
│   ├── OperatorPicker.tsx                  ≤ 100 LOC
│   ├── GroupByPicker.tsx                   ≤ 100 LOC
│   ├── AggregatePicker.tsx                 ≤ 110 LOC — (op,field) flat select; makes groupBy functional
│   └── PreviewPane.tsx                     ≤ 150 LOC
├── templates/                                       — 9 templated report modals
│   ├── FamiliasAtendidasModal.tsx          ≤ 150 LOC
│   ├── FamiliasEnRiesgoModal.tsx           ≤ 150 LOC
│   ├── ComplianceSnapshotModal.tsx         ≤ 200 LOC — reuses ComplianceDashboard
│   ├── PadronPorVencerModal.tsx            ≤ 150 LOC
│   ├── InformesPorRenovarModal.tsx         ≤ 150 LOC — reuses SocialReportPanel
│   ├── DocumentosFaltantesModal.tsx        ≤ 150 LOC
│   ├── ResumenTrimestralModal.tsx          ≤ 200 LOC
│   ├── DistribucionPorDistritoModal.tsx    ≤ 200 LOC
│   └── EvolucionHistoricaModal.tsx         ≤ 200 LOC
├── hooks/
│   └── useTemplatedReports.ts              ≤ 80 LOC — per-template tRPC query wrappers
└── utils/
    └── exportCsv.ts                        ≤ 100 LOC — role-based redaction
```

**Total LOC budget:** ~2,650 across 18 files (largest feature). Each file ≤ 300 (D4 hard cap).

## Dependency graph (high-level)

```
              ProgramTabs.tsx
                    │
                    ▼ (lazy import)
              reports-tab/index.tsx
                    │
        ┌───────────┼────────────┐
        ▼           ▼            ▼
  TemplatesGrid  CustomQueryBuilder  SavedQueriesList
        │             │                    │
        │             ├─► FieldPicker      │
        │             ├─► OperatorPicker   │
        │             ├─► GroupByPicker    │
        │             ├─► AggregatePicker  │
        │             └─► PreviewPane      │
        │                                  │
        ▼                                  ▼
  templates/*.tsx              useSavedQueries hook
        │                                  │
        ├─► ComplianceDashboard (reused)   │
        ├─► SocialReportPanel (reused)     │
        ├─► useTemplateQuery hook          │
        ▼                                  ▼
  exportCsv (utils, role-based redaction)  │
        │                                  │
        ▼                                  ▼
  trpc.reports.templated.* +  trpc.reports.customQuery.{run, save, list, delete}
```

## Data flow (templated report)

```
[ Click "Compliance Snapshot" card ]
       ↓
[ TemplatesGrid opens template modal ]
       ↓
[ ComplianceSnapshot.tsx ]
       │
       ├─► trpc.reports.templated.complianceSnapshot.useQuery({ programa_id, fecha })
       │      │
       │      └─► server reuses families/compliance.getComplianceStats (NO duplicate logic)
       │
       ▼
[ Table + chart render via shared chart primitives ]
       │
       ├─► CSV export → exportCsv util → role-based redaction
       └─► PDF export → server-side DOCX render + PDF convert (server-derivar core-utils)
```

## Data flow (custom query)

```
[ CustomQueryBuilder composes a SavedQuerySpec ]
       ↓
[ Zod-validated client-side ]
       │
       ▼
[ trpc.reports.customQuery.run({ spec }) ]
       │
       ▼
[ server/routers/reports/customQuery/executor.ts ]
       │ ★ NEVER string-concats SQL — allowlist + parameterized only ★
       │
       ├─► allowlist.ts: entity/field/operator/groupBy whitelists
       ├─► executor.ts: builds parameterized query against Supabase
       │
       ▼
[ Result rows ─── role-aware redactHighRiskFields ─── client ]
```

## Test targets per file (RED first)

| File | Critical tests |
|------|---------------|
| `templates/*.tsx` (9) | Per-template: query runs with seed data; CSV export green; redaction by role |
| `CustomQueryBuilder/*` | UI validates allowlist client-side (no malformed spec reaches server) |
| `SavedQueriesList.tsx` | Lists own + shared queries; delete-own works; cannot edit shared by other user |
| `utils/exportCsv.ts` | `csv_export_redacts_high_risk_when_role_voluntario` (RED first) |
| `hooks/useSavedQueries.ts` | Optimistic save → rollback on server reject |

Playwright (E2E):
- All 9 template cards open → render → CSV download works
- Build custom query → save → re-run from SavedQueriesList

## Visual port checklist (bocatas-v4 → production)

- [ ] TemplatesGrid card uses shadcn `<Card>` + `font-display` for title
- [ ] All hex literals → tokens (`text-primary`, `bg-background`, etc.)
- [ ] CustomQueryBuilder uses shadcn `<Select>` / `<Command>` for pickers
- [ ] CSV/PDF download buttons use shadcn `<Button>` variants

## Reuse contract (DO NOT DUPLICATE)

- `ComplianceDashboard.tsx` from `features/families/components/` — render inside `ComplianceSnapshot.tsx` template
- `SocialReportPanel.tsx` from `features/families/components/` — render inside `InformesPorRenovar.tsx` template
- `families/compliance.ts` server `getComplianceStats` — reused by `complianceSnapshot` template procedure (server-side, no client edit needed)

---

*Codemap discipline (D6): file-tree drift fails CI via `scripts/codemap-parity.mjs`.*
