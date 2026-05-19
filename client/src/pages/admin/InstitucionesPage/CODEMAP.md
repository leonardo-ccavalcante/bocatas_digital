# Instituciones Admin Page — CODEMAP

> Stage S7 client-instituciones Feature Agent works against this contract. Phase 3 — gated by S4. Smallest of the 4 Phase 3 client features.

## Source plan
- **Tasks:** Phase 3 plan task **11** (`docs/superpowers/plans/2026-05-06-programa-familia-phase3.md`)
- **Visual reference:** `Design/bocatas-v4/project/personas.jsx` (list + search pattern)
- **Server rendezvous:** `server/routers/instituciones/` merged first

## File tree (planned)

```
client/src/pages/admin/InstitucionesPage/
├── CODEMAP.md                      (this file)
├── index.tsx                       ≤ 120 LOC — composes ListView + FormDrawer + SearchBar
├── ListView.tsx                    ≤ 200 LOC — table of instituciones, admin-only mutate actions
├── FormDrawer.tsx                  ≤ 200 LOC — create/edit drawer (single component, mode switch)
└── SearchBar.tsx                   ≤ 100 LOC — search by area + active/inactive filter
```

**Total LOC budget:** ~620 across 4 files. Each file ≤ 300 (D4 hard cap).

## Route registration

- `App.tsx` (single 1-line edit): `<Route path="/admin/instituciones" component={InstitucionesPage} />`
- This is the **only** file outside this directory that the client-instituciones Feature Agent touches.

## Dependency graph

```
              App.tsx (route registration)
                    │
                    ▼
              InstitucionesPage/index.tsx
                    │
        ┌───────────┼────────────┐
        ▼           ▼            ▼
    SearchBar    ListView    FormDrawer
        │           │             │
        │           │             ├─► shadcn <Sheet>
        │           │             ├─► react-hook-form + Zod
        │           │             └─► trpc.instituciones.{create, update, deactivate}
        │           │
        │           └─► trpc.instituciones.list ── role guard: admin/superadmin
        │
        └─► local state, debounced; updates ListView query param
```

## Data flow

```
[ /admin/instituciones ]
       ↓
[ Route guard: must be admin or superadmin (server-side enforced in tRPC middleware) ]
       ↓
[ SearchBar state → useQuery params → ListView render ]
       ↓
[ Click "+ Nueva" or edit row → FormDrawer opens in create/edit mode ]
       ↓
[ Submit → trpc.instituciones.{create, update} → optimistic cache update ]
       ↓
[ Drawer closes; sonner toast on success ]
```

## Test targets per file (RED first)

| File | Critical tests |
|------|---------------|
| `index.tsx` | Admin-only route guard: voluntario gets 403 |
| `ListView.tsx` | Search + filter triggers correct tRPC query params |
| `FormDrawer.tsx` | Create + edit + deactivate flows; Zod validation in UI |
| `SearchBar.tsx` | Debounced typing; clear button works |

Playwright (E2E): Login as admin → create institución → edit → deactivate → verify in list.

## Visual port checklist

- [ ] Page header uses `font-display` for title
- [ ] ListView uses shadcn `<Table>` with sticky header
- [ ] FormDrawer uses shadcn `<Sheet>` (right-side slide-in)
- [ ] SearchBar uses shadcn `<Input>` + `<Toggle>` for active/inactive filter
- [ ] All hex literals → tokens

## Role guard

- **Client-side route guard:** `useSession()` checks role; redirects voluntario to `/programas` with `sonner` warning
- **Server-side enforcement** (canonical): `adminProcedure` / `superadminProcedure` middleware in tRPC. Client guard is defense-in-depth.

---

*Codemap discipline (D6): file-tree drift fails CI via `scripts/codemap-parity.mjs`.*
