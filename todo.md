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
- [ ] Todos los artefactos commiteados a GitHub
- [ ] CI verde

## Acceptance Criteria
- [x] pnpm build → exit 0 (no warnings)
- [x] pnpm check (typecheck) → 0 errores
- [x] grep -r ": any" src/ → 0 resultados sin guardia
- [x] Tests: 20/20 pass (vitest)
- [x] Code splitting: 7 vendor chunks, main bundle gzip 145KB
- [ ] Dev login funciona con credenciales de prueba (verificar en browser)
- [x] Rutas protegidas redirigen a /login si no hay sesión
- [x] SELECT count(*) FROM programs = 6
- [x] Bucket fotos-perfil existe
- [x] Bucket documentos-consentimiento existe
