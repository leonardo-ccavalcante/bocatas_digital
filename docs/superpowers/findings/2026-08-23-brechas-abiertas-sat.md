# SAT — Cierre de brechas abiertas · Onda 1 (BR-1 / #144)

**Alcance:** el diff de la Onda 1 sobre `claude/bocatas-digital-brechas-pqbncn`.
**Técnicas:** Key Assumptions Check · ACH · Devil's Advocacy · What If
**Método:** seis revisores independientes en paralelo sobre el diff terminado, cada uno con
una lente y ciego a los demás (convención Mythos, `docs/TECH_DEBT.md:130`), más verificación
propia de cada hallazgo contra el código. **Los hallazgos de un agente son sospecha, no
veredicto:** todos los que aparecen abajo como CONFIRMADO se comprobaron leyendo el código o
ejecutando algo, no por reporte.

---

## Resumen

El mecanismo es correcto y la afirmación central sobrevivió al ataque. Lo que **no**
sobrevivió fue la cláusula "sin daño colateral": el runbook, que era precisamente la pieza
encargada de acotar ese daño, resultó ser lo más débil del conjunto, y la primera versión de
la batería de tests dejaba pasar una mutación con impacto de seguridad.

Se corrigieron **9 hallazgos** antes de entregar. Ninguno queda abierto sin registrar.

---

## Key Assumptions Check

| # | Suposición | Estado |
|---|---|---|
| KAC-1 | `supabase.auth.getUser(token)` resuelve la fila viva de `auth.users`, no las claims del JWT — de esto depende que la revocación sea inmediata | **CONFIRMADA.** `@supabase/auth-js` 2.103.0: `getUser(jwt)` → `_getUser` → `_request(GET ${url}/user, { jwt })`. Es un round-trip HTTP a GoTrue; no hay decode local ni caché. Si esto fuera falso, la corrección entera se cae |
| KAC-2 | Todo usuario que hoy funciona en producción tiene `app_metadata.role` | **NO VERIFICABLE desde el repo.** Es el riesgo de despliegue, y por eso el runbook es precondición bloqueante |
| KAC-3 | Nada fuera de `db.ts`/`sdk.ts` necesitaba un campo exclusivo de `app_users` | **CONFIRMADA.** `ctx.user` se consume como `.id` (77), `.role` (19), `.name` (5), `.email` (1), más un `.openId` (corregido en este diff). `loginMethod`, `createdAt`, `updatedAt` y `lastSignedIn`: **cero** consumidores |
| KAC-4 | Denegar a quien no tiene rol es seguro | **MATIZADA.** Correcta como postura, pero la consulta de inventario del runbook no distinguía a quién afectaba. Ver DA-1 |
| KAC-5 | `app_metadata` no es escribible por el propio usuario | **CONFIRMADA.** GoTrue solo permite escribirlo por la Admin API (service role). `auth.updateUser` escribe `user_metadata`. Cero triggers que copien uno en otro (`grep raw_app_meta_data supabase/migrations/` → vacío) |
| KAC-6 | `user_metadata` **sí** es escribible por el propio usuario | **CONFIRMADA — y era el punto ciego.** Ver DA-4 |

---

## ACH — hipótesis en competencia para "el voluntario nuevo ve la pantalla vacía"

| Hipótesis | Evidencia a favor | Veredicto |
|---|---|---|
| Falta la fila en `app_users` | `authenticateRequest.ts:94` devuelve `null` sin fila; `requireUser` lanza `UNAUTHORIZED`; la UI lee de `auth.me` | **RETENIDA** — explica los tres síntomas con un solo mecanismo |
| Error de mapeo de roles | Los valores de `admin.ts` son un subconjunto de los que acepta el servidor | **DESCARTADA** |
| Error de enrutado en el cliente | `ProtectedRoute` reacciona a `isAuthenticated`, que se deriva de `auth.me` | **DESCARTADA** — es consecuencia, no causa |

La hipótesis retenida explica además dos síntomas que nadie había reportado (revocar no
revoca, cambiar rol no aplica), lo que la refuerza frente a las alternativas.

---

## Devil's Advocacy — hallazgos, todos corregidos antes de entregar

