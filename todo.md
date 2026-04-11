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
