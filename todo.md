# Bocatas Digital — TODO (TASK 1: Scaffold + Auth)

## Supabase & Database
- [x] Gate 0: 18 migraciones aplicadas (tablas, RLS, seed)
- [x] Migración 19: consent_templates
- [x] Migración 19b: persons ALTER (restricciones_alimentarias + foto_perfil_url)
- [x] Migración 19c: consents ALTER (documento_foto_url + numero_serie)
- [x] Migración 20: programs (6 seed) + ENUM bridge program_enrollments
- [x] Storage bucket: fotos-perfil
- [x] Storage bucket: documentos-consentimiento
- [x] Tipos TypeScript generados desde BD en vivo (database.types.ts — 47088 chars)
- [x] Supabase secrets configurados (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)

## Autenticación
- [x] Login page con Google OAuth (botón principal)
- [x] Login page con email/password fallback (solo development)
- [x] Credenciales dev: voluntario@bocatas.test / BocatasVol2026!
- [x] Supabase browser client (src/lib/supabase/client.ts)
- [x] useSupabaseAuth hook con BocatasRole type
- [x] Auth callback route (/auth/callback)
- [x] Middleware: rutas protegidas → /login si no hay sesión (ProtectedRoute)
- [x] Middleware: /login → / si ya hay sesión (LoginGuard)
- [x] RBAC: requiredRoles en ProtectedRoute para admin/superadmin

## Zod Schemas
- [x] Schema auth (src/features/auth/schemas.ts)
- [x] Schema persons (48+ campos, sin ningún 'any') — PersonCreateSchema, PersonUpdateSchema, OcrExtractedSchema
- [x] Schema checkin (src/features/checkin/schemas.ts)
- [x] Schema dashboard (src/features/dashboard/schemas.ts)

## Store Global
- [x] Zustand store (src/store/useAppStore.ts) con selectedLocation y pendingQueue offline
- [x] Store persistido en localStorage (bocatas-app-store)

## App Shell & Navegación
- [x] AppShell component con sidebar amber-900
- [x] Sidebar: Inicio, Personas, Check-in, Dashboard (admin+), Admin (superadmin+), Salir
- [x] Selector de sede (location) en sidebar, persistido en Zustand
- [x] Home dispatch tiles: Registrar persona, Check-in comedor, Consultar ficha (todos los roles)
- [x] Home dispatch tile: Dashboard (solo admin/superadmin)
- [x] Tiles con icono + label + descripción, keyboard navigation

## Páginas Placeholder
- [x] /personas → toast "Próximamente"
- [x] /checkin → toast "Próximamente"
- [x] /dashboard → toast "Próximamente"
- [x] /admin/consentimientos → toast "Próximamente"

## Edge Function OCR
- [x] supabase/functions/extract-document/index.ts
- [x] Provider-agnostic: AI_PROVIDER env var (manus | openai | anthropic)
- [x] Graceful degradation: fallo → { success: false, data: {} }
- [x] Auth JWT validation en la Edge Function

## CI/CD
- [x] .github/workflows/ci.yml (lint + typecheck + test + build en cada PR)
- [x] lighthouserc.json (performance ≥ 0.95, accessibility ≥ 0.95)

## GitHub
- [x] Todos los artefactos commiteados a GitHub (commit 67a6ec8, 103 files)
- [ ] CI verde (verificar en GitHub Actions)

## Acceptance Criteria
- [x] pnpm build → exit 0 (no warnings)
- [x] pnpm check (typecheck) → 0 errores
- [x] grep -r ": any" src/ → 0 resultados sin guardia
- [x] Tests: 47/47 pass (vitest)
- [x] Code splitting: vendor chunks, main bundle gzip <200KB
- [x] Rutas protegidas redirigen a /login si no hay sesión
- [x] SELECT count(*) FROM programs = 6
- [x] Bucket fotos-perfil existe
- [x] Bucket documentos-consentimiento existe

## TASK2 — Epic A: Person Registration + QR Card

### Phase A — Schemas & Utilities
- [x] PersonCreateSchema completo (48+ campos, sin any, alineado a DB enums exactos)
- [x] OcrExtractedSchema con OcrTipoDocumentoSchema (lowercase para LLM)
- [x] ConsentTemplateSchema + OCRResultSchema + ProgramSchema + DuplicateCandidateSchema
- [x] imageUtils.ts: compressImage() (canvas, max 800px, 80% JPEG)
- [x] imageUtils.ts: base64ToBlob() (Node+Browser compatible, strips data URL prefix)
- [x] imageUtils.ts: base64ToFile()