### DA-1 · La consulta de go/no-go no distinguía a quien sí entra hoy — CONFIRMADO (ALTO)
El paso 1 agrupaba por `a.role IS NULL` sobre un `LEFT JOIN`, que mezcla dos poblaciones
distintas: "sin fila en `app_users`" (hoy no entra; el corte no le cambia nada) y "fila con
`role` NULL" (**hoy sí entra**, porque `requireUser` solo comprueba que `ctx.user` exista, y
`app_users` no tiene migración que garantice `NOT NULL`). El runbook etiquetaba a la segunda
como segura. **Corregido:** el veredicto discrimina con `a.id IS NOT NULL`.

### DA-2 · El veredicto no aplicaba el predicado del código — CONFIRMADO (ALTO)
El código exige pertenencia exacta a `APP_ROLES`; la consulta usaba `IS NOT NULL`. `'Admin'`,
`' admin'` o `'volunteer'` salían como "sobrevive" y el código los deniega. **Corregido:** la
consulta usa el mismo `IN (...)`.

### DA-3 · El runbook mandaba a una UI que no existe — CONFIRMADO (ALTO)
`grep -rn "setUserRole" client/src/` → vacío. La única pantalla cablea `getStaffUsers`,
`createStaffUser` y `revokeStaffAccess`; y `getStaffUsers` filtra por `app_metadata.role`,
así que **los usuarios a arreglar son justo los que no salen en la lista**. Además
`createStaffUser` acepta solo `admin|voluntario`: no hay vía en la app para conceder
`superadmin`. **Corregido:** el paso 3 va por Admin API, con el corolario de recuperación
escrito, y se añadió el criterio de salida "≥1 superadmin superviviente".

### DA-4 · `ctx.user.name` pasa a ser escribible por el propio usuario — CONFIRMADO (MEDIO)
Antes venía de `app_users.name` (solo servidor); ahora de `user_metadata`, que el titular
escribe con la anon key y su propio token. Se persiste en `autor_nombre`, `actor_name` y los
PDF de derivación → suplantación de atribución en auditoría, y escritura sin límite de
longitud. **Corregido:** `str()` recorta y limita a 120; documentado que el nombre es solo
para mostrar y que la identidad vive en `actor_id`, que sí es de confianza.

### DA-5 · …y a la vez se pierde para los usuarios migrados — CONFIRMADO (MEDIO)
Dos revisores llegaron al mismo campo por lados opuestos. Un usuario con `app_users.name`
pero sin `user_metadata.nombre` **conserva el acceso y pierde el nombre**: los PDF se firman
`Usuario <uuid>`, `actor_name` queda `null` en un log *append-only* (irrecuperable) y
`sessionDocuments` cae al email. La consulta del runbook no lo detectaba. **Corregido:**
la consulta comprueba también el nombre y hay un paso 3b de relleno, previo al despliegue.

### DA-6 · Afirmación falsa sobre S-06 en el runbook — CONFIRMADO (ALTO)
Escribí que el corte cerraba S-06 solo. Es falso: S-06 es acceso directo por PostgREST con un
JWT `authenticated` contra las tablas de reparto, y **ese camino no pasa por
`authenticateRequest`**. Seguir el runbook habría llevado a dejar abierto un agujero vivo en
producción. **Corregido:** el paso 5 pasa a ser bloqueante y explica por qué el corte no lo
toca. Añadido además un riesgo *nuevo* que sí introduce el corte: `createStaffUser` deja el
rol puesto en una cuenta sin confirmar, así que con alta libre + `mailer_autoconfirm` un
tercero puede tomarla ya con rol.

### DA-7 · Mi justificación del guard de fechas era falsa — CONFIRMADO (BAJO)
Escribí que un `Invalid Date` haría lanzar a superjson y devolvería 500. Verificado en
`node_modules`: `isDate = payload instanceof Date && !isNaN(payload.valueOf())`, así que un
`Invalid Date` **no** entra al transformador y degrada a `null` en JSON. **Corregido:** el
guard se mantiene (evita que `auth.me` mande `createdAt: null` en un campo tipado `Date`),
pero con la razón verdadera escrita.

### DA-8 · "Lookup con service role" era un modelo mental equivocado — CONFIRMADO (BAJO)
`_request` pone `Authorization: Bearer <jwt del llamante>`; la service key viaja solo como
`apikey`. La conclusión aguanta (es lookup contra la fila viva), el modelo mental no.
**Corregido** en el comentario del módulo.

