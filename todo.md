
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

## UX: Mejorar flujo de lista de distribución en Programa Familias (2026-06-04)
- [x] Renombrar sub-tab "Repartos" → "Lista de distribución" en familias-tab/index.tsx
- [x] Agregar empty state con CTA claro en RepartoTab cuando no hay repartos
- [x] Renombrar tab "Listado interno" → "Lista de distribución" en RepartoTab
- [x] Agregar descripción contextual al botón "Nuevo reparto" en empty state
- [x] Tests TDD para verificar los cambios de labels y empty state (4 tests pasan)

## UX: Refactorización arquitectural — tab nivel superior (2026-06-04)
- [x] Mover "Lista de distribución" al nivel superior de ProgramTabs (junto a Familias, Mapa, Reports, Uploads, Derivar)
- [x] Eliminar doble fila de tabs en FamiliasTab (ya no tiene sub-tabs)
- [x] Agregar "repartos" al tipo ProgramTab, PROGRAM_TABS y ENABLED_TABS en useTabParam.ts
- [x] Tests TDD actualizados para la nueva arquitectura (6 tests pasan + 7 ProgramaDetalle = 13 total)

## GitHub Sync — PRs #68, #69, #70 (2026-06-05)
- [x] Clonar repo GitHub y comparar con Manus (68 archivos diferentes)
- [x] Copiar 68 archivos de GitHub PRs #68, #69, #70 al proyecto Manus
- [x] Corregir TypeScript errors: buildTemplateCsv, fieldsToLegacyRow, imports
- [x] Actualizar tests de contrato (ProgramTabs, useTabParam) para reflejar 6 tabs
- [x] Aplicar 6 migraciones SQL de Supabase (aplicadas via Supabase MCP apply_migration)
- [x] Tests de integración: confirm-legacy-import-upsert (6 tests) — PASAN tras aplicar migraciones
- [x] Tests de integración: enrich-informes-rpc (2 tests) — PASAN tras aplicar migraciones

## Bug: getEligibleFamilies Bad Request con >100 familias + informes-import empty-array guard (2026-06-06)
- [x] Reemplazar 3 queries .in() encadenadas en getEligibleFamilies por RPC get_eligible_families_for_reparto
- [x] Migración SQL: CREATE OR REPLACE FUNCTION get_eligible_families_for_reparto (aplicada a Supabase)
- [x] Guard en informes-import.ts: numeros.length > 0 antes del loop .in("legacy_numero", chunk)
- [x] Guard en informes-import.ts: foundIds.length > 0 antes del loop .in("familia_id", chunk)
- [x] Enriquecer logs de error con message/details/hint en ambos probes (families + familia_miembros)
- [x] Reescribir tests de getEligibleFamilies para reflejar contrato RPC (4 tests nuevos)
- [x] Refactorizar mock: rpcResult:unknown → rpcResults:Record<string,unknown> (fix rows.map bug)
- [x] Suite completa: 2756 tests pasan, 0 fallos, TypeScript 0 errores

## Bugs sesión 2026-06-06 (batch 2)
- [x] GitHub push bloqueado por secret scanning en commit 4bbf75a (.project-config.json con AWS keys + GH PAT) — fix: git-filter-repo eliminó el archivo de todo el historial + force-push
- [x] Mapa de distritos no funciona (GeoJSON placeholder vacío) — fix: GeoJSON real de Madrid (21 distritos, Overpass API) subido a S3 + storage proxy + useEffect en MapaTab
- [x] Delete Lista de Distribución (solo borrador) — fix: procedure deleteRound (soft-delete, guard borrador) + hook useDeleteReparto + AlertDialog en RepartoList
- [x] Corregir cálculo "Nuevos este mes" (usaba fecha_inicio en lugar de created_at) — fix: SQL migration get_programs_with_counts usa pe.created_at
- [x] TRPCClientError: Error consultando miembros existentes (PROBE_CHUNK_SIZE=500 supera límite URL PostgREST) — fix: PROBE_CHUNK_SIZE 500→100
- [x] Suite completa: 2760 tests pasan, 0 fallos, TypeScript 0 errores

## Features sesión 2026-06-06 (batch 3)
- [x] Mapa: heatmap choropleth real con densidad de familias estilo Cole Nusbaumer (colores secuenciales, leyenda, sin OSM tiles de fondo)
- [x] Delete Lista de Distribución: ampliar a todos los estados (no solo borrador), con log de auditoría en tabla audit_log (admin only)
- [x] Reporte de errores/avisos de "Enriquecer familias con Informes Sociales" (descarga Excel/CSV)
- [x] Reporte de familias OK-pero-fallidas en upload Padrón (familias que pasan validación pero fallan en upsert)
