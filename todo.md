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
