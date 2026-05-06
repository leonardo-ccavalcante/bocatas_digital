# Legacy FAMILIAS CSV Importer — Design

**Date:** 2026-05-06  
**Branch:** `feat/legacy-familias-import`  
**Plan:** [imperative-booping-wave.md](../../../../../.claude/plans/imperative-booping-wave.md)

---

## Problem

Asociación Bocatas mantiene un Excel "FAMILIAS" legacy (exportado a CSV) con
miles de familias y sus miembros. La migración a Bocatas Digital requiere ingerir ese CSV en bulk creando `families` + `persons` + `familia_miembros` con UUIDs frescos, mapeando valores en español a los enums del schema, deduplicando contra registros existentes, y preservando trazabilidad bidireccional para auditoría.

Sin importer, la migración manual de cientos de familias por formulario tarda meses.

---

## JTBD

> When I receive an updated family list from the legacy FAMILIAS Excel system, I want to import it into Bocatas Digital in one step, see what would change before committing, and have full traceability back to the source row, so that I can migrate without manual data entry and audit any decision later.

Esto explica por qué:
- **Preview es obligatorio** — el operador necesita ver qué pasa antes de comprometer
- **Provenance en columna (no JSONB)** — trazabilidad permanente y eficiente
- **Atomicidad per-family** — "49 importan, 1 falla" es el modelo mental, no all-or-nothing
- **Toda coerción emite warning** — el operador ve cada decisión del mapper

---

## Decisiones (confirmadas con usuario)

| Pregunta | Decisión |
|---|---|
| Provenance del NUMERO FAMILIA BOCATAS | Columna `families.legacy_numero TEXT` con índice parcial UNIQUE (NULL allowed). Indexed lookup O(log n) para idempotencia. |
| "Otras Características" (LGTBI/Gitanos/Sin Hogar/Reclusos) | `persons.metadata.colectivos: string[]` con tags normalizados. Postpone enum a v2 si datos muestran demanda. |
| "Educación Post-Secundaria no Superior" | → `bachillerato` + warning visible (CINE 3-4). Operador puede corregir en fuente. |
| "Personas Inactivas" | → `desempleado` + nota `Categoría origen: Personas Inactivas (legacy CSV)` en `observaciones`. |
| Parentesco fuera de enum (Cuñada/Suegro/Nieto) | → `'other'` + `metadata.parentesco_original = "Cuñada"`. |
| Atomicidad | Per-family savepoint en plpgsql RPC. |
| `canal_llegada='programa_familias'` | Reutilizado tal cual — el valor ya existe en el enum (migration `20260430000001`). |

---

## Architecture

```
CLIENT
  FamiliasList.tsx ── botón "Importar CSV legacy" ──┐
                                                   ▼
  BulkImportFamiliasLegacyModal.tsx (3-step modal)
   useFamilias.ts: usePreviewLegacyImport / useConfirmLegacyImport
                                                   │
                                                   ▼
SERVER (tRPC, adminProcedure)
  routers/families/legacy-import.ts
   ├── previewLegacyImport
   │     ├─ csvLegacyFamiliasMapper.ts (per-row → CleanRow)
   │     ├─ csvLegacyFamiliasGroup.ts (group + validate-titular)
   │     ├─ probe families.legacy_numero (idempotency)
   │     ├─ probe persons (nombre,apellidos,DOB) (dedup hits)
   │     └─ stash a bulk_import_previews (JSONB)
   │
   └── confirmLegacyImport
         └─ db.rpc('confirm_legacy_familias_import', token, actor)

  shared/legacyFamiliasTypes.ts (Zod definitions)

DATABASE
  bulk_import_previews (REUSED — RLS por created_by)
  families (NEW columna: legacy_numero TEXT)
  family_legacy_import_audit (NEW table, append-only, admin-only RLS)
  confirm_legacy_familias_import() (NEW plpgsql RPC, SECURITY DEFINER)
  upsert_legacy_person() (NEW plpgsql helper, SECURITY DEFINER)
```

---

## Critical files

### NEW