### Phase B — Hooks
- [x] useCreatePerson.ts (Supabase INSERT persons + Storage upload)
- [x] usePersonById.ts (Supabase SELECT by id)
- [x] useSearchPersons.ts (búsqueda por nombre)
- [x] useDuplicateCheck.ts (fuzzy ≥0.70 similarity via RPC find_duplicate_persons)
- [x] useOCRDocument.ts (Edge Function extract-document)
- [x] useConsentTemplates.ts (consent_templates table)
- [x] usePrograms.ts (programs table, staleTime 5min)
- [x] useEnrollPerson.ts (program_enrollments INSERT)

### Phase C — Registration Wizard
- [x] RegistrationWizard.tsx (7 pasos, progress bar, step validation)
- [x] DocumentCaptureModal.tsx (camera OR gallery + compress + OCR)
- [x] OCRConfirmationCard.tsx (campos extraídos editables)
- [x] DuplicateWarningCard.tsx (dos CTAs: ir al perfil / crear nueva)
- [x] OCR tipo_documento normalization (lowercase → DB uppercase)

### Phase D — Consent & Storage
- [x] ConsentModal.tsx (Group A required, Group B optional, bilingüe desde DB)
- [x] Storage flow: documentos-identidad + fotos-perfil + documentos-consentimiento

### Phase E — Profile & QR
- [x] PersonCard.tsx (perfil 360°: 4 tabs, fase badge, dietary badge, foto, programas)
- [x] QRCodeCard.tsx (QR = UUID only, dietary badge, printable)
- [x] Ruta /personas/nueva
- [x] Ruta /personas/:id
- [x] Ruta /personas/:id/qr

### Phase F — Admin Pages
- [x] AdminProgramas.tsx (/admin/programas, superadmin only)
- [x] Ruta /admin/programas en App.tsx + AppShell sidebar

### Phase G — Tests & QA
- [x] server/task2.test.ts (27 tests: schemas, imageUtils, duplicates, programs)
- [x] server/bocatas.test.ts (19 tests: TASK1 schemas, env vars)
- [x] server/auth.logout.test.ts (1 test)
- [x] Total: 47/47 tests passing
- [x] pnpm build → exit 0 (no warnings)
- [x] pnpm check → 0 errores TypeScript
- [x] ESLint → 0 errores, 0 warnings en código Bocatas
- [x] Red Team: 12 bugs encontrados y corregidos
- [x] Commit + push GitHub (TASK2 — commit 6c3f43f, 30 files, +3098 lines)

## Bugs Reportados — Auth Fix

- [ ] Habilitar Google OAuth en Supabase (Client ID + Secret de Google Cloud Console)
- [ ] Configurar redirect URL en Supabase: https://bocatasdg-mvcpdsc2.manus.space/auth/callback
- [ ] Reemplazar formulario email/password (dev-only) por Magic Link universal en producción
- [ ] Login page: mensaje claro para nuevos usuarios ("Se creará tu cuenta automáticamente")
- [ ] Verificar flujo completo: OAuth → callback → home

## Auth Migration — Manus OAuth

- [ ] Reemplazar Login.tsx con Manus OAuth (getLoginUrl + useAuth hook del template)
- [ ] Actualizar ProtectedRoute.tsx para usar useAuth() en lugar de useSupabaseAuth
- [ ] Actualizar AppShell.tsx para usar useAuth() y logout de tRPC
- [ ] Actualizar Home.tsx para usar useAuth() para role-gating de tiles
- [ ] Eliminar dependencia de useSupabaseAuth en todos los componentes
- [ ] Verificar flujo: login → callback → home → sidebar con rol correcto

