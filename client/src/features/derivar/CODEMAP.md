# Derivar — CODEMAP

> Stage S7 client-derivar Feature Agent works against this contract. **First commit on the agent's worktree branch.** Phase 3 — gated by S4 (Phase 2 prod-green).

## Source plan
- **Tasks:** Phase 3 plan tasks **6, 7, 8, 11, 12, 13, 14** (`docs/superpowers/plans/2026-05-06-programa-familia-phase3.md`)
- **Visual reference:** `Design/bocatas-v4/project/familias.jsx` (Derivar subview) + `persona-detail.jsx` (drawer pattern)
- **Server rendezvous:** `server/routers/derivar/` + `server/_core/{docxRender,pdfFromDocx}.ts` + `server/routers/instituciones/` all merged first

## File tree (planned)

```
client/src/features/derivar/
├── CODEMAP.md                                  (this file)
├── index.tsx                                   ≤ 80 LOC
├── DerivarList.tsx                             ≤ 200 LOC — list of hojas, search, filters
├── HojaDrawer/                                          — pre-split per D4
│   ├── index.tsx                               ≤ 100 LOC
│   ├── HeaderPanel.tsx                         ≤ 120 LOC — familia/persona summary + RGPD footer toggle
│   ├── InterventionsList.tsx                   ≤ 180 LOC — full chronological list with snapshot freeze visible
│   └── FilesPanel.tsx                          ≤ 150 LOC — generated DOCX, PDF, signed scans
├── NuevaIntervencionForm/                               — pre-split per D4
│   ├── index.tsx                               ≤ 200 LOC — composes form sections
│   ├── useFormDefaults.ts                      ≤ 120 LOC — smart-prefill from previous intervention
│   ├── PreFillBadge.tsx                        ≤ 80 LOC  — read-only badge for known fields
│   └── FieldGroup.tsx                          ≤ 150 LOC — input or PreFillBadge based on isKnown
├── InstitucionTypeahead.tsx                    ≤ 200 LOC — Command + async search
├── CrearInstitucionInlineModal.tsx             ≤ 180 LOC — inline create for new institución
└── hooks/
    ├── useHojasList.ts                         ≤ 60 LOC
    ├── useIntervencionesByHoja.ts              ≤ 60 LOC
    ├── useGenerarDocx.ts                       ≤ 60 LOC
    └── useGenerarPdf.ts                        ≤ 60 LOC
```

**Total LOC budget:** ~2,200 across 16 files. Each file ≤ 300 (D4 hard cap).

## Dependency graph

```
          ProgramTabs.tsx
                │
                ▼ (lazy import)
          derivar/index.tsx
                │
        ┌───────┼───────┐
        ▼       ▼       ▼
  DerivarList  HojaDrawer  NuevaIntervencionForm
        │            │             │
        │            ├─► HeaderPanel
        │            ├─► InterventionsList
        │            └─► FilesPanel
        │                    │
        │                    ├─► useGenerarDocx
        │                    └─► useGenerarPdf
        │                            │
        │                            └─► trpc.derivar.{generateDocx, generatePdf}
        │                                    │
        │                                    └─► server/_core/{docxRender, pdfFromDocx}.ts
        │                                            ▲ subprocess sandbox (security-reviewer gate)
        │
        └─► useHojasList → trpc.derivar.list

NuevaIntervencionForm
        │
        ├─► useFormDefaults (smart-prefill from previous intervention)
        ├─► PreFillBadge (read-only display for known fields)
        ├─► FieldGroup (input OR badge based on isKnown)
        ├─► InstitucionTypeahead
        │       │
        │       └─► trpc.instituciones.search
        │
        └─► CrearInstitucionInlineModal (inline create if not found)
                │
                └─► trpc.instituciones.create
```

## Data flow (start intervention)

```
[ User clicks "+ Nueva intervención" ]
       ↓
[ NuevaIntervencionForm opens ]
       ├─► useFormDefaults fetches previous intervention via trpc.derivar.startIntervention
       │       │ Returns: { known: { tipo, descripcion, ... }, blanks: { ... } }
       │       ▼
       ├─► known fields render as <PreFillBadge> (read-only)
       └─► blank fields render as inputs

[ User fills + submits ]
       ↓
[ trpc.derivar.addIntervention({ hoja_id, ...fields }) ]
       ↓
[ server: insert into derivacion_intervenciones ]
       │ ★ JSONB snapshot freeze trigger captures institución state at insert time ★
       ↓
[ Optimistic cache update → drawer re-renders InterventionsList ]
```

## Data flow (generate DOCX/PDF)

```
[ User clicks "Generar Word" in FilesPanel ]
       ↓
[ trpc.derivar.generateDocx({ hoja_id }) ]
       ↓
[ server/routers/derivar/pdfGen.ts ]
       ├─► loads template from program-document-templates bucket
       ├─► server/_core/docxRender.ts (docxtemplater + pizzip)
       │      └─► fills placeholders from hoja + interventions
       ▼
[ .docx returned as base64; client triggers download ]

[ User clicks "Generar PDF" ]
       ↓
[ trpc.derivar.generatePdf({ hoja_id }) ]
       ↓
[ Same path; then server/_core/pdfFromDocx.ts ]
       ├─► child_process.execFile('libreoffice', [...sandboxed argv])
       ├─► /tmp/derivar-{uuid} scoped working dir
       ├─► 30s timeout, SIGKILL on parent exit
       ▼
[ .pdf returned; client downloads ]
```

## Test targets per file (RED first)

| File | Critical tests |
|------|---------------|
| `useFormDefaults.ts` | Returns correct known/blanks split for a given hoja |
| `PreFillBadge.tsx` | Renders as read-only; no input semantics |
| `FieldGroup.tsx` | Branches to input vs badge based on `isKnown` |
| `InstitucionTypeahead.tsx` | Debounced search; renders results; calls onSelect |
| `CrearInstitucionInlineModal.tsx` | Validates + creates institución; closes on success |
| `HojaDrawer/*` | Renders header + full chronological interventions; "Generar Word"/PDF buttons trigger downloads |
| `useGenerarDocx.ts` / `useGenerarPdf.ts` | Loading + error states; success triggers download |

Playwright (E2E):
- Full journey: open Derivar → + Nueva intervención → fill → save → drawer opens → Generar Word → download → Generar PDF → download

## Visual port checklist (bocatas-v4 → production)

- [ ] HojaDrawer uses shadcn `<Sheet>` (not custom drawer)
- [ ] All hex literals → tokens
- [ ] InstitucionTypeahead uses shadcn `<Command>` + `<CommandInput>` + `<CommandList>`
- [ ] Form submit button uses shadcn `<Button>` with loading state via `sonner` toast
- [ ] PreFillBadge styled with `text-muted-foreground` + `bg-secondary` (not custom muted CSS)

## Compliance / Security flags (security-reviewer gate)

- **No high-risk fields in URL params:** `hoja_id` only; never `recorrido_migratorio` or `situacion_legal`
- **EIPD addendum**: per D8 of the plan, EIPD does NOT block this feature shipping to staging; production go-live waits for signoff
- **Subprocess sandbox** for LibreOffice (server-side): see core-utils CODEMAP

---

*Codemap discipline (D6): file-tree drift fails CI via `scripts/codemap-parity.mjs`.*
