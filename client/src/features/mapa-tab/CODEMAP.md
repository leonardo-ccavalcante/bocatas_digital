# Mapa Tab — CODEMAP

> Stage S3 client-mapa Feature Agent works against this contract. First commit on the agent's worktree branch. Production code lands after this file is reviewer-approved.

## Source plan
- **Tasks:** Phase 2 plan tasks **5, 10, 13** (`docs/superpowers/plans/2026-05-06-programa-familia-phase2.md`)
- **Visual reference:** `Design/bocatas-v4/project/familias.jsx` (Mapa subview, lines ~98+) — adapt per `PORT_MAP.md`
- **Server rendezvous:** `server/routers/mapa.ts` must be merged first (see [server-mapa CODEMAP](../../../../server/routers/mapa.CODEMAP.md))

## File tree

### Current (Stage S3 — landed)

```
client/src/features/mapa-tab/
├── CODEMAP.md
├── index.tsx                           ≤ 80 LOC  — composes Choropleth + LayerToggle + DistritoPanel
├── MapaChoropleth.tsx                  ≤ 220 LOC — react-leaflet integration, GeoJSON polygons
├── LayerToggle.tsx                     ≤ 60 LOC  — shadcn ToggleGroup: Densidad / Compliance
├── DistritoPanel.tsx                   ≤ 180 LOC — side drawer on distrito click, "Ver familias" CTA
├── hooks/
│   └── useMapaData.ts                  ≤ 60 LOC  — wraps trpc.mapa.distritoStats.useQuery
└── utils/
    └── geojsonNormalize.ts             ≤ 50 LOC  — maps GeoJSON NOMBRE → DistritoSlug
```

**Total LOC budget:** ~650 across 6 files. Each file ≤ 300 (D4 hard cap, comfortably under).

## Dependency graph

```
              ProgramTabs.tsx
                    │
                    ▼ (lazy import)
              mapa-tab/index.tsx
                    │
        ┌───────────┼────────────┐
        ▼           ▼            ▼
  LayerToggle  MapaChoropleth  DistritoPanel
                    │              │
                    │              └─► wouter useLocation (deep-link to ?tab=familias&distrito=X)
                    │
                    ├─► leaflet + react-leaflet (peer deps from package.json)
                    ├─► useMapaData (hook)
                    │      │
                    │      └─► trpc.mapa.distritoStats.useQuery({ layer: 'densidad' | 'compliance' })
                    │              │
                    │              └─► server/routers/mapa.ts (rendezvous gate)
                    │
                    └─► geojsonNormalize (utils)
                           │
                           └─► shared/madrid/distritos.ts (DISTRITO_SLUGS, isDistritoSlug)
```

## Data flow

```
[ Supabase ]
    │ (RLS-filtered families + persons rows by role)
    ▼
[ tRPC server: mapa.distritoStats ]
    │ aggregate-by-distrito + k-anonymity floor 3
    ▼
[ TanStack Query cache ]
    │ keyed by ['mapa', layer]
    ▼
[ useMapaData hook ]
    │ shape: { distrito: DistritoSlug, count: number | null, compliance?: number }[]
    ▼
[ MapaChoropleth ]
    │ joins to GeoJSON polygons via normalized NOMBRE → DistritoSlug
    ▼
[ Leaflet rendering ]
```

## Test targets per file (RED first)

| File | Critical tests |
|------|---------------|
| `MapaChoropleth.tsx` | Renders 21 polygons; tooltip shows "<3 familias" for k-anon-suppressed; click fires DistritoPanel open |
| `LayerToggle.tsx` | Switching layer triggers tRPC refetch with new `layer` param |
| `DistritoPanel.tsx` | "Ver familias" CTA navigates to `?tab=familias&distrito=<slug>` via wouter |
| `useMapaData.ts` | Returns expected shape; loading and error states render correctly |
| `geojsonNormalize.ts` | Maps GeoJSON `NOMBRE: "Centro"` → `DistritoSlug: "centro"` for all 21 distritos |

Playwright (E2E, gated `E2E_LIVE=1`):
- Keyboard nav: Tab through distritos, Enter activates DistritoPanel, ARIA labels present
- k-anonymity: distrito with <3 families renders neutral + tooltip "<3 familias"

## Visual port checklist (bocatas-v4 → production)

From `Design/bocatas-v4/project/PORT_MAP.md`:
- [ ] Replace `window.useApp` (none — Mapa doesn't use it)
- [ ] Replace hex literals: `text-[#C41230]` → `text-primary`; `bg-[#FAFAF8]` → `bg-background`
- [ ] LayerToggle uses shadcn `<ToggleGroup>` + `<Toggle>` (not custom `<Switch>`)
- [ ] DistritoPanel uses shadcn `<Sheet>` (not custom drawer markup)
- [ ] Display heading uses `font-display` class (Fraunces, landed in micro-PR #0)

## Bundle budget

- Lazy-chunked at `<TabsContent value="mapa">` level via `React.lazy()`.
- Target chunk size ≤ 200KB gzipped (react-leaflet ~150KB + Mapa component code).
- Lighthouse CI runs against `/checkin` (LCP-critical route), NOT `/programas/:slug?tab=mapa` — bundle budget on this chunk is gauged separately.

## Asset dependency

- `client/src/assets/madrid-distritos.geojson` (canonical 21-feature file)
  - **Currently:** placeholder committed in micro-PR #0 with TODO marker
  - **Replace before merge:** canonical datos.madrid.es file (~50KB)

---

*Codemap discipline (D6): if you add/rename/remove a file here, update this codemap in the same commit. `scripts/codemap-parity.mjs` fails CI on drift.*
