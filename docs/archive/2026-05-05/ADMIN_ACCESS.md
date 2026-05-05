# Admin & Superadmin Access Guide — Bocatas Digital

> **Archived 2026-05-05** (was 180 lines, distilled to fit the ≤150-line archive cap).
> Original: see git history at branch `cleanup/phase5-docs-and-cleanup`'s parent commit.
> **Authoritative current source:** [`docs/dev-setup.md`](../../dev-setup.md) (test creds, role promotion).

## Auth model

The project uses **Manus OAuth** for production + Supabase Auth (email/password) for local dev users.
Roles are stored on `auth.users.raw_user_meta_data.role` (canonical for RLS) and on `persons.role` (for app-level fallback). Since 2026-05-05 the canonical roles are: `superadmin`, `admin`, `voluntario`, `beneficiario`.

| Role | Beneficiario | Voluntario | Admin | Superadmin |
|---|---|---|---|---|
| Read own profile | ✅ | ✅ | ✅ | ✅ |
| Register persons | — | ✅ | ✅ | ✅ |
| QR check-in | — | ✅ | ✅ | ✅ |
| Dashboard / KPI | — | — | ✅ | ✅ |
| Edit persons | — | — | ✅ | ✅ |
| Manage roles | — | — | ✅ | ✅ |
| Drop tables / migration apply | — | — | — | ✅ |

Admin-only routes: `/dashboard`, `/admin/programas`, `/admin/usuarios`, `/admin/novedades`, `/admin/consentimientos`, `/admin/logs`, `/admin/soft-delete-recovery`.

## Promote a user to admin (Supabase SQL editor)

```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'::jsonb
)
WHERE email = 'someone@example.com';
```

For superadmin, replace the `'"admin"'` literal with `'"superadmin"'`. Effect: next sign-in, the new role appears in the JWT `app_metadata.role` claim that the RLS helpers `get_user_role()` and `get_person_id()` read.

## Frontend / backend role checks

```tsx
// client/src/components/ProtectedRoute.tsx
<ProtectedRoute requiredRoles={["admin", "superadmin"]}>
  <Dashboard />
</ProtectedRoute>
```

```ts
// server/_core/trpc.ts
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!["admin", "superadmin"].includes(ctx.user.role)) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});
```

## Troubleshooting

- **"Acceso denegado" on `/dashboard`** — your user has `voluntario` or `beneficiario`. Ask a superadmin to run the SQL above, then sign out + back in.
- **"No puedo iniciar sesión"** — clear cookies (`Cmd+Shift+Delete` on Mac), retry in a non-incognito window. If still failing, your Manus OAuth app config may have lapsed — check the dashboard.
- **Google Sign-In broken** — Manus OAuth is the canonical login; Google sign-in only works in Supabase-only flows that we're sunsetting. See `todo.md` archive for migration history.

## Historical context

This file was written 2026-04-11 when the project still had a 2-role model (`user` / `admin`). The 4-role model (`superadmin` / `admin` / `voluntario` / `beneficiario`) replaced it on 2026-04-14 (commit history → migration `add_role_to_persons`).
