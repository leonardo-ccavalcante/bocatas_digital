# Frontend v4 Visual Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is a self-contained visual port of one prototype screen onto the existing functional repo.

**Goal:** Port the `Design/bocatas-v4` visual prototype onto the existing Bocatas Digital React app — all 9 screens + shell + design foundation — without breaking existing functionality (tRPC, XState, wouter, RLS).

**Architecture:** This is a **visual re-skin of a working app**, not a rebuild. The prototype `.jsx` files are the visual spec; the existing repo pages own the data/logic. Each task reads the prototype source for visual intent and the repo target for the functionality to preserve, then applies the prototype's design language (typography, layout, spacing, editorial details) using shadcn primitives and the already-defined Tailwind theme tokens. Per `PORT_MAP.md`, the prototype's internal structure (`window.*` globals, Babel runtime, inline `<style>`) is **never** copied.

**Tech Stack:** React 19, Vite 7, TypeScript strict, Tailwind 4 (CSS-config via `@theme` in `index.css`), shadcn/ui, TanStack Query v5, Zustand, XState v5, wouter, sonner. Package manager: pnpm 10 invoked as **`corepack pnpm`** (plain `pnpm` is NOT on PATH in this environment).

**Worktree:** `/Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo-frontend-v4` on branch `feat/frontend-v4-port`. All paths below are relative to this worktree root unless absolute.

**Prototype source root:** `/Users/familiagirardicavalcante/Desktop/Bocatas_Digital/Design/bocatas-v4/project/`

---

## Global Conventions (apply to EVERY task)

### The prototype is the visual spec
For each screen, **read the full prototype `.jsx` file** named in the task. Reproduce its **visual output** (layout regions, spacing rhythm, typography, editorial details, interaction affordances) — not its code structure. Then **read the repo target file(s)** and keep all existing data wiring, props, routes, and behavior intact.

### Design tokens are already defined — use them, don't hardcode
`client/src/index.css` already defines the full OKLCH color system and maps it to Tailwind keys. **Use the utility classes**, never raw hex:

| Use this | Not this | Meaning |
|---|---|---|
| `bg-primary` / `text-primary` | `bg-[#C41230]` / `text-[#C41230]` | Brand red |
| `bg-background` | `bg-[#FAFAF8]` | Warm cream app bg |
| `text-foreground` | `text-[#1A1A1A]` | Primary text |
| `text-muted-foreground` | `text-[#5E5E5E]` | Secondary text |
| `bg-sidebar text-sidebar-foreground` | `bg-[#8B0E22]` | Deep red sidebar |
| `bg-accent text-accent-foreground` | `bg-[#FDE8E8]` | Soft red surface (chips) |
| `border-border` | `border-[#E8E5E0]` | Hairline rules |
| `rounded-[var(--radius)]` / shadcn defaults | arbitrary radii | Base radius 0.875rem |
| `font-display` | `[data-display]` attr | Fraunces display font (added in Task 0) |
| `.text-display-1/2`, `.text-h2/h3`, `.text-body`, `.text-body-sm`, `.text-eyebrow` | arbitrary `text-[Npx]` | Type scale (added in Task 0) |

