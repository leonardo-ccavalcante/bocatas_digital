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