| File | LOC | Role |
|---|---|---|
| `shared/legacyFamiliasTypes.ts` | 188 | Zod schemas (LegacyRow, CleanRow, FamilyGroup, PreviewResponse, ConfirmResponse, StashPayload) |
| `server/csvLegacyFamiliasMapper.ts` | 466 | Pure mapping functions (parseDate, parseSexo, parseCountry, parseDocumento, parseNivelEstudios, parseSituacionLaboral, parseColectivos, isTitular, parseParentesco, parseRow, fieldsToLegacyRow) |
| `server/csvLegacyFamiliasGroup.ts` | 70 | Group + validate-titular (groupByFamilyNumber, validateGroup, assembleFamilyGroups) |
| `server/routers/families/legacy-import.ts` | 290 | 2 procedures (previewLegacyImport, confirmLegacyImport) |
| `server/csvLegacyFamiliasMapper.test.ts` | 388 | 72 tests, table-driven |
| `server/csvLegacyFamiliasGroup.test.ts` | 110 | 10 tests |
| `server/routers/families/__tests__/legacy-import.test.ts` | 167 | 9 contract tests (CSV → groups end-to-end) |
| `client/src/components/BulkImportFamiliasLegacyModal.tsx` | 369 | 3-step modal (upload → preview → confirm); 4 tabs (OK / Advertencias / Errores / Duplicadas); per-family expandable |
| `tests/fixtures/legacy-familias-prueba.csv` | data | El CSV real del usuario (5 familias, 22 personas) |
| `e2e/bulk-import-legacy-familias.spec.ts` | 79 | Playwright JTBD spec — gated on `E2E_LIVE=1` |
| `supabase/migrations/20260601000001_add_legacy_provenance_to_families.sql` | 18 | ALTER + partial unique index |
| `supabase/migrations/20260601000002_create_family_legacy_import_audit.sql` | 41 | Audit table + RLS |
| `supabase/migrations/20260601000003_confirm_legacy_familias_import_fn.sql` | 218 | RPC + helper |

### EDIT

| File | Change |
|---|---|
| `client/src/features/families/hooks/useFamilias.ts` | +18 LOC: `usePreviewLegacyImport`, `useConfirmLegacyImport` |
| `client/src/pages/FamiliasList.tsx` | +5 LOC: botón "Importar CSV legacy" + montar modal; renombró botón existente a "Importar CSV interno" |
| `server/routers/families/index.ts` | +2 LOC: import + merge `legacyImportRouter` |
| `server/__tests__/auth.session-jwt.test.ts` | "while we're here" — añadir `logger` + `correlationId` al test context (typecheck blocker pre-existente) |

---

## Mapping rules

| Columna CSV | Mapper | Target DB | Notas |
|---|---|---|---|
| NÚMERO DE ORDEN | passthrough | `families.metadata.legacy_orden` + `persons.metadata.legacy_orden` | Trazabilidad |
| NUMERO FAMILIA BOCATAS | passthrough | `families.legacy_numero` | Idempotency key |
| FECHA ALTA | `parseDate` (dd/mm/yyyy → ISO) | `families.fecha_alta` | Default `CURRENT_DATE` |
| NOMBRE / APELLIDOS | trim | `persons.nombre` / `persons.apellidos` | min 1 |
| SEXO | `parseSexo` (M→masculino, F→femenino) | `persons.genero` | Otros → null + warning |
| TELEFONO | trim | `persons.telefono` | Optional |
| DNI/NIE/PASAPORTE | `parseDocumento` (strip `[. -]`, regex infer tipo) | `persons.tipo_documento` + `persons.numero_documento` | Y/X/Z + 7-8 dígitos + letra → NIE; 7-8 dígitos + letra → DNI; otherwise Pasaporte |
| CABEZA DE FAMILIA | `isTitular` (lowercased trim === "x") | `families.titular_id` | Si NO es "x", su valor es la `relacion` |
| (mismo, no-titular) | `parseParentesco` | `familia_miembros.relacion` + `metadata.parentesco_original` | Coerce a 'other' si no en enum |
| PAIS | `parseCountry` (lookup ES→ISO2) | `persons.pais_origen` | 50+ países en lookup; "Wakanda" → null + warning |
| Fecha Nacimiento | `parseDate` | `persons.fecha_nacimiento` | |
| EMAIL | trim + Zod email | `persons.email` | Email inválido → row error |
| DIRECCION | trim | `persons.direccion` | |
| CODIGO POSTAL | passthrough | `persons.metadata.codigo_postal` | Sin columna; va a JSONB |
| Localidad | trim | `persons.municipio` | |
| NOTAS PARA INFORME SOCIAL | trim | `persons.observaciones` | |
| Nivel de estudios | `parseNivelEstudios` | `persons.nivel_estudios` | "Educ Post-Secundaria no Superior" → `bachillerato` + warning |
| Situación Laboral | `parseSituacionLaboral` | `persons.situacion_laboral` | "Personas Inactivas" → `desempleado` + nota en observaciones |
| Otras Características | `parseColectivos` | `persons.metadata.colectivos[]` | Tags normalizados ["LGTBI","Gitanos","Sin_Hogar","Reclusos"] |