## Bugs Registro (2026-04-11)
- [x] BUG 1: Integrar DocumentCapture+OCR dentro del Step 2 (Documento) — eliminar modal separado del Step 1
- [x] BUG 2: Corregir error de navegación entre pasos (trigger en campos opcionales / validación completa)
- [x] BUG 3: Mover insert de personas a tRPC procedure con service role key (bypass RLS para Manus OAuth)
- [x] BUG 3b: Mover enrollPerson a tRPC procedure con service role key
- [x] BUG 3c: Mejorar mensaje de error en onSubmit (mostrar error real de Supabase)
- [x] BUG 4: Fecha de nacimiento — display en DD/MM/YYYY (PersonCard, OCRConfirmationCard, DuplicateWarningCard). DB sigue recibiendo YYYY-MM-DD (ISO, correcto).
- [x] BUG 5: CHECK constraint persons_pais_origen_check — el campo pais_origen tiene un enum/check en DB que rechaza texto libre. Investigar y corregir (cambiar a text libre o usar enum correcto).
- [x] BUG 6: CHECK constraint persons_telefono_check — campo vacío se envía como "" en lugar de null. Sanitizar todos los campos opcionales de texto antes del insert.
- [x] FIX 7: Mover selección de programa al Step 0 — bloquear submit si no hay programa seleccionado (programa es obligatorio)
- [x] FIX 8: Integrar RGPD obligatorio como paso del wizard — consentimientos Bocatas + Banco de Alimentos, obligatorio para todos los programas
- [x] FIX 9: Soporte de miembros familiares adicionales para programa Familias (flujo post-titular en el wizard)
- [x] FIX 10: Poblar consent_templates en DB con plantillas reales de RGPD (Bocatas + Banco de Alimentos)

## QA Gaps (2026-04-11 pre-checkpoint)
- [x] QA-1: Confirmar en código que submit está bloqueado si no hay programa seleccionado (validación Zod + UI error state)
- [x] QA-2: Confirmar lógica RGPD: Group A bloquea creación; consentimientos dinámicos por programas seleccionados
- [x] QA-3: Tests para flujo de familia: step condicional aparece, valida campos, llama createFamily
- [x] QA-4: Persistir seed de consent_templates como script en repo (drizzle/seeds/consent_templates.sql)

## Epic B — QR Check-in (Task 3)
- [x] DB: verificar/crear tabla attendances con unique constraint (person_id, location_id, programa, checked_in_date)
- [x] DB: verificar/crear view persons_safe
- [x] DB: verificar/crear tabla locations con 3 sedes (Sede Central, Ópera, La Cañada)
- [x] DB: seed Maria Garcia Lopez con restricciones_alimentarias = 'Sin gluten'
- [x] Backend: tRPC router checkin (verifyAndInsert, searchPersons, getLocations, anonymousCheckin)
- [x] Frontend: XState machine (8 estados: idle, scanning, verifying, registered, duplicate, not_found, error, offline)
- [x] Frontend: useCheckinStore Zustand (locationId, programaId, pendingQueue, flushQueue)
- [x] Frontend: hooks (useCheckin)
- [x] Frontend: QRScanner component (html5-qrcode)
- [x] Frontend: ResultCard (green/amber/red/grey + dietary badge)
- [x] Frontend: ManualSearchModal (fuzzy search < 2s)
- [x] Frontend: LocationSelector + ProgramSelector (same row)
- [x] Frontend: DemoModeBanner (toggle switch)
- [x] Frontend: OfflinePendingBadge (count while queue > 0)
- [x] Frontend: /checkin page con offline queue flush on reconnect
- [x] Tests: XState machine (todos los estados y transiciones)
- [x] Tests: duplicate prevention (same program = amber, different program = green)
- [x] Build: npm run build verde
- [x] Push a GitHub con handoff template (commit a41e2e0, 18 files, +1970 lines)

## RED TEAM QA — Critical Gaps Found (2026-04-11)
- [x] GAP 1 CRÍTICA: ProgramSelector hardcoded — FIXED: ahora carga de programs table via tRPC
- [x] GAP 2 CRÍTICA: checked_in_at field falta en attendances — FIXED: migración SQL creada
- [x] GAP 3 CRÍTICA: useOnlineStatus() no reactivo — FIXED: agregados listeners online/offline
- [x] GAP 4 MEDIA: Persistir locationId + programa en Zustand — FIXED: store v2 persiste ambos
- [x] GAP 5 BAJA: Deshabilitar botones si no hay locationId — YA IMPLEMENTADO
- [x] BUG: Invalid UUID error — FIXED: validacion UUID en useCheckin antes de API call
- [x] BUG: Stale state in useEffect — FIXED: cambiar dependencias de [state.value] a [state, isOnline]
