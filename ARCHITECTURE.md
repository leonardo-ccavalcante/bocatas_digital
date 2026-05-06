# Bocatas Digital — Architecture Notes

## Auth Identity (C1 — Dual Auth System)

### Current State (Development)

The platform currently operates with **two coexisting auth systems**:

| Layer | System | Used For |
|-------|--------|----------|
| tRPC context | Manus OAuth (`ctx.user`) | Authorization in tRPC procedures |
| Supabase | Service Role Key (`createAdminClient`) | All DB operations (bypasses RLS) |

**Why this works now:** All DB access goes through `createAdminClient()` (service role), so Supabase RLS is not the enforcement layer — tRPC procedure guards are.

### Production Migration Plan (Supabase JWT)

When migrating to Supabase Auth + JWT:

1. Replace Manus OAuth with Supabase Auth in `server/_core/context.ts`
2. Set `app_metadata.role` on Supabase users (admin, voluntario, superadmin)
3. Replace `createAdminClient()` with `createServerClient()` + user JWT for RLS enforcement
4. Enable RLS policies on all tables
5. Remove manual role checks in procedures (RLS handles it)

---

## Supabase Client Architecture (I3 — Client/Server Pattern)

### File Location

`client/src/lib/supabase/server.ts` — despite the path, this file is **intentionally** in the client source tree because:

- It is imported by **server-side tRPC routers** via Vite's SSR build
- The Vite build pipeline handles `import.meta.env` → `process.env` transformation
- `createAdminClient()` uses `process.env.SUPABASE_SERVICE_ROLE_KEY` (Node env, not Vite)

### Two Clients

| Function | Auth | Used In |
|----------|------|---------|
| `createServerClient()` | Anon key | Browser-side Supabase calls (if any) |
| `createAdminClient()` | Service role key | All tRPC procedures (bypasses RLS) |

**Rule:** Never call `createAdminClient()` from browser-executed code. Only call from tRPC procedures.

---

## RBAC (C3 — Role Hierarchy)

Roles in order of privilege:

```
superadmin > admin > voluntario > user
```

| Procedure | Allowed Roles |
|-----------|---------------|
| `publicProcedure` | All (unauthenticated) |
| `protectedProcedure` | Any authenticated user |
| `adminProcedure` | admin, superadmin |
| `superadminProcedure` | superadmin only |

Defined in `server/_core/trpc.ts`.

---

## Data Minimization (I2 — volunteer_visible_fields)

Each program has a `volunteer_visible_fields: string[]` column that controls which person data columns are visible to volunteers in `EnrolledPersonsTable`.

| Value | Behavior |
|-------|----------|
| `[]` (empty) | No restrictions — show all columns |
| `["nombre", "estado"]` | Only show nombre + estado (estado always visible) |

Controlled columns: `foto`, `nombre`, `estado`, `fecha_inscripcion`, `notas`

Logic implemented in `client/src/features/programs/utils/volunteerVisibility.ts`.

---

## Rate Limiting (M1 — Technical Debt)

### Current State

No rate limiting is implemented on any tRPC mutation. The current protection relies on:

- **Authentication guards** — all sensitive mutations require `superadminProcedure` or `adminProcedure`
- **Supabase service role** — DB operations are server-side only, never exposed to unauthenticated callers

### Why This Is Acceptable for Development

The highest-risk mutations (`admin.createStaffUser`, `admin.revokeStaffAccess`) are protected by `superadminProcedure`, which requires a valid Manus/Supabase JWT with `role=superadmin`. An attacker without a valid superadmin token cannot reach these endpoints.

### Production Recommendation

Before going live, implement rate limiting on:

| Endpoint | Recommended Limit | Reason |
|----------|-------------------|--------|
| `checkin.verifyAndInsert` | 60 req/min per IP | Prevent check-in flooding |
| `admin.createStaffUser` | 10 req/min per user | Prevent invite spam |
| `admin.revokeStaffAccess` | 20 req/min per user | Prevent accidental mass revoke |
| `persons.create` | 30 req/min per user | Prevent duplicate registration spam |

**Recommended approach:** Use an Express middleware (e.g., `express-rate-limit`) in `server/index.ts` before the tRPC handler, scoped to `/api/trpc` routes.

```ts
// server/index.ts — add before tRPC handler
import rateLimit from 'express-rate-limit';

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,            // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/trpc', apiLimiter);
```

**Priority:** Implement before production launch (Epic F or pre-launch checklist).

---

## File Organization Conventions (O1)

The repo has organically evolved a layered taxonomy that is not enforced
by linter rules, so this section pins the convention. New code that
diverges from these patterns should either follow them or, if it has a
defensible reason to deviate, document the reason inline.

### Server (`server/`)