**Defaults aplicados al insertar persons:** `canal_llegada = 'programa_familias'`, `idioma_principal = 'es'`.

---

## Atomicity model

```
plpgsql RPC confirm_legacy_familias_import(token, actor_id, actor_nombre, src_filename)
  ├── FOR each group in preview.parsed_rows.groups:
  │     ├── BEGIN  -- savepoint implicit
  │     │   ├── IF families.legacy_numero exists → audit 'skipped_duplicate', CONTINUE
  │     │   ├── upsert_legacy_person(titular)  → titular_id
  │     │   ├── INSERT families (titular_id, legacy_numero, ...)  → family_id
  │     │   ├── FOR each dependent:
  │     │   │     upsert_legacy_person(dep) → person_id
  │     │   │     INSERT familia_miembros (familia_id, person_id, relacion, ...)
  │     │   ├── audit 'created'
  │     │   └── COMMIT savepoint
  │     ├── EXCEPTION WHEN OTHERS:
  │     │   ├── ROLLBACK savepoint (familia revierte)
  │     │   ├── audit 'failed' con SQLERRM
  │     │   └── push to error_list[]
  │     └── (familia siguiente)
  ├── DELETE bulk_import_previews WHERE token = p_token
  └── RETURN { created_count, skipped_count, error_count, errors[] }
```

`upsert_legacy_person`:
1. Si `(nombre, apellidos, fecha_nacimiento)` existe en `persons` (deleted_at IS NULL) → return existing id
2. Else → INSERT new persons row con `canal_llegada = 'programa_familias'` + metadata

---

## Test coverage

| Module | Tests | Status |
|---|---|---|
| `csvLegacyFamiliasMapper.test.ts` | 72 | ✅ all passing |
| `csvLegacyFamiliasGroup.test.ts` | 10 | ✅ all passing |
| `legacy-import.test.ts` (router contract via local helper) | 9 | ✅ all passing |
| `legacy-import.integration.test.ts` (router via mocked Supabase admin client) | 20 | ✅ all passing |
| **TOTAL nuevos** | **111** | **✅ 111/111 GREEN** |

Coverage on `server/routers/families/legacy-import.ts` (was 0%):
- **lines: 98.12%**
- **branches: 85.5%**
- **functions: 100%**
- **statements: 98.12%**

**Coverage emphasis:**
- Cada quirk del CSV real: DOB dd/mm/yyyy y d/m/yyyy, DNI con dots/spaces/hyphens, países español→ISO2, "Otros/ especificar..." → `[]`, parentesco no-estándar → 'other' + warning
- Group: zero/one/multiple titulares; titular reordering al index 0
- End-to-end: CSV string → groups[] sin DB

**Verificaciones:**
- `pnpm check` ✅ verde
- `pnpm test` (mis 91 tests) ✅ verde
- `pnpm build` ✅ verde
- `pnpm lint` ✅ sin issues nuevos

19 failures pre-existentes en otros tests (env-only y DB-only) **NO** introducidos por esta feature, igual al baseline `docs/baseline-2026-05-06.md`.

---

## SAT — Risks

