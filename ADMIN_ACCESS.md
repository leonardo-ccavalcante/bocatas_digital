# Admin & Superadmin Access Guide — Bocatas Digital

## Current Architecture

El proyecto usa **Manus OAuth** para autenticación. Los roles se asignan en la tabla `users` del template de Manus:
- `user` — acceso básico (Personas, Check-in)
- `admin` — acceso completo (Dashboard, Admin pages)

> **Nota**: No hay "superadmin" en el sistema actual. Solo "user" y "admin".

---

## Tu Usuario Actual

| Campo | Valor |
|-------|-------|
| **Nombre** | Leo Cavalcante |
| **Email** | dev@bocatas.io |
| **Rol** | admin |
| **Login Method** | Google OAuth |
| **Status** | ✅ Activo |

**Acceso**: Ya tienes acceso admin. Simplemente inicia sesión con tu cuenta de Google en:
```
https://bocatasdg-mvcpdsc2.manus.space
```

---

## Rutas Admin-Only

Las siguientes rutas requieren rol `admin`:

| Ruta | Descripción | Componente |
|------|-------------|-----------|
| `/dashboard` | Dashboard de asistencia en tiempo real | Dashboard.tsx |
| `/admin/programas` | Gestión de programas (superadmin-only en futuro) | AdminProgramas.tsx |

**Verificación de rol en el código**:
```tsx
// client/src/App.tsx
<ProtectedRoute path="/dashboard" requiredRoles={["admin"]} component={Dashboard} />
```

---

## Cómo Crear Usuarios de Test

### Opción 1: Manus OAuth (Recomendado)

1. Ve a `https://bocatasdg-mvcpdsc2.manus.space/login`
2. Haz clic en "Google Sign In"
3. Usa cualquier cuenta de Google
4. Se creará un usuario automáticamente con rol `user`

### Opción 2: Magic Link (Desarrollo)

El template incluye Magic Link para desarrollo:
1. Ve a `https://bocatasdg-mvcpdsc2.manus.space/login`
2. Ingresa un email: `admin@bocatas.test`
3. Recibirás un link de confirmación (en desarrollo, se muestra en la consola)
4. Haz clic en el link para confirmar

---

## Cómo Promover un Usuario a Admin

### Vía Supabase Dashboard

1. Ve a [Supabase Console](https://supabase.com/dashboard)
2. Selecciona el proyecto `dev@bocatas.io's Project`
3. Abre **SQL Editor**
4. Ejecuta:
   ```sql
   -- Promover usuario a admin por email
   UPDATE auth.users 
   SET raw_user_meta_data = jsonb_set(
     COALESCE(raw_user_meta_data, '{}'::jsonb),
     '{role}',
     '"admin"'::jsonb
   )
   WHERE email = 'nuevo.admin@example.com';
   ```

### Vía Manus App (Futuro)

Cuando se implemente admin panel, habrá UI para gestionar roles.

---

## Roles y Permisos

### `user` (Default)
- ✅ Registrar personas
- ✅ Check-in QR
- ✅ Ver perfil personal
- ❌ Dashboard
- ❌ Admin pages

### `admin`
- ✅ Registrar personas
- ✅ Check-in QR
- ✅ Ver perfil personal
- ✅ **Dashboard** (KPI, Trend, CSV export)
- ✅ **Admin pages** (Programas)
- ✅ Ver historial de check-ins de otros usuarios

---

## Troubleshooting

### "Acceso denegado" en `/dashboard`

**Causa**: Tu usuario tiene rol `user`, no `admin`.

**Solución**: 
1. Contacta al administrador para que te promueva
2. O usa la opción "Vía Supabase Dashboard" arriba

### "No puedo iniciar sesión"

**Causa**: Cookie de sesión expirada o navegador en modo privado.

**Solución**:
1. Limpia cookies: `Cmd+Shift+Delete` (Mac) o `Ctrl+Shift+Delete` (Windows)
2. Intenta en navegador normal (no privado)
3. Recarga la página

### "Google Sign In no funciona"

**Causa**: Google OAuth no está configurado en Supabase.

**Solución**: Ver sección "Auth Migration — Manus OAuth" en `todo.md`

---

## Estructura de Roles en el Código

### Verificación en el Frontend

```tsx
// client/src/hooks/useAuth.ts
const { user } = useAuth();

if (user?.role === 'admin') {
  // Mostrar Dashboard link
}
```

### Verificación en el Backend

```ts
// server/routers.ts
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx });
});

export const adminRouter = router({
  getDashboard: adminProcedure.query(async () => {
    // Solo admin puede ejecutar
  }),
});
```

---

## Próximos Pasos

- [ ] Configurar Google OAuth en Supabase (ver `todo.md`)
- [ ] Implementar "superadmin" role si es necesario
- [ ] Agregar UI de admin panel para gestionar roles
- [ ] Agregar auditoría de cambios de rol

---

**Última actualización**: 2026-04-11
**Versión**: bocatas-digital v1.0
