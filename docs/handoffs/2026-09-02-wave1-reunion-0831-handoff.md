# Handoff — ejecutar la Wave 1 post-reunión 31/08

**Para:** la sesión que ejecuta. **De:** la sesión que planificó (2026-09-01/02).
**Estado:** plan aprobado por Leo. Ninguna línea de código de aplicación escrita todavía.

---

## 1 · Qué hay que hacer

Ejecutar `docs/superpowers/plans/2026-09-01-reunion-0831-wave1.md` (17 tareas, 293 pasos)
en la rama `feat/reunion-0831-wave1`, worktree
`/Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo-reunion-0831`
(creado desde `origin/main` 2283614; `pnpm install` ya hecho).

**Modo de ejecución aprobado por Leo:**

- `superpowers:executing-plans`, **en serie**. El plan lo repite en su cabecera y explica
  por qué: `EnrolledPersonsTable.tsx` lo escriben cuatro tareas y `persons/crud.ts` tres.
  **Prohibido dos tareas a la vez en este worktree.**
- **Dos revisores por tarea**, en este orden y sin saltarse ninguno: primero conformidad
  con la spec (¿construyó lo pedido, ni más ni menos?), después calidad de código. Si el
  revisor encuentra algo, se corrige y se vuelve a revisar. No se pasa a la tarea
  siguiente con hallazgos abiertos.
- **`/codex` al final**, sobre el diff completo de la rama, antes de abrir el PR.
- **Reflexión obligatoria al cerrar** (AGENTS.md §Reflection): evidencia real de comandos,
  lecciones extraídas y ruteadas.

Empezar por el **Step 0** del plan (sonda de entorno). Si Docker o el CLI de Supabase
fallan, las tareas con esquema (5, 14, 15a-d) salen de la wave; el resto sigue.

---

## 2 · Lo que YA está hecho — no rehacer

**PR #206 abierto y verde**, rama `fix/enrolled-default-todos`, worktree
`../repo-fix-filtro`: la tabla de inscritos abre en «Todos» en vez de «Activo».
Corregía un fallo vivo en producción (Cocina mostraba «0» con 23 inscritos).

⚠️ **Solapa con la Task 16**, que incluye ese mismo cambio de defecto.
Antes de ejecutar la Task 16: comprobar si #206 está mergeado
(`gh pr view 206 --json state`). Si lo está, rebasar esta rama sobre `origin/main` y
**saltar** el paso del defecto en la Task 16 (los filtros por eje SÍ se hacen).
Si no lo está, ejecutar la Task 16 entera y avisar a Leo del conflicto al mergear.

---

## 3 · Estado real de producción (consultado el 2026-09-02, no deducido)

Verificar de nuevo si pasan días — esto es una foto, no una verdad permanente.

| Hecho | Valor | Por qué importa |
|---|---|---|
| Migraciones aplicadas | al día con `main` (`20260831120001`) | El desfase que documenta `docs/runbooks/aplicar-migraciones-pendientes-prod.md` **ya está resuelto**; ese runbook es historia, no estado |
| Roles | 8 admin, 1 superadmin | Toda la Task 15 es superadmin-only ⇒ invisible para el equipo. La Task 13 quitaría campos a los 8 admins |
| Personas | 83 (43 del 31/08, 40 del 01/09) | Base recién limpiada; el equipo está dando altas AHORA |
| Cursos con inscritos | `2026_09_coc` Cocina 23 · `26_09_cam` Camarero 13 · `26_09_espanol` 27 · `26_29_pan` 18 | Son los del proceso de selección del martes 8 |
| Embudo de esos cursos | ya configurado, **sin `activo`** | La Task 1 es no-op para Cocina y Camarero; afecta a Español, HH.DD y O.L. |
| `config.programacion` / `config.location_id` | **NULL en todos los programas** | Por eso «Generar calendario» produce cero sesiones hoy → Task 17 |
| Ubicaciones | 3 (Comedor Sede Central · Punto Calle Opera · La Canada) | Las que ofrece el modal de la Task 17 |
| Consentimiento `comunicaciones_whatsapp` | 60 `false` / 23 `true` | Por eso la Task 10 reparte teléfonos por consentimiento |

Consultas de lectura vía MCP de Supabase (solo lectura). **Escrituras en producción: sólo Leo.**

---

## 4 · Prioridad: el 8 de septiembre

El proceso de selección de cocina y camarero arranca el **martes 8**. Lo que ese día
necesita, por orden de valor:

1. **Task 17 — modal de «Generar calendario».** Decisión de Leo (2026-09-02): se construye
   el modal en vez de ejecutar el SQL manual. Sin esto no hay lista de asistencia el martes.
   La §2 del runbook (Apéndice A, 38 marcadores `[INPUT-LEO]`) queda como **plan B**.