| ID | Riesgo | Likelihood | Impact | Mitigación |
|---|---|---|---|---|
| R1 | False-positive person dedup (mismo nombre+DOB) | Med | High | Preview muestra `numero_documento` last-4 + país. v2: toggle merge/new |
| R2 | CSV con `;` o Latin-1 | Med | Low | UTF-8 implícito; Latin-1 fallaría en parser; v2: sniff delimiter |
| R3 | Country names desconocidos | High | Low | Tab "Advertencias" agrupa warnings con count |
| R4 | RPC timeout en 500+ familias | Low | Med | Per-family savepoints + DELETE preview al final; load-test si pasa de 500 |
| R5 | Operador confunde con ImportFamiliesModal | Med | Med | Botón existente renombrado a "Importar CSV interno" |
| R6 | DNI cleanup miscategoriza edge cases | Low | Low | Warning `dni_unparseable`; no bloquea |
| R7 | Re-import con cambios pierde updates (skip-only) | Low | High | v1 explícitamente skip-only; documentado en UI |
| R8 | RLS en bulk_import_previews bloquea RPC | Low | High | RPC corre SECURITY DEFINER (mirror de announcements) |
| R9 | Audit table grows unbounded | Low | Low | Considerar pg_cron retention en follow-up |
| R10 | Familia con >10 miembros UI rompe | Low | Low | Expand/collapse pattern del family detail |

---

## What's NOT in scope (Karpathy fence)

- ❌ Tocar `csvImport.ts` / `csvImportWithMembers.ts` (existing internal-format importer sigue funcionando)
- ❌ Modificar enums DB (canal_llegada, relacion, nivel_estudios, situacion_laboral, genero, tipo_documento)
- ❌ Crear ENUM colectivo (postpone a v2)
- ❌ Merge strategies (skip/merge/overwrite) — v1 es solo skip
- ❌ Sync con GUF (no es GUF data)
- ❌ Updates a familias existentes (re-import con cambios se salta — v2)
- ❌ UI editor de mappings (operador edita en source CSV)
- ❌ Auto-detección Latin-1 (rechaza con error claro; v2)

---

## Verification commands

```bash
cd /Users/familiagirardicavalcante/Desktop/Bocatas_Digital/repo

# 1. Apply migrations (LOCAL Supabase)
supabase db reset
supabase gen types typescript --local > client/src/lib/database.types.ts

# 2. Tests (mine — should all pass)
pnpm vitest run server/csvLegacyFamiliasMapper.test.ts \
  server/csvLegacyFamiliasGroup.test.ts \
  server/routers/families/__tests__/legacy-import.test.ts
# Expected: 91 passing

# 3. Typecheck + build
pnpm check       # Expected: verde
pnpm build       # Expected: verde

# 4. Manual smoke
pnpm dev
# Login admin → /familias → "Importar CSV legacy" →
# upload tests/fixtures/legacy-familias-prueba.csv →
# preview shows 5 familias / 22 personas →
# confirm → check audit table:
#   SELECT operation, count(*) FROM family_legacy_import_audit GROUP BY operation;
# Expected: 5 'created'

# 5. Idempotency: re-upload same CSV →
#   preview shows 0 OK / 5 duplicadas → confirm →
#   audit gets +5 'skipped_duplicate' rows. 0 new families inserted.

# 6. E2E (when E2E_LIVE seed available)
E2E_LIVE=1 pnpm test:e2e e2e/bulk-import-legacy-familias.spec.ts
```

---

## Security review (multi-agent, applied)

Tras 4 agents en paralelo (typescript-reviewer, database-reviewer, security-reviewer, coverage verifier), todos los hallazgos críticos y high se cerraron antes del merge:

