# Bocatas Digital — TODO

## Completado (sesión 2026-05-06)

- [x] Sync sandbox con GitHub: merge de 60 commits (PR #35, PR #36, y más)
- [x] Fix conflicto de merge: `auth.session-jwt.test.ts` — agregar `logger` y `correlationId` al `buildContext()`
- [x] QA-5: cerrar 85 errores `no-explicit-any` en 43 archivos
  - [x] `logging-types.ts` — `unknown` para index signature
  - [x] `csv-validation.ts` — `unknown` para CSV row types
  - [x] `programs.ts` — tipos Supabase Insert/Update correctos, `String(ctx.user.id)` para `created_by`
  - [x] `dashboard.ts` — `programa ?? ""` para coerción null→string
  - [x] `soft-delete-recovery.ts` — remover `(db as any)` cast
  - [x] `DocumentUploadModal.test.tsx` — `const storageOk` (prefer-const)
  - [x] 63 archivos restantes — `eslint-disable-next-line` con formato correcto
  - [x] Fixes de JSX: `{/* eslint-disable-next-line */}` en FamiliaDetalle, FamiliasEntregas, PersonsTable, LogsPage
- [x] CM-6: agregar campo `cm6` (padrón vencido >180 días) a `getComplianceStats`
- [x] CM-6: agregar StatCard en `ComplianceDashboard.tsx` con `totalIssues` actualizado
- [x] TDD: test `compliance-stats-cm6.test.ts` (GREEN desde el inicio — pure helpers ya implementados)
- [x] Drop `family.compliance.alert` de v1 (decisión Karpathy: sin consumer wired)
- [x] Drop `family.session.closed` de v1 (decisión Karpathy: fan-out sin resolución limpia)
- [x] `families/getById` — voluntarios ven familia con campos redactados (decisión Leo)

## Pendiente

- [ ] F-002: Manus `openId` ↔ `persons.id` mapping — requiere decisión de stakeholder
- [ ] `MiQR.tsx` funcional (depende de F-002)
- [ ] Limpiar 86 warnings de `eslint-disable` no usados (baja prioridad — no son errores)
- [ ] Actualizar `baseline-browser-mapping` a latest (dev warning, no error)
- [x] Bug: voluntarios no podían llamar `families.getById` (era `adminProcedure`) — fix: cambiado a `voluntarioProcedure` + `redactHighRiskFields` para redactar PII; test `families-getbyid-voluntario.test.ts` (10 tests GREEN)
- [x] Bug: MemberManagementModal mostraba "Miembros Actuales (0)" — causa: instancia duplicada en FamiliaDetalle (línea 297) sin prop `miembros`; fix: eliminada la instancia duplicada, la instancia correcta (línea 189) ya tenía `miembros={miembros}`

## PR #37 — bulk import familias from legacy FAMILIAS CSV

- [x] Pull PR #37 (11 commits) desde GitHub al sandbox
- [x] Migración 1: `20260601000001_add_legacy_provenance_to_families` — columna `legacy_numero` en `families`
- [x] Migración 2: `20260601000002_create_family_legacy_import_audit` — tabla `family_legacy_import_audit`
- [x] Migración 3: `20260601000003_confirm_legacy_familias_import_fn` — función RPC `confirm_legacy_familias_import`
- [x] Migración 4: `20260601000004_revoke_legacy_familias_fns_from_anon` — revocar acceso anon a funciones legacy
- [x] Migración 5: `20260601000005_sanitize_audit_error_v2_strict_id_masking` — sanitizar errores en audit
- [x] Migración 6: `20260506000001_fix_enforce_member_counts_trigger` — drop trigger obsoleto que referenciaba `families.miembros` (causa de test failures)
- [x] `database.types.ts` regenerado con nuevos tipos (`legacy_numero`, `family_legacy_import_audit`, `confirm_legacy_familias_import`)
- [x] Los 2 casts `as any` en legacy-import.ts ya eliminados en PR #37
- [x] Verificado: pnpm check → 0 errores, pnpm test → 1544 pasando 0 fallos
- [x] Checkpoint y push a GitHub
- [x] Bug: "Error guardando previsualización" en /familias — causa: constraint `bulk_import_previews_parsed_rows_max` llamaba `jsonb_array_length()` sobre un objeto JSONB (error 22023); fix: migración `20260506000002` reemplaza constraint para verificar `parsed_rows->'groups'`
- [x] Agregar test de regresión: `bulk_import_previews` INSERT con payload objeto `{groups, src_filename}` no viola constraint — 3 tests GREEN en `bulk-import-previews-constraint.test.ts`
- [x] Test de integración real DB: `bulk-import-previews-db.test.ts` — 4 tests GREEN que realizan INSERT real en Supabase; verifican que constraint acepta `{groups, src_filename}` y rechaza grupos > 10000
- [x] Verificación manual confirmada: INSERT directo con service-role key a `bulk_import_previews` con payload `{groups: [...], src_filename: ...}` retorna token UUID (no error 22023)