For muted text, only use AA-passing values: `text-foreground` (#1A1A1A), `text-muted-foreground` (#5E5E5E). The prototype's `#9A9A9A` on text is **forbidden** (decorative dots only).

### shadcn primitives to reuse (already in `client/src/components/ui/`)
`switch`, `toggle` + `toggle-group` (filter pills), `badge` (estado chips — extend variants, don't fork), `dialog` + `drawer` (modals), `command` (⌘K search), `sonner` via `toast()` (toasts — never a custom ToastHost), `tabs`, `table`, `select`, `progress`, `tooltip`, `skeleton`. Prefer extending these over new components.

### Never do (from PORT_MAP "Don't port these" + CLAUDE.md)
- ❌ No `window.*` globals, no Babel runtime, no inline `<style>` token block, no `#demo-strip` fixed element, no `data-display` attribute.
- ❌ No fabricated/mock data in production code. The prototype's `window.MOCK.*` and `synthesize()` are visual fixtures only. Bind to existing tRPC queries. If the design shows a widget whose data the backend does not yet expose, render a proper empty/loading state and leave a `// TODO(frontend-v4): needs <endpoint>` — never hardcode fake rows.
- ❌ No `any`, no `as unknown as X`. Files < 400 lines, functions < 50 lines (split if a target grows past 400).
- ❌ Don't change `client/src/database.types.ts` (generated). Don't touch `server/`, `supabase/`, or schemas — UI only.
- ❌ Don't translate UI chrome — Spanish-only (consent modal is the only non-Spanish surface, out of scope here).
- ✅ WCAG 2.1 AA: semantic HTML, ARIA labels, ≥4.5:1 contrast, touch targets ≥44px. shadcn primitives already include focus rings — drop manual `focus-visible:ring-2` overrides.

### Verification model (this is a visual port — adapt TDD accordingly)
Standard unit-test-first TDD does not fit pixel work. For each task the verification gate is:

1. **Typecheck stays clean:** `corepack pnpm check` → no errors. (Baseline is currently clean.)
2. **Lint introduces no new errors:** `corepack pnpm lint` → fix anything you introduce.
3. **Existing tests for touched files stay green:** run the page/feature's existing tests, e.g. `corepack pnpm test -- <path-or-pattern>`. If you change interactive logic (a new filter, toggle, keyboard handler), **add a focused render/interaction test** (`@testing-library/react`) for that logic — that is the TDD slice for this work.
4. **PORT_MAP greps** (run from worktree root, scoped to the files you touched):
   - `grep -rE 'window\.(useApp|MOCK|NavIcon)' <touched files>` → must be empty
   - `grep -rE 'data-display' <touched files>` → must be empty
   - hardcoded brand hex (`text-\[#C41230\]`, `bg-\[#FAFAF8\]`, `bg-\[#8B0E22\]`) → must be empty in touched files
5. **Visual fidelity** is verified later in a dedicated `/qa` / `/verify` browser pass (not in these tasks). Implementers should still sanity-check that the dev server compiles the page without runtime errors if quick to do so.

### Commit discipline
One commit per task, conventional message, scoped to the task's files. Frequent commits within a task are fine. End commit messages with the Co-Authored-By trailer.

---

## File Structure (what each task creates/modifies)

| Task | Primary target files |
|---|---|
| 0 Foundation | `client/index.html`, `client/src/index.css` |
| 1 Shell | `client/src/components/layout/AppShell.tsx`, `MobileFooterNav.tsx` |
| 2 Home | `client/src/pages/Home.tsx` |
| 3 Check-in | `client/src/pages/CheckIn.tsx`, `client/src/features/checkin/components/*` |
| 4 Programas | `client/src/pages/Programas.tsx`, `client/src/pages/ProgramaDetalle.tsx`, `client/src/features/programs/components/*` |
| 5 Dashboard | `client/src/pages/Dashboard.tsx`, `client/src/features/dashboard/components/*` |
| 6 Personas | `client/src/pages/Personas.tsx`, `client/src/features/persons/components/PersonsTable.tsx` |
| 7 Novedades | `client/src/pages/Novedades.tsx`, `client/src/pages/NovedadDetalle.tsx`, `client/src/features/announcements/*` |
| 8 PersonaDetalle | `client/src/pages/PersonaDetalle.tsx`, `client/src/features/persons/components/PersonCard.tsx` |
| 9 PersonasNueva | `client/src/features/persons/components/RegistrationWizard.tsx`, `client/src/pages/PersonasNueva.tsx` |
| 10 Familias | `client/src/pages/FamiliasList.tsx`, `FamiliaDetalle/*`, `client/src/features/familias-tab/*`, `client/src/features/families/components/*` |

---

### Task 0: Design Foundation — Fraunces font, `font-display` utility, type scale

**Why first:** Every other task uses `font-display` and the `.text-*` type-scale classes. They don't exist yet. Colors are already done — this task only adds typography.

**Files:**
- Modify: `client/index.html` (Google Fonts link)
- Modify: `client/src/index.css` (`@theme` font key + type-scale utilities)
- Test: `client/src/__tests__/design-foundation.test.ts` (new, lightweight)

- [ ] **Step 1: Add Fraunces to the font link.** In `client/index.html`, replace the existing Inter-only `<link href="https://fonts.googleapis.com/css2?family=Inter:...&display=swap" .../>` with a combined link that keeps the existing Inter axes and adds Fraunces:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300;0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,400&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Add the `font-display` theme key.** In `client/src/index.css`, inside the existing `@theme inline { ... }` block, add (Tailwind 4 generates a `font-display` utility from this):

```css
  --font-display: 'Fraunces', 'Inter', serif;
```

- [ ] **Step 3: Add the type-scale utilities.** Append to `client/src/index.css` (after the existing `@layer components { ... }` block, add to it). These mirror the prototype's `<style>` block exactly:

```css
@layer components {
  .text-display-1 { font-family: var(--font-display); font-weight: 500; font-size: 40px; line-height: 1.05; letter-spacing: -0.02em; }
  .text-display-2 { font-family: var(--font-display); font-weight: 500; font-size: 32px; line-height: 1.08; letter-spacing: -0.02em; }
  .text-h2        { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 22px; line-height: 1.15; letter-spacing: -0.01em; }
  .text-h3        { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 16px; line-height: 1.25; }
  .text-body      { font-family: 'Inter', sans-serif; font-weight: 400; font-size: 14px; line-height: 1.45; }
  .text-body-sm   { font-family: 'Inter', sans-serif; font-weight: 400; font-size: 13px; line-height: 1.50; }
  .text-eyebrow   { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 11px; line-height: 1.20; letter-spacing: 0.14em; text-transform: uppercase; }
  /* KPI/stat numerals */
  .tabular-stat   { font-variant-numeric: tabular-nums; }
}
```

- [ ] **Step 4: Add a lightweight guard test.** Create `client/src/__tests__/design-foundation.test.ts` that reads `index.css` + `index.html` as text and asserts the foundation is wired (cheap regression guard, no DOM):

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

describe("design foundation v4", () => {
  it("loads Fraunces display font", () => {
    expect(html).toMatch(/Fraunces/);
  });
  it("defines the font-display theme key", () => {
    expect(css).toMatch(/--font-display:\s*'Fraunces'/);
  });
  it("defines the type scale utilities", () => {
    for (const cls of ["text-display-1", "text-display-2", "text-h2", "text-h3", "text-body", "text-eyebrow"]) {
      expect(css).toContain(`.${cls}`);
    }
  });
});
```

- [ ] **Step 5: Verify.** Run `corepack pnpm test -- design-foundation` (expect PASS) and `corepack pnpm check` (expect clean).
- [ ] **Step 6: Commit.** `git add client/index.html client/src/index.css client/src/__tests__/design-foundation.test.ts && git commit -m "feat(design): add Fraunces display font, font-display utility, and v4 type scale"`

**Acceptance:** `font-display` and `.text-display-1/2/.text-h2/h3/.text-body/.text-eyebrow` are usable app-wide; Fraunces loads; typecheck clean; guard test green.

---

### Task 1: App Shell — Sidebar + Mobile nav + BackLink

**Source:** `Design/.../project/shell.jsx` (Sidebar, NavIcon, BackLink). **Complexity:** MED.
**Target:** `client/src/components/layout/AppShell.tsx` (381 lines), `client/src/components/layout/MobileFooterNav.tsx` (44 lines).

**Reproduce from prototype:** deep-red sidebar (`bg-sidebar text-sidebar-foreground`), brand mark (white circle "B" + "Bocatas / Digital"), collapse toggle (w-60 ↔ w-16) with chevron, nav items with active state (`bg-white/20` + trailing dot), user footer (initials avatar + name + role) + "Salir". Nav set must keep the **repo's existing routes** (richer than the prototype's 7) — apply the prototype's visual treatment to whatever nav items AppShell already renders. The sidebar is `hidden md:flex`; mobile uses `MobileFooterNav`.

**PORT_MAP rules:** `var(--sidebar,#8B0E22)` → `bg-sidebar`; raw white circle color → keep on-brand; collapse state may persist via the existing Zustand `useAppStore` (a `sidebarCollapsed` slice) rather than local state if one exists — check first, reuse, don't add business logic to the store beyond a UI flag. Port `BackLink` ("← Volver") as a small shared component if the repo doesn't already have an equivalent (check `components/layout/` first).

**Steps:**
- [ ] Read `shell.jsx` (full) and `AppShell.tsx` + `MobileFooterNav.tsx` (full). Inventory the repo's current nav items and active-state logic.
- [ ] Restyle the desktop sidebar to the prototype: tokens, collapse toggle, active item treatment, brand mark, user footer. Keep existing routes/auth/role gating.
- [ ] Restyle `MobileFooterNav` consistently (same icons/active treatment, ≥44px targets).
- [ ] If no shared back-link exists, add `BackLink` and use it on detail pages (or note for later screen tasks).
- [ ] Verify per Global model (`check`, `lint`, existing layout tests, greps). Add an interaction test for the collapse toggle if you add new toggle logic.
- [ ] Commit: `feat(shell): apply v4 sidebar + mobile nav design`.

**Acceptance:** Sidebar matches prototype visually; collapse works; all existing routes still reachable; role-based nav visibility unchanged; mobile nav consistent; AA targets met.

---

### Task 2: Home (pattern-setter for the editorial language)

**Source:** `home.jsx` (~106 lines). **Complexity:** LOW-MED.
**Target:** `client/src/pages/Home.tsx` (225 lines).

**Reproduce:** editorial header (greeting in `font-display` / `.text-display-1`, eyebrow kicker via `.text-eyebrow`), one featured CTA (Check-in), and the 6 numbered quick-action tiles (N°XX markers, section rules, hover states). This task establishes the editorial details (monospace eyebrows, `●`/`—` section rules, numbered markers) reused by later screens — get them clean here.

**Preserve:** existing tRPC data and any auth/role logic already in `Home.tsx`. Tiles must link to real routes already present in `App.tsx`.

**Steps:**
- [ ] Read `home.jsx` (full) + `Home.tsx` (full).
- [ ] Rebuild the layout to the prototype using `font-display` + type-scale classes + tokens; implement the 6-tile grid linking to real routes; keep existing queries.
- [ ] Verify per Global model. Keep existing Home tests green; add a render test asserting the 6 tiles link to expected routes if not covered.
- [ ] Commit: `feat(home): port v4 editorial home + quick-action grid`.

**Acceptance:** Home matches prototype; tiles route correctly; greeting uses Fraunces; no hardcoded brand hex; tests green.

---

### Task 3: Check-in (lowest risk — architecture already matches)

**Source:** `checkin.jsx` (~260 lines). **Complexity:** LOW.
**Target:** `client/src/pages/CheckIn.tsx` (205 lines) + `client/src/features/checkin/components/*` (ResultCard, QRScanner, ManualSearchModal, selectors).

**Reproduce:** top bar (sede/programa selector, demo toggle via shadcn `switch`, offline badge), and the result states **green=registered / amber=duplicate / red=not_found** as color+icon cards understandable without reading text (CLAUDE.md hard rule), plus footer actions (Escanear QR, Búsqueda manual, Conteo anónimo). The repo already drives these via the XState machine — **do not touch the machine logic**; only restyle the views it renders.

**PORT_MAP rules:** prototype `setTimeout` cascade is already the XState machine in `features/checkin/machine` — ignore the prototype's timing code. Custom `<Switch>` → shadcn `switch`. Toasts → `toast()` from sonner.

**Steps:**
- [ ] Read `checkin.jsx` (full) + `CheckIn.tsx` + the checkin components (full).
- [ ] Restyle ResultCard (color/icon per state, animation on reveal), top bar, and footer actions to the prototype. Keep machine wiring, offline handling, demo mode.
- [ ] Verify per Global model. Keep checkin tests green (the feature has them); add a render test per result state if the ResultCard styling logic branches.
- [ ] Commit: `feat(checkin): apply v4 result-card + top-bar design`.

**Acceptance:** Each state reads as color+icon without text; switch is shadcn; machine untouched; existing checkin tests green.

---

### Task 4: Programas (list + detail)

**Source:** `programas.jsx` (~662 lines — contains a **list view** AND a **generic detail view**; no separate familias view). **Complexity:** LOW.
**Target:** `client/src/pages/Programas.tsx` (list), `client/src/pages/ProgramaDetalle.tsx` (detail), `client/src/features/programs/components/*`.

**Reproduce — list:** sticky header + search, "Activos" section rule, program cards (index/glyph, title, description, 3-cell KPI strip with `tabular-stat`, footer). **Detail:** header, collapsible meta info box, KPI cards, enrolled-persons table with search + status filter pills (shadcn `toggle-group`).

**Preserve:** existing tRPC program queries/mutations and the enrollment table data on both pages.

**Steps:**
- [ ] Read `programas.jsx` (full) + `Programas.tsx` + `ProgramaDetalle.tsx` + relevant `features/programs/components`.
- [ ] Restyle list cards (editorial typography, KPI strip) and detail (info box, KPI cards, filter pills as `toggle-group`). Keep queries.
- [ ] Verify per Global model; keep program tests green; add filter-pill interaction test if new.
- [ ] Commit: `feat(programas): port v4 program list + detail design`.

**Acceptance:** Cards + detail match prototype; filter pills are `toggle-group`; KPIs tabular; queries intact; tests green.

---

### Task 5: Dashboard

**Source:** `dashboard.jsx` (~308 lines). **Complexity:** LOW-MED.
**Target:** `client/src/pages/Dashboard.tsx` (~170 lines) + `client/src/features/dashboard/components/*` (KPICard, TrendChart, ExportButton, filters, AbsenceAlertsPanel).

**Reproduce:** sticky header (period selector + sede/programa dropdowns), KPI card grid (`tabular-stat`), trend bar chart, program-mix bar, alerts panel, export button. Prototype also shows **cohort retention**, **hourly distribution**, and a **sedes performance table** that the repo lacks: build these UIs **bound to existing dashboard tRPC endpoints if the data exists**; if not, render a labeled empty state + `// TODO(frontend-v4): needs <endpoint>` — do not fabricate data.

**Preserve:** `useKPIStats`, `useTrendData`, realtime subscription, existing filters, CSV export (anonymized).

**Constraint:** No heavy chart libs (bundle < 300KB). Use the existing charting approach already in `features/dashboard` (Recharts is already a dep) — don't add new chart deps.

**Steps:**
- [ ] Read `dashboard.jsx` (full) + `Dashboard.tsx` + dashboard components (full).
- [ ] Restyle header/KPI cards/trend to the prototype. For cohort/hourly/sedes widgets: wire to existing endpoints or empty-state+TODO.
- [ ] Verify per Global model; keep dashboard tests green; add a render test for any new widget's empty/data states.
- [ ] Commit: `feat(dashboard): port v4 KPI + charts layout`.

**Acceptance:** KPIs/trend match prototype; new widgets either bound to real data or honest empty states; no new chart deps; realtime + export intact; tests green.

---

### Task 6: Personas (list)

**Source:** `personas.jsx` (~351 lines). **Complexity:** MED.
**Target:** `client/src/pages/Personas.tsx` + `client/src/features/persons/components/PersonsTable.tsx` (+ `useSearchPersons` hook).

**Reproduce:** sticky header + search with **⌘K/Ctrl-K** focus shortcut, filter pill groups for estado + fase (shadcn `toggle-group`) with counts, result-count bar, desktop table + mobile card view, recency dots (decorative `#9A9A9A` ok for the dot only). Keyboard nav (↑/↓/Enter) — use shadcn `command` primitives where it fits.

**Preserve:** `useSearchPersons` tRPC query and existing columns; navigation to `/personas/:id`.

**Steps:**
- [ ] Read `personas.jsx` (full) + `Personas.tsx` + `PersonsTable.tsx` + `useSearchPersons` (full).
- [ ] Add filter pills (toggle-group) bound to the existing query params, ⌘K search focus, result count, mobile card view, recency dots. Keep the query.
- [ ] Verify per Global model; keep persons tests green; **add interaction tests** for the ⌘K shortcut and filter-pill state (this is the TDD slice).
- [ ] Commit: `feat(personas): port v4 list with filter pills + ⌘K search`.

**Acceptance:** Filters/search/keyboard match prototype; mobile cards render; query unchanged; new interaction tests green.

---

### Task 7: Novedades (feed + detail)

**Source:** `novedades.jsx` (~331 lines). **Complexity:** MED.
**Target:** `client/src/pages/Novedades.tsx` (~150 lines), `client/src/pages/NovedadDetalle.tsx`, `client/src/features/announcements/*` (`useAnnouncements`, `AnnouncementStatusBadge`).

**Reproduce:** header with unread count, category pills with counts (drive colors from the `announcements.category` enum + a `categories.ts` color map — PORT_MAP), segmented view control (Todas / No leídas / Ancladas), pinned section, time-bucketed feed (Hoy / Esta semana / Anteriores), novedad item (category chip, title, body, author, **reach progress bar** = reads/totalAudience via `progress`), action buttons (mark-read, pin, share).

**Preserve:** `useAnnouncements` tRPC query. For reach (`reads/totalAudience`) use a real server-aggregated count if exposed; else empty/`—` + TODO. Don't invent counts.

**Steps:**
- [ ] Read `novedades.jsx` (full) + `Novedades.tsx` + `NovedadDetalle.tsx` + `features/announcements` (full).
- [ ] Add a `categories.ts` color map keyed by the category enum. Implement pinned partition + time-bucket grouping (pure helpers, unit-testable), segmented control, reach bar, action buttons wired to existing mutations (or TODO if absent).
- [ ] Verify per Global model; **add unit tests** for the time-bucketing + pinned-partition helpers (TDD slice). Keep announcements tests green.
- [ ] Commit: `feat(novedades): port v4 feed (buckets, pins, reach, categories)`.

**Acceptance:** Feed grouping/pins/segmented control match prototype; category colors from enum map; reach bound to real data or honest placeholder; helper unit tests green.

---

### Task 8: PersonaDetalle (tabbed profile)

**Source:** `persona-detail.jsx` (~463 lines). **Complexity:** HIGH.
**Target:** `client/src/pages/PersonaDetalle.tsx` (106 lines), `client/src/features/persons/components/PersonCard.tsx`; reuse `CheckinHistoryTable`, `EnrollmentPanel`.

**Reproduce:** sticky header (avatar, name, estado pill, KPI strip) + **5 tabs** (Resumen, Programas, Documentos, Asistencias, Notas) using shadcn `tabs`. Map tabs to **existing data sources**: Resumen → `PersonCard` summary; Programas → `EnrollmentPanel`; Asistencias → `CheckinHistoryTable` (admin-gated, keep gating); Documentos/Notas → wire to existing person endpoints if present, else empty state + TODO (no fabricated docs/notes). Keep the existing role gating (`isAdmin`) and Familia-program CTA.

**Preserve:** `usePersonById`, `useAuth`, all current sections' data and admin gating.

**Steps:**
- [ ] Read `persona-detail.jsx` (full) + `PersonaDetalle.tsx` + `PersonCard.tsx` + `EnrollmentPanel`/`CheckinHistoryTable` signatures (full).
- [ ] Restructure into header + KPI strip + shadcn `tabs`, slotting existing components per tab; restyle `PersonCard`. Keep loading/error/admin states.
- [ ] If `PersonaDetalle.tsx` approaches 400 lines, extract tab panels into `features/persons/components/detail/*`.
- [ ] Verify per Global model; keep persons tests green; add a render test that the correct tab content + admin gating shows.
- [ ] Commit: `feat(persona-detalle): port v4 tabbed profile`.

**Acceptance:** 5-tab layout matches prototype; existing data wired per tab; admin gating preserved; no fabricated data; tests green; files < 400 lines.

---

### Task 9: PersonasNueva (4-step registration wizard)

**Source:** `persona-nueva.jsx` (~267 lines). **Complexity:** HIGH.
**Target:** `client/src/features/persons/components/RegistrationWizard.tsx` (the real implementation; `PersonasNueva.tsx` is a 22-line header wrapper), plus existing persons schema/hooks.

**Reproduce:** 4-step stepper (Identidad → Contacto → Programa → Resumen) with per-step validation gates, consent checkboxes, and a summary review. **Critical:** validation is driven by the existing Zod schema in `features/persons/schemas` (single source of truth — do NOT duplicate validation in the component, per CLAUDE.md). The consent step must respect the consent-language fallback rule (Spanish + verbal-translation banner when the person's `idioma_principal` has no active template) — reuse existing consent logic if present; if the wizard already submits via a tRPC mutation, keep it.

**Preserve:** the existing `RegistrationWizard` submission path and Zod schema. This is a re-skin + step-structure port, not a new data layer.

**Steps:**
- [ ] Read `persona-nueva.jsx` (full) + `RegistrationWizard.tsx` (full) + `features/persons/schemas` + the create-person mutation hook.
- [ ] Restyle/restructure into the 4-step stepper with the prototype's visuals; bind validation to the Zod schema; keep submission + consent logic.
- [ ] If the wizard exceeds 400 lines, split steps into `features/persons/components/registration/Step*.tsx`.
- [ ] Verify per Global model; **add interaction tests** for step gating (can't advance with invalid step) and the consent-fallback banner. Keep existing persons tests green.
- [ ] Commit: `feat(personas-nueva): port v4 4-step registration wizard`.

**Acceptance:** Wizard matches prototype; validation from Zod (not duplicated); consent fallback honored; submission intact; step-gating tests green; files < 400 lines.

---

### Task 10: Familias (list + detail tabs + drawer) — largest, do last

**Source:** `familias.jsx` (~1762 lines — 5 sub-views: list, drawer, detail tabs, member detail, uploads). **Complexity:** HIGH.
**Target (multiple):**
- `client/src/pages/FamiliasList.tsx` — list + filters + expandable member rows
- `client/src/features/families/components/*` — `FamiliaDrawer` (PORT_MAP: **merge** the prototype drawer + members-expand into the existing `FamiliaDrawer`, don't create a new one), `MemberDocDots`
- `client/src/pages/FamiliaDetalle/*` — detail tabs (Datos, Miembros, Entregas, Informe Social, Documentación) — these map to existing pages `FamiliasEntregas.tsx`, `FamiliasInformesSociales.tsx`, `FamiliasCompliance.tsx`; unify visually under the detail tab shell
- `client/src/features/familias-tab/*` — the Programa→Familia→Members tab surface (note: `FamiliasList.tsx`, `MemberDocDots.tsx` may have uncommitted siblings in `repo/` — this worktree branched before those; build cleanly here)
- `client/src/features/uploads-tab/*` — bulk document upload view

**Reproduce:** list table (8 cols: expand, Nº, Titular, Miembros, Estado, Informe, alert flag, actions), collapsible filter section (search, estado select, sin-GUF toggle, sin-Informe toggle), inline expandable member sub-table, quick-view drawer, and the detail tab set. Drive estado/compliance chips from real fields (CM-1..CM-6), never fabricate compliance state.

**Preserve:** all `families` tRPC queries/mutations, GUF import/export entry points, compliance logic, RLS-gated fields. This is the highest-risk task — **split into per-sub-view commits** within the task (list → drawer/members → detail tabs → uploads) and re-verify after each.

**Steps:**
- [ ] Read `familias.jsx` (full — it's large; read in sections) + the repo targets (FamiliasList, FamiliaDrawer, FamiliaDetalle/*, familias-tab/*, uploads-tab/*).
- [ ] Port list + filters first (toggle-group/select for filters); commit.
- [ ] Merge prototype drawer + members-expand into existing `FamiliaDrawer`; restyle `MemberDocDots`; commit.
- [ ] Unify detail tabs (Datos/Miembros/Entregas/Informe/Documentación) under a shadcn `tabs` shell reusing existing compliance/entregas/informes pages; commit.
- [ ] Restyle uploads-tab view; commit.
- [ ] Verify per Global model after each sub-view; keep all families tests green (the feature has the most tests in the repo); add interaction tests for new filter toggles + expandable rows.
- [ ] Final commit: `feat(familias): port v4 list, drawer, detail tabs, uploads`.

**Acceptance:** All 5 sub-views match prototype visually; every existing families query/mutation/compliance behavior intact; drawer merged (not duplicated); files < 400 lines (split as needed); families test suite green.

---

## Self-Review (run before execution)

- **Spec coverage:** All 9 prototype screens + shell + foundation have a task (Tasks 0–10). ✔
- **Token reuse:** Color system pre-exists; only typography is added (Task 0) and every screen task references the Global token table. ✔
- **No fabricated data:** Every data-dependent widget without a backend source is explicitly routed to empty-state + TODO, never mock rows. ✔
- **Functionality preserved:** Each task lists "Preserve" items (tRPC hooks, XState machine, Zod schema, role gating, realtime, GUF). ✔
- **Verification model:** Defined once globally (typecheck + lint + existing tests + greps + targeted interaction/helper tests), referenced per task — adapted from TDD for visual work. ✔
- **Sequencing:** Foundation → Shell → Home (pattern-setter) → low-risk (Checkin/Programas/Dashboard) → med (Personas/Novedades) → high (PersonaDetalle/PersonasNueva/Familias last). ✔
- **Env footgun captured:** `corepack pnpm` (not `pnpm`) stated in header + every verify step. ✔
- **File-size guardrail:** Tasks 8/9/10 include explicit split instructions to stay < 400 lines. ✔