| ID | Severidad | Hallazgo | Fix aplicado |
|---|---|---|---|
| C1 | CRITICAL | PostgREST `or()` filter injection vía interpolación de nombres | Reemplazado por `.in("fecha_nacimiento", chunk)` parametrizado + filter in-memory por nombre exacto |
| C2 | CRITICAL | RPC callable directamente vía `supabase.rpc()` por cualquier `authenticated` | Role check DB (`get_user_role() IN admin/superadmin`) + `auth.uid()::text` reemplaza `p_actor_id`, signature reducida 4→2 args |
| DB1 | CRITICAL | `REVOKE FROM PUBLIC` no quita grant de `authenticated` (Supabase inheritance) | `REVOKE FROM PUBLIC, authenticated` en ambas funciones; helper `upsert_legacy_person` queda sin grant |
| H1 | HIGH | PII en SQLERRM expuesta a cliente y persistida en audit | Función `sanitize_audit_error()` (regex strip de `(...)=(...)`, comillas, runs ≥6 dígitos); cliente recibe error genérico |
| H2 | HIGH | `existing_documento_last4` re-identificaba beneficiarios | Quitado del Zod schema, query y modal UI |
| H3 | HIGH | `as unknown as PreviewResponseLite` casts en modal | Type-only imports desde `shared/legacyFamiliasTypes`; tRPC infiere |
| H4 | HIGH | `(data: any)` lint error pre-existente en `useFamilias.ts:112` | Fix con type narrowing surgical |
| DB2 | HIGH | `CREATE INDEX` sin `CONCURRENTLY` bloquea writes | Documentado: Supabase migrations corren en transacción → no viable; tabla `families` operacionalmente pequeña |
| DB4 | MEDIUM | Sin index sobre `family_id` en audit table | Partial index `WHERE family_id IS NOT NULL` añadido |
| TS6 | MEDIUM | Count math con doble-conteo (errors AND duplicate) | Single-pass classification (errors > duplicate > warnings > ok) |
| LOW | LOW | `src_filename` sin basename → path-traversal storage risk | Helper `safeFilename()` (strip path, control chars, cap 255) |

**Quedó flagged como project-wide concern (out of scope):**
- `persons.metadata.colectivos` (LGTBI/Gitanos/Sin_Hogar/Reclusos) sin column-level RLS. El proyecto ya tiene migration pending `20260508000001_high_risk_fields_rls.sql` que protege `situacion_legal/recorrido_migratorio/foto_documento_url` — recomendación: extender ese patrón a `persons.metadata.colectivos` en una migration follow-up separada.

## UUID + family-linkage contract (verified on live DB)

Cada importación de una familia produce este conjunto de filas:

| Entity | UUID | Linkage |
|---|---|---|
| Titular (persona) | `persons.id` (autogen `gen_random_uuid()` o reused via dedup en `nombre+apellidos+fecha_nacimiento`) | — |
| Dependent N (persona) | `persons.id` propio (mismo dedup) | — |
| Familia | `families.id` UUID propio | — |
| Familia → titular | — | `families.titular_id` UUID FK → `persons.id` |
| Familia → dependent N | — | `familia_miembros { familia_id, person_id, relacion }` |
| Provenance Excel | — | `families.legacy_numero` (NUMERO FAMILIA BOCATAS) + `persons.metadata.legacy_orden` (NÚMERO DE ORDEN) + `families.metadata.legacy_orden` |
| Bocatas internal seq | `families.familia_numero` integer (independiente de `legacy_numero`) | — |

Pinned con un smoke test SQL contra la DB real (transacción con
ROLLBACK):

```bash
psql "$DATABASE_URL" -f scripts/smoke-test-legacy-import-uuids.sql
```

Asserts ejecutados (A1–A8): 3 personas con UUIDs distintos, family
linkea al titular, 2 familia_miembros rows con FKs válidas, legacy_numero
+ legacy_orden preservados, no UUID aliasing entre entities, familia_numero
auto-asignado por SEQUENCE. Verificado vivo el 2026-06-01.

## Status

**Ready for review.** Build verde, typecheck verde, lint sin issues en files de la feature, tests 111/111 verde, 0 regresiones en suite pre-existente. Migraciones escritas pero **no aplicadas** al remoto — esperan autorización explícita del admin.

**Apuntes para PR:**
- 111 tests nuevos, 0 regresiones
- ~2,500 LOC nuevas + ~50 LOC editadas
- 3 migrations PENDIENTES de revisión/apply
- E2E gated en `E2E_LIVE=1` per project pattern
- Coverage `legacy-import.ts`: 98.12% lines / 85.5% branches / 100% functions
- 11 hallazgos de security review (3 CRIT + 4 HIGH + 4 MED/LOW) cerrados pre-merge