### DA-9 · La batería de tests dejaba pasar una mutación de seguridad — CONFIRMADO (ALTO)
Con los 23 tests iniciales, mutar a `readAppRole(...) ?? "user"` **pasaba en verde**: era
exactamente la escalación que uno de los tests decía prevenir, porque su fixture ponía los dos
roles a la vez y nunca ejercitaba el caso discriminante. También pasaban en verde cambiar la
service key por la anon key, e intercambiar `updatedAt`/`lastSignedIn`. **Corregido:** 34
tests, y las tres mutaciones ahora fallan (verificado ejecutándolas). Además se reetiquetó
como tal el test tautológico de "cambio de rol": la función no tiene estado, así que hoy no
puede fallar; sirve como guarda contra una caché futura y se documenta así.

---

## What If

| Escenario | Resultado |
|---|---|
| `role` con otra caja o espacios (`"Admin"`, `" admin"`) | **Denegado** — pertenencia exacta. Riesgo real: ya conviven cuatro vocabularios de rol en el repo. Recogido en DA-2 |
| Falta `created_at` | Sin caída: `date()` devuelve null y cae a "ahora". Nadie lee `createdAt` |
| Cookie con `%` mal formado | **Era una caída remota:** `decodeURIComponent` lanza `URIError`, y `handleStorageProxy` hace `await` fuera de su `try`; Express 4 no captura rechazos de handlers async. Anónimo y sin rate limit. Preexistente, pero en un fichero de esta onda → **corregido** con un guard y dos tests |
| Los usuarios sembrados de `e2e/` no tienen `app_metadata.role` | No afecta a CI (los specs están tras `E2E_LIVE=1` y no se ejecutan). Sí fallaría un `E2E_LIVE=1` contra una semilla que ponga el rol en `raw_user_meta_data`; conviene revisar la semilla antes |
| Se descubre un bloqueado **después** de desplegar | El síntoma es un **bucle silencioso de redirección**, sin mensaje de error: reportarán "la app no funciona" justo después de un cambio de auth. **Corregido:** documentado en el runbook con qué vigilar |

---

## La alternativa que se consideró y se rechazó

**Propuesta:** distinguir "clave `role` ausente" (→ caer a `app_users`, nadie pierde acceso)
de "clave presente y null" (→ denegar, restaura la revocación). Elimina la precondición
bloqueante entera.

**Rechazada.** Su seguridad depende de un hecho no verificado: si GoTrue, ante
`updateUserById(id, {app_metadata: {role: null}})`, **almacena** el null o **borra la clave**.
Si la borra, "revocado" y "nunca aprovisionado" son indistinguibles, el fallback a `app_users`
se activa y **la revocación vuelve a no revocar** — el P0 exacto que se está arreglando. La
opción fail-closed es correcta bajo cualquiera de los dos comportamientos; la alternativa solo
bajo uno. Para un arreglo cuyo objetivo es que la revocación funcione, no se elige el diseño
cuya corrección depende de un detalle que nadie ha comprobado.

El coste aceptado es real y está acotado por el runbook: el corte es duro y quien no tenga
rol en `app_metadata` pierde acceso en el despliegue.

---

## Lo que no se pudo refutar

- **KAC-1** — el mecanismo central. Es lo más sólido del cambio.
- **Sin regresión de rendimiento:** el camino antiguo hacía `getUser()` **más** un
  round-trip a `app_users`; el nuevo hace solo `getUser()`.
- **El cambio de `openId` es seguro:** tenía un único consumidor vivo, corregido en este
  mismo diff para coincidir con sus tres hermanos `p_actor`.
- **Sin regresiones en la suite:** el baseline previo al cambio y el posterior tienen
  exactamente los mismos 4 tests rojos en los mismos 7 ficheros (todos por falta de `.env`).
- **Gate de cobertura:** pasa con margen (branches 74,63 % frente al mínimo de 70), y
  `authenticateRequest.ts` sube de ~0 a 89 % de líneas.

---

## Deuda dejada abierta, con dueño

| Qué | Dónde |
|---|---|
| `handleStorageProxy` sigue haciendo `await` fuera de su `try` — mitigado en origen, no en destino | Lane de `_core`, follow-up |
| `server/db.ts` y `server/_core/sdk.ts` son código muerto y siguen contando para cobertura | Follow-up de retirada, ya anotado en `db.ts` |
| `families.getDeliveryDocuments` llama a `getDb()`, que devuelve `null`, y lanza siempre | Hallazgo lateral, sin relación con esta onda: merece issue propio |
| Los tres handlers REST de `_core/index.ts` comprueban `role !== "admin"`, así que deniegan a `superadmin` | Incoherencia preexistente con `adminProcedure` |
