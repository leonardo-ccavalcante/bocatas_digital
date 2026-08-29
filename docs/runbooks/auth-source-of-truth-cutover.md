# Runbook — corte a `auth.users` como fuente única de identidad y rol

> Precondición **bloqueante** del arreglo de #144 (BR-1). La **fase 1** se ejecuta antes
> de desplegar. No es opcional: tras el corte, un usuario sin `app_metadata.role` queda
> **denegado**, y hoy hay gente —incluida la dirección de Bocatas— que funciona sin él.

## Por qué existe este runbook

Antes del cambio, el servidor lee identidad y rol de `public.app_users`
(`server/_core/authenticateRequest.ts` → `server/db.ts`). Después, los lee de
`auth.users.app_metadata`, que es donde la UI de administración siempre los escribió.

El cambio corrige tres cosas a la vez (entrar, revocar, cambiar rol — ver #144), pero
invierte quién manda. Cualquier usuario cuyo acceso dependa **solo** de su fila en
`app_users` pierde el acceso en el momento del despliegue.

**Un arreglo P0 que deja al equipo fuera es peor que el defecto que arregla.**

## Dos fases — y la primera ya concede privilegios

> **Corrección.** Una versión anterior de esta sección decía que escribir
> `app_metadata` era "puramente aditivo" y no cambiaba nada hasta el despliegue.
> **Es falso, y conviene saberlo antes de ejecutar nada.**

`app_metadata` viaja dentro del access token, y **toda la capa RLS lo lee**:

```sql
get_user_role() = COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', 'beneficiario')
-- supabase/migrations/20260411082006_20260410121100_create_rls_helpers.sql:6-9
```

Esa función gobierna políticas en **45 ficheros de migración** (persons, attendances,
consents, familia_miembros, deliveries y cinco buckets de Storage), y el cliente del
navegador mantiene una sesión de usuario real
(`client/src/lib/supabase/client.ts:20`) con la que sube ficheros directamente a
Storage. En cuanto el token de una persona se refresca — automático, dentro de la hora,
sin volver a entrar — su rol nuevo **ya cuenta** en RLS y en Storage.

Tampoco es aditivo en una sola dirección: escribir `role='user'` sustituye el valor por
defecto `'beneficiario'` por uno que no casa con **ninguna** política, así que esa
persona pierde lecturas que hoy tiene. El script lo avisa.

| | Qué se hace | Qué implica |
|---|---|---|
| **Fase 1** (antes de desplegar) | Rellenar `app_metadata.role` y `user_metadata.nombre` | **Concede permisos RLS/Storage reales** al refrescarse cada token. Es un cambio de producción, no un ensayo |
| **Fase 2** (cuando quieras) | Desplegar #144 | Nadie se queda fuera: ya tienen el rol donde el servidor nuevo lo busca |

**El orden sigue siendo el correcto** — al revés, desplegar primero deja sin acceso a
todo el que solo esté en `app_users`. Lo que cambia es cómo tratar la fase 1: con la
misma seriedad que cualquier cambio de permisos, no como un paso preparatorio inocuo.
Sigue siendo idempotente y repetible.

## Fase 1 — el script

```bash
# 1. Revisión (no escribe nada)
node scripts/backfill-auth-roles.mjs

# 2. Tras revisar la lista (ver el aviso de abajo), escribir
node scripts/backfill-auth-roles.mjs --apply --yes

# 3. Comprobar que no queda nadie pendiente
node scripts/backfill-auth-roles.mjs --verify
```

> ### Esto concede permisos — mira la lista antes de aplicarla
>
> El product owner confirma que **no se ha revocado a nadie**. El script ya no depende de
> esa afirmación: la comprueba. `revokeStaffAccess` escribe `app_metadata.role = null`, y
> eso **es distinguible** de "nunca tuvo rol" (clave ausente), así que las cuentas
> revocadas salen marcadas `REVOCADO` y **no se rellenan** salvo `--incluir-revocados`.
> Si el recuento de revocadas es 0, la afirmación queda verificada con los datos.
>
> Lo que sigue exigiendo criterio humano es distinto: como revocar nunca funcionó, la
> tabla tampoco distingue "sigue en la organización" de "se fue y nadie lo quitó". Dos
> minutos de vista a la lista bastan para detectar a alguien que ya no esté.
>
> ```bash
> node scripts/backfill-auth-roles.mjs --exclude <uuid> --exclude <uuid> --apply --yes
> ```
>
> El id va en la primera columna de la tabla. Un `--exclude` que no case con ninguna fila
> **aborta** en vez de seguir en silencio: creer que alguien quedó fuera cuando en realidad
> se le concede acceso es el peor fallo posible aquí.

El script se niega a continuar si quedarían **cero superadmins**, y lo vuelve a comprobar
contra la base **después** de escribir (el bucle se salta fallos individuales, así que la
cuenta previa era una predicción). Con cero superadmins nadie puede llamar a `setUserRole`
—es superadmin-only— y `createStaffUser` solo concede `admin|voluntario`: no habría
recuperación desde dentro.

Los pasos manuales que siguen son la verificación equivalente en SQL, por si prefieres
mirarlo directamente en el editor de Supabase o contrastar lo que hizo el script.

## Paso 1 — Inventario en SQL (solo lectura, equivalente al dry-run del script)

En el SQL editor de Supabase, contra **producción**:

```sql
-- Cotejo completo auth.users ↔ app_users.
-- Sin PII más allá del email, que es necesario para identificar a quién hay que arreglar.
-- Se comprueban DOS campos, no uno: el rol decide el acceso, el nombre decide
-- cómo aparece esa persona en la auditoría y en los PDF de derivación.
SELECT
  u.id,
  u.email,
  u.raw_app_meta_data  ->> 'role'                                          AS auth_role,
  a.role                                                                    AS app_users_role,
  COALESCE(u.raw_user_meta_data ->> 'nombre', u.raw_user_meta_data ->> 'name') AS auth_nombre,
  a.name                                                                    AS app_users_name,
  u.last_sign_in_at,
  -- El veredicto aplica EXACTAMENTE el predicado del código (APP_ROLES en
  -- server/_core/authenticateRequest.ts): pertenencia exacta, sensible a
  -- mayúsculas y sin recortar espacios. Un `IS NOT NULL` a secas etiquetaría
  -- 'Admin', ' admin' o 'volunteer' como supervivientes, y el código los deniega.
  --
  -- Y se distingue "sin fila en app_users" de "fila con role NULL": hoy la
  -- segunda SÍ entra (getUserById devuelve un user y requireUser solo comprueba
  -- que exista), así que es la que pierde acceso. Un LEFT JOIN las confunde.
  CASE
    WHEN u.raw_app_meta_data ->> 'role'
         IN ('user','admin','superadmin','voluntario','beneficiario')
      THEN 'acceso ok'
    WHEN a.id IS NOT NULL
      THEN 'RIESGO — entra hoy y perderá acceso: rellenar rol'
    ELSE 'sin fila en app_users — hoy ya no entra, el corte no le cambia nada'
  END AS veredicto_acceso,
  CASE
    WHEN COALESCE(u.raw_user_meta_data ->> 'nombre', u.raw_user_meta_data ->> 'name') IS NOT NULL
      THEN 'nombre ok'
    WHEN a.name IS NOT NULL THEN 'AVISO — pierde el nombre: rellenar'
    ELSE                         'sin nombre en ningún sitio'
  END AS veredicto_nombre
FROM auth.users u
LEFT JOIN public.app_users a ON a.id = u.id
ORDER BY veredicto_acceso, u.last_sign_in_at DESC NULLS LAST;
```

Cuenta rápida de los tres grupos:

```sql
SELECT
  count(*) FILTER (WHERE u.raw_app_meta_data ->> 'role' IS NOT NULL)                        AS con_auth_role,
  count(*) FILTER (WHERE u.raw_app_meta_data ->> 'role' IS NULL AND a.role IS NOT NULL)     AS a_rellenar,
  count(*) FILTER (WHERE u.raw_app_meta_data ->> 'role' IS NULL AND a.role IS NULL)         AS sin_rol,
  count(*)                                                                                   AS total
FROM auth.users u
LEFT JOIN public.app_users a ON a.id = u.id;
```

## Paso 2 — Decidir sobre `a_rellenar`

Cada usuario de ese grupo **funciona hoy y dejaría de funcionar**. Para cada uno, con Leo:

- ¿Sigue siendo personal activo? → **rellenar** su rol (paso 3).
- ¿Ya no debería tener acceso? → **no rellenar**. El corte se lo retira, que es justo lo
  que `revokeStaffAccess` lleva sin hacer desde siempre. Anotarlo como decisión, no como
  efecto colateral.

## Paso 3 — Rellenar (idempotente)

Con el script (arriba) o, para un caso suelto, vía Admin API. **Todavía no desde la UI**:
la pantalla de administración ya permite cambiar roles, pero solo lista a quien *ya* tiene
rol en `app_metadata` — es decir, a nadie de este grupo. Consulta para ver qué tocaría:

```sql
-- Comprobar ANTES qué tocaría (dry-run).
SELECT u.id, u.email, a.role AS rol_a_copiar
FROM auth.users u
JOIN public.app_users a ON a.id = u.id
WHERE u.raw_app_meta_data ->> 'role' IS NULL
  AND a.role IS NOT NULL;
```

El relleno se hace con `supabase.auth.admin.updateUserById(id, { app_metadata: { role } })`
por cada fila — **no** con un `UPDATE` directo sobre `auth.users`: GoTrue es el dueño de esa
tabla y escribir a mano en su JSON se sale del contrato.

> **La UI no sirve para ESTE paso, aunque ya permita cambiar roles.** La pantalla de
> administración ahora tiene selector de rol y sí puede conceder `superadmin` — pero
> `getStaffUsers` filtra por `app_metadata.role` ∈ {admin, voluntario, superadmin}, así
> que **los usuarios que hay que arreglar son justo los que todavía no aparecen en esa
> lista**. Para el relleno usa el script o la Admin API.
>
> Una vez rellenados, sí aparecen, y a partir de ahí la gestión de roles se hace desde la
> app. Solo queda un caso sin salida interna: con **cero** superadmins nadie puede llamar
> a `setUserRole` (es superadmin-only) y `createStaffUser` solo concede
> `admin | voluntario` — de ahí el criterio de salida de más abajo.

### 3b — Rellenar también el nombre (`veredicto_nombre = AVISO`)

Antes, `ctx.user.name` venía de `app_users.name`. Ahora viene de
`user_metadata.nombre ?? user_metadata.name`. Un usuario migrado desde MySQL que tenga
nombre en `app_users` pero no en `user_metadata` **conserva el acceso pero pierde el
nombre**, y eso se propaga:

- los PDF de derivación se firman `Usuario <uuid>` (`server/routers/derivar/_shared.ts`)
- `actor_name` queda `null` en el log de auditoría, que es **append-only**: no se
  recupera después
- `autor_nombre` queda `null` en las novedades que publique
- `programs.sessionDocuments` cae al **email** en `subido_por`, metiendo una dirección
  donde iba un nombre para mostrar
- la barra lateral muestra su email en lugar de su nombre

Mismo mecanismo que el rol, distinto campo:
`supabase.auth.admin.updateUserById(id, { user_metadata: { nombre } })`.

Hacerlo **antes** del despliegue: el nombre perdido en una fila de auditoría no se
puede reconstruir a posteriori.

## Paso 4 — Verificar el grupo `sin_rol`

Ese grupo **ya no puede entrar hoy** (sin fila en `app_users` ⇒ `UNAUTHORIZED`), así que el
corte no les cambia nada. Confirmar solo que ninguno es un beneficiario legítimo: la app
tiene superficie autenticada para el rol `beneficiario` (`announcements.getAll` es
`protectedProcedure` y calcula visibilidad por rol y por inscripción a programas), y
`server/routers/admin.ts:194` muestra "sin rol" como `beneficiario` en el directorio.

Si aparecen beneficiarios reales que dependan de la ausencia de rol, **parar**: hace falta
decidir si `beneficiario` se asigna explícitamente antes de cortar.

## Paso 5 — Alta libre de GoTrue: **requisito, no defensa en profundidad**

```
GET /auth/v1/settings   →   "disable_signup", "mailer_autoconfirm"
```

Dos razones distintas, y ninguna de las dos la resuelve este corte:

**5a. S-06 NO se cierra con este cambio.** `docs/TECH_DEBT.md` (S-06) documenta que
cualquier cuenta autoregistrada obtiene un JWT `authenticated` y con él llega a
`/rest/v1/*` directamente contra `delivery_rounds`, `delivery_round_assignments` y
`delivery_round_slots`, que llevan `FOR ALL TO authenticated USING(true) WITH CHECK(true)`
más el grant de tabla general. **Ese camino no pasa por `authenticateRequest`**: es
PostgREST hablando con Postgres. El corte endurece el servidor Node y no toca esa
superficie en absoluto. Sigue pendiente lo que S-06 ya pedía: desplegar
`supabase/migrations/20260707000006_harden_reparto_rls.sql` y desactivar el auto-registro.

**5b. Riesgo nuevo introducido por el corte.** `admin.createStaffUser` escribe
`app_metadata.role` con `email_confirm: false`, así que el rol existe en una cuenta **sin
confirmar**. Con auto-registro abierto, quien conozca el email invitado puede registrarse
contra esa dirección; si además `mailer_autoconfirm` está activo, obtiene sesión sobre una
cuenta que **ya lleva rol de admin**, y el código nuevo se lo concede en la primera
petición. Antes del corte esa toma no servía de nada, porque no había fila en `app_users`.

Desactivar el auto-registro neutraliza ambos. Trátalo como bloqueante.

## Cómo se ve un bloqueo desde fuera — léelo antes de desplegar

Un usuario denegado **no ve ningún mensaje de error**. `auth.me` devuelve `null`,
`ProtectedRoute` lo manda a `/login`, escribe credenciales **correctas**,
`signInWithPassword` **funciona**, y `Login.tsx` lo devuelve a `/` → `ProtectedRoute` →
`/login`. Con Google o enlace mágico es un bucle literal. La pantalla de login es lo último
que podría explicar la denegación y no se entera de nada.

Consecuencia operativa: nadie reportará "me han denegado el acceso". Reportarán **"la app
no funciona"**, justo después de que hayas desplegado un cambio de autenticación. Si no lo
esperas, es la peor señal de triaje posible.

Por eso, durante el despliegue: vigila el ratio de `UNAUTHORIZED` (los `correlationId` de
`server/_core/trpc.ts` sirven) y ten a mano la consulta del paso 1 para cotejar cualquier
reporte contra `veredicto_acceso` antes de decidir si revertir.

## Paso 6 — Comprobar `public.app_users` antes de retirarla

La tabla nunca pasó por el chain de migraciones (no existe en `supabase/migrations/`), así
que se creó a mano en producción y **no se sabe si lleva RLS**. El grant general a
`authenticated` (`20260612000002_recover_role_table_grants.sql`) alcanza a todas las tablas
de `public`, y RLS es la única frontera:

```sql
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.app_users'::regclass;
SELECT has_table_privilege('authenticated', 'public.app_users', 'UPDATE');
```

Si RLS está desactivada y `authenticated` tiene UPDATE, entonces **antes** de este corte
cualquier usuario autenticado podía hacer
`PATCH /rest/v1/app_users?id=eq.<su uuid>` con `{"role":"superadmin"}` y auto-promoverse en
la tabla que el servidor usaba como fuente de verdad. El corte cierra esa vía (a
`app_metadata` solo escribe la Admin API de GoTrue). Anotar el resultado en #144: si la
respuesta es "sí", esto era una escalada de privilegios viva y conviene revisar la tabla en
busca de filas alteradas antes de retirarla.

**"Sin uso" está verificado solo del lado del código TypeScript.** La tabla se creó a mano,
así que puede tener dependientes creados a mano: vistas, funciones, políticas, FKs, o
consultas de informes fuera del repo. Antes de borrarla, comprobarlo de verdad:

```sql
SELECT DISTINCT dependent.relname, dependent.relkind
FROM pg_depend d
JOIN pg_rewrite r      ON r.oid = d.objid
JOIN pg_class dependent ON dependent.oid = r.ev_class
WHERE d.refobjid = 'public.app_users'::regclass
  AND dependent.relname <> 'app_users';

SELECT conrelid::regclass AS tabla, conname
FROM pg_constraint WHERE confrelid = 'public.app_users'::regclass;
```

Retirar la tabla es un follow-up aparte, no parte de este corte.

## Criterio de salida

**Fase 1 — antes de desplegar:**

- [ ] Los recuentos del dry-run (o del paso 1), anotados en #144
- [ ] Lista de relleno **revisada con una persona** que sepa quién debe seguir teniendo
      acceso, y los que no deban recuperarlo excluidos con `--exclude`
- [ ] `veredicto_acceso = RIESGO` → 0 casos, o cada uno resuelto con decisión explícita de Leo
- [ ] `veredicto_nombre = AVISO` → 0 casos (paso 3b), hecho **antes** de desplegar
- [ ] `node scripts/backfill-auth-roles.mjs --verify` sale con código 0
- [ ] Ningún beneficiario legítimo en `sin_rol`
- [ ] **Al menos un `superadmin` con `app_metadata.role` correcto** — verificado por consulta,
      no por suposición. Si el corte deja cero, no hay vía dentro de la app para recuperarlo
- [ ] `disable_signup = true` en producción (paso 5, bloqueante)
- [ ] Resultado del paso 6 anotado en #144

**Fase 2 — tras desplegar:**

- [ ] Prueba end-to-end en producción: crear un usuario de personal desde la UI, entrar
      con él **sin insertar nada a mano**, revocarle el acceso y confirmar que la petición
      siguiente es `UNAUTHORIZED`
- [ ] Confirmar con una persona de dirección que sigue entrando con normalidad — es la
      población que motivó la fase 1

## Nota para quien venga después: dos capas, direcciones de fallo opuestas

Ante la MISMA entrada — un JWT sin rol en `app_metadata` — las dos capas hacen lo contrario:

| Capa | Comportamiento |
|---|---|
| `authenticateRequest` (tRPC, tras este corte) | **deniega** |
| `public.get_user_role()` en RLS (`20260411082006_20260410121100_create_rls_helpers.sql:6-9`) | `COALESCE(..., 'beneficiario')` → **concede** como beneficiario |

Hoy no llega a morder: los routers usan `createAdminClient` (service role, que salta RLS,
ADR-0002), y los dos caminos que necesitan un JWT de usuario lo acuñan de nuevo a partir de
`ctx.user.role` (`createUserImpersonationClient`), así que heredan el rol ya corregido.

Añadido: `get_user_role()` lee el **JWT**, no la fila viva, así que ahí un cambio de rol
sigue siendo visible solo tras refrescar el token — mientras que en tRPC es inmediato. No
asumas que las dos capas coinciden.

## Retroceso

El cambio de código no toca el esquema: `public.app_users` se queda intacta y sin uso, así
que revertir el despliegue no pierde datos.

**Pero revertir el despliegue NO deshace la fase 1.** Los roles escritos en `app_metadata`
siguen ahí y siguen concediendo acceso en RLS y en Storage (ver la sección de las dos
fases). Si hay que deshacer un permiso concedido por error, se retira explícitamente —
revertir el código no lo hace.

**Pero revertir no es gratis:** reinstaura los tres defectos de #144 (personal nuevo sin
permisos, revocación que no revoca, cambio de rol que no se aplica) y, si el paso 6 salió
"sí", reabre la vía de auto-promoción vía PostgREST. Revertir es para desbloquear una
incidencia, no una alternativa a completar los pasos 1-3b.