2. Tasks 1, 2, 12, 10, 16 — estados, chips, cambio en bloque, contactos, filtros.
3. Task 3 — rastro de quién retira una ficha. Independiente.

Ninguna de esas toca esquema, así que pueden llegar a producción sin Leo.

---

## 5 · Decisiones abiertas que BLOQUEAN tareas

No inventar una respuesta. Si Leo no ha contestado al llegar a la tarea, saltarla y seguir.

| Pregunta | Bloquea | Default si no hay respuesta |
|---|---|---|
| ¿Quién aplica migraciones en producción entre el 02/09 y el 08/09? | 5, 14, 15a-d | Asumir que nadie ⇒ esas tareas fuera de la wave |
| ¿El bucket de documentos acepta PDF o sólo imagen? (la plantilla firmada dice «una fotografía de mi documento de identidad») | 15a-d | Sólo jpeg/png/webp: ampliar después es un `UPDATE`, encoger después es una migración de reparación |
| ¿Quién debe ver `recorrido_migratorio` y `notas_privadas`? | 13 | No ejecutar: con 8 admins y 1 superadmin, tal como está hace lo contrario de lo pedido |

Las otras 21 decisiones abiertas están en el **Apéndice B** del plan, agrupadas por ronda.
Ninguna bloquea: cada una lleva la elección que tomó su autor.

---

## 6 · Reglas que ya han fallado en este repo — no repetirlas

- **Los `git add` con lista explícita esconden ficheros.** Antes de cada commit:
  `git status --short`, leer la salida entera, añadir sólo lo del bloque **Files:** de esa
  tarea. En esta máquina hay además un auto-commit que agrupa ediciones por su cuenta.
- **Un test que copia una constante en vez de importarla no prueba nada.** Pasó en
  `enrollmentStatusFilter.test.ts`: replicaba el valor por defecto, así que cambiar el
  componente no rompía ningún test. Si un test afirma algo sobre el código, que lo lea
  del código.
- **Un import de un export inexistente llega como `undefined` y las aserciones pasan
  solas.** Verificado en este repo: un test escrito contra un export que aún no existía
  pasó en verde. Si el test depende de un export nuevo, comprobar explícitamente que
  existe (`expect(Object.keys(mod)).toContain("X")`).
- **`pnpm test` local puede significar «saltado», no «pasado»** (los tests con DB se
  auto-saltan). `gh pr checks` es el veredicto.
- **Versiones de migración únicas**: dos tareas de este mismo plan reclamaban
  `20260901100000`. Ya corregido, pero comprobarlo antes de push:
  `ls supabase/migrations | cut -d_ -f1 | sort | uniq -d` debe salir vacío.
- **Tipos generados**: nunca editar `client/src/lib/database.types.ts` a mano; receta
  canónica en AGENTS.md (`--db-url` + `--schema public`, nunca `--local` a secas).
- **`max-lines` 300 es ERROR.** Ficheros al límite hoy: `PersonsFilterBar.tsx` 298,
  `Personas.tsx` 281, `EnrolledPersonsTable.tsx` 272 (tras #206).
- **La suite local tiene rojos preexistentes** (timeouts, env ausente). Cada paso del plan
  corre sólo los tests del fichero que toca; no interpretar un rojo ajeno como regresión.

---

## 7 · Contexto de producto que no está en el código

- El plan cubre lo desbloqueado de la reunión. **Fuera de alcance, deliberadamente**, por
  depender de una decisión jurídica o de producto: meter la documentación en el
  consentimiento obligatorio (Art. 7(4)); ampliar la lectura de documentos a `admin`
  (contradice la plantilla v1.0 ya firmada); renombrar «Retirar» → «Eliminar»; retirar
  los programas de Jurídica y Administrativa de las altas; el campo de observaciones
  médicas (Art. 9); y el recorte del catálogo IRPF.
- **Las intervenciones NO son derivaciones** (Leo, 02/09). La Task 14 permite registrarlas
  desde la ficha, sin pasar por el circuito de derivación.
- **«Informes» es una sección de la barra lateral** (Leo, 02/09), no una herramienta
  escondida. El módulo de informes ya existía completo dentro de una pestaña del programa
  de familias; la Task 11 lo saca a la luz sin reconstruirlo.
- Documentos para el equipo, ya entregados a Leo y fuera del repo:
  `reference/comunicados/2026-09-01-actualizacion-equipo.md` y
  `reference/comunicados/2026-09-01-guia-rapida-bocatas-digital.md`.
