
## Feature: Herramientas de importación/exportación en tab Uploads
- [x] Agregar sección 'Herramientas de datos' en uploads-tab/index.tsx con ExportFamiliesModal, ImportFamiliesModal, BulkImportFamiliasLegacyModal
- [x] Test TDD: verificar que los 3 botones están presentes en el tab Uploads


## Mobile responsiveness — sesión 2026-05-22
- [x] PersonsFilterBar: chips de filtro siguen desbordándose — contenedor sin w-full + ToggleGroup sin shrink-0
- [x] PersonaHeader: UUID sin truncate fuerza al header sticky a ser más ancho que el viewport
- [x] Tipografía: auditar y corregir usos inconsistentes de text-sm/text-lg/font-bold vs design tokens

## Tipografía — auditoría global (estrategia quirúrgica)
- [x] AdminProgramas.tsx: migrar h1 a text-h2
- [x] AdminSoftDeleteRecovery.tsx: migrar h1 a text-display-2
- [x] AdminUsuarios.tsx: migrar h1 a text-h2
- [x] FamiliasEntregas.tsx: migrar h1 a text-display-2 + KPI numbers a text-display-1
- [x] FamiliasInformesSociales.tsx: migrar h1 a text-display-2
- [x] FamiliaHeader.tsx: migrar KPI stats a text-h3
- [x] ComplianceDashboard.tsx: migrar KPI value a text-display-1
- [x] ProgramCard.tsx: migrar KPI stat a text-h3
- [x] Agregar test de regresión para verificar páginas principales usan design tokens (13 tests en typography.consistency.test.tsx)


## Bug: Programa Familias no permite insertar nuevas familias (sesión 2026-05-24)
- [x] Agregar header con botón "Nueva familia" a FamiliasList.tsx (dentro de ProgramTabs)
- [x] Botón debe enlazar a /familias/nueva
- [x] Agregar test para verificar que el botón está presente en el tab de familias (4 tests pasan)
- [x] Condicionar botón por isAdmin (mismo patrón que otros programas)
- [x] Verificar que el flujo de creación funciona correctamente desde el programa