| Pattern | Where to put new code |
|---------|-----------------------|
| **tRPC routers** | `server/routers/<domain>.ts` for single-file routers (e.g. `checkin.ts`, `dashboard.ts`, `programs.ts`) OR `server/routers/<domain>/index.ts` + sub-files when the router exceeds ~400 LOC (see `families/`, `persons/`, `announcements/`, `entregas/`). The split-folder pattern was applied retroactively to large routers — apply it from day one if you anticipate growth. |
| **Cross-router utilities** | `server/<domain>-helpers.ts` at the server root (e.g. `announcements-helpers.ts`, `families-doc-helpers.ts`) when the helper is consumed by exactly one domain. Generic utilities used across domains live in `server/_core/`. |
| **CSV parsers / exporters** | `server/csv*.ts` at the server root. They are pure transform modules (no DB, no I/O), and are paired with adjacent `*.test.ts` for unit testing. |
| **Server-only DB helpers** | `server/db/` for typed Supabase wrappers and validation helpers (`csv-validation.ts`, `soft-delete-audit.ts`). |
| **Tests** | Adjacent `*.test.ts` files for **unit tests of pure modules**. `server/__tests__/` for **integration / contract tests** that exercise multiple modules. `server/routers/__tests__/` for **router-level tests** (with mocked Supabase). `server/routers/<domain>/__tests__/` for tests that are tightly coupled to a single domain router. |

### Client (`client/src/`)

| Pattern | Where to put new code |
|---------|-----------------------|
| **Pages** | `client/src/pages/<PageName>.tsx` for **simple route components** (a single file). Promote to `client/src/pages/<PageName>/index.tsx` + sibling files when the page accumulates more than ~3 sub-components or local helpers (see `pages/admin/`, `pages/AdminNovedades/`, `pages/FamiliaDetalle/`). |
| **Feature folders** | `client/src/features/<feature>/` for **domain-specific code** (hooks, components scoped to that feature, utils). Mirrors the swim-lane model in `CLAUDE.md`. Features today: `admin`, `announcements`, `checkin`, `dashboard`, `families`, `persons`, `programs`, `responsiveness`. |
| **Shared components** | `client/src/components/<Component>.tsx` at the components root for **modals / banners / shared widgets** consumed from more than one feature. Promote to `client/src/components/<Component>/` when the component grows to multiple files. |
| **shadcn/ui primitives** | `client/src/components/ui/` — these are generated by the shadcn CLI and should not be hand-edited beyond Tailwind class adjustments. |
| **Layout primitives** | `client/src/components/layout/` for shells, sidebars, headers used across pages. |
| **Hooks** | `client/src/hooks/` for **app-wide custom hooks** (e.g. `useDebounce`, `useAuth`). Feature-specific hooks live in `client/src/features/<feature>/hooks/`. |
| **Lib** | `client/src/lib/` for **third-party SDK wrappers + adapters** (`lib/supabase/`, `lib/trpc.ts`, `lib/i18n.ts`). |
| **Tests** | `client/src/features/<feature>/__tests__/` for feature tests; `client/src/components/__tests__/` for shared-component tests. |

### Shared (`shared/`)

Type-only or pure helpers that are imported from BOTH client and server.
Today: `shared/announcementTypes.ts`, `shared/familyEvents.ts`,
`shared/legacyFamiliasTypes.ts`, `shared/qr/`. Anything that depends on
a runtime SDK (Supabase, React, Express) does NOT belong here.

### Migrations (`supabase/migrations/`)

| File | Purpose |
|------|---------|
| `supabase/migrations/<timestamp>_<name>.sql` | Active migrations applied to the local + remote project. |
| `supabase/migrations/EXPORTED/` | Re-exported snapshots from `supabase_migrations.schema_migrations` taken on a specific date. Read-only — never edit directly. |

Naming: `YYYYMMDDhhmmss_snake_case_description.sql`. Apply with
`supabase db reset` locally, validate via the advisor, then promote to
remote with `apply_migration` (or `supabase migration up`).

### Docs (`docs/`)

| Subfolder | Convention |
|-----------|------------|
| `docs/superpowers/specs/` | Approved design docs for a feature. Filename: `YYYY-MM-DD-<topic>-design.md`. |
| `docs/superpowers/plans/` | Implementation plans tied to a spec. Filename: `YYYY-MM-DD-<topic>.md`. |
| `docs/superpowers/findings/` | Audit / review outputs (`W1-sec.md`, `W2-be.md`, etc.). |
| `docs/runbooks/` | Operational guides (`eipd-status.md`, `qr-secret-rotation.md`). |
| `docs/migrations/` | DB migration history docs (NOT the SQL files themselves — those live under `supabase/migrations/`). |
| `docs/archive/<date>/` | Frozen historical docs from prior sprints. |
| `docs/baselines/` | Test/perf baselines pinned at a point in time. |
| `docs/plans/` | Sprint-level plans (older convention; new plans go under `docs/superpowers/plans/`). |
| `docs/todo.md` | Current TODOs at repo level (was at root before 2026-06-01). |

### Tests across the stack

Three discoverable layers:

1. **Inline unit tests** (`<module>.test.ts` next to `<module>.ts`) — for pure functions and tightly coupled units.
2. **`__tests__/` folders** — for integration / contract / multi-module tests. Each layer has its own (`server/__tests__/`, `server/routers/__tests__/`, `client/src/features/<x>/__tests__/`, `client/src/components/__tests__/`).
3. **`e2e/`** — Playwright end-to-end specs gated on `E2E_LIVE=1`.

A test file should live in the layer that matches what it actually
exercises. A unit test for a pure CSV mapper goes inline; a router
integration test that mocks Supabase goes in `routers/__tests__/`; a
multi-router scenario goes in `server/__tests__/`.

### When to deviate

If a new file genuinely doesn't fit any of the above, it likely signals
either (a) a missing feature/domain folder that should be created, or
(b) a one-off script that belongs under `scripts/`. Prefer (a) when the
code will be extended; (b) when the code is single-purpose ops tooling.
