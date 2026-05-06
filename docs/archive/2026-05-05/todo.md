# Bocatas Digital — Historical TODO Log

> **Archived 2026-05-05** (was 1633 lines, distilled to ≤150).
> The original was a chronological work log spanning 2026-04-11 → 2026-04-18 across multiple sprints (Tasks 1–7). Vast majority of items were checked off as work shipped.
> Original: see git history at `cleanup/phase5-docs-and-cleanup`'s parent commit.

## High-level inventory of what shipped

### TASK 1 — Scaffold + Auth (✅ done)
Supabase init, 18 base migrations, RLS, seed data, type generation, secrets configured, login page (Google OAuth + dev email/password), browser client, `useSupabaseAuth` hook with `BocatasRole`, auth callback, `ProtectedRoute` + `LoginGuard` middleware, RBAC enum on routes.

Zod schemas for: auth, persons (48+ fields, no `any`), checkin, dashboard. Zustand store. App shell + nav. Placeholder pages for /personas, /checkin, /dashboard. Edge function for OCR. CI/CD pipeline. GitHub repo wired.

### TASK 2 — Epic A: Person Registration + QR Card (✅ done)
6-step wizard (personal, family, dietary, documents, consents, review), document capture + OCR (DNI extraction), dietary tracking, GDPR consent management. QR generation + scan via html5-qrcode.

### Bug ledger — Auth fixes (✅ all addressed)
Auth fix history (2026-04-11): fixed login race conditions, session cookie issues, redirect loops. Migrated from Supabase native auth to Manus OAuth. Several iteration cycles captured.

### TASK 3 — Epic B: QR Check-in (✅ done)
QR scanner UI, duplicate detection (same program + day → amber card), offline queue + sync on reconnect, manual fallback fuzzy search, demo mode for testing.

### RED-TEAM QA gaps (✅ all closed)
Critical gaps surfaced by red-team review on 2026-04-11. Specific items archived for context — all shipped before 2026-04-14.

### TASK 4 — Epic C: Real-time Dashboard (✅ done)
KPI cards (today / week / month), trend chart (4 weeks), CSV export (anonymized), Supabase Realtime under 5 s latency, mobile-first 360 px minimum layout.

### Smaller features shipped 2026-04-11..18
- `useAbsenceAlerts` — alerts for prolonged absence
- Admin person profile — historial de check-ins
- Dashboard program filter — filtro por programa

### TASK 5 — Epic D: Programs Catalog + Enrollment (✅ done)
Programs CRUD admin UI, enrollment management, foreign key bridge from old ENUM `programa` to new UUID `program_id`.

### TASK 6 — Epic E: Familia Program Workflow (✅ done)
RGPD person-linkage requirement (2026-04-13) — every family member rows must link to a `persons.id` for ARCO compliance. Pre-fill from registry. Module architecture decision (relational `familia_miembros` table replaces JSONB array; ships in canonical migration `20260505000001`).

### TASK 7 — UI/UX Fixes + Role-Split Nav + Announcements (✅ done)
Role-split sidebar nav, novedades (announcements) module: create / edit / list / detail / audit log, urgency banner, bulk CSV import + preview confirmation flow.

### Bug clusters captured (✅ all addressed)
- Role fallback bug (2026-04-13)
- Role-nav systematic debug (2026-04-13)
- Admin bugs systematic debug (2026-04-13)
- QR scanner video sizing (2026-04-13)
- QR full rewrite (2026-04-14)
- UI text cleanup (2026-04-14)
- OCR + logo bug fixes (2026-04-14)
- OCR data persistence (2026-04-14)
- Personas page issues + improvements (2026-04-14)
- Fase Itinerario editability (2026-04-14)
- Landing page updates (2026-04-14)
- Comprehensive audit & review (2026-04-14) — see AUDIT_FINDINGS.md archive
- Consents pages responsiveness (2026-04-14)
- Critical: announcements UUID validation (2026-04-15)
- Familias program improvements (2026-04-15)
- Critical: UUID support in CSV export/import (2026-04-18)

### Logging system (✅ done — see LOGGING_SYSTEM.md archive)
Phase 1: integrate logger into 3 critical procedures (persons.create, families.create, checkin.verifyAndInsert).
Phase 2: `/admin/logs` UI with correlationId / level / userId / message search filters + pagination.
Phase 3: filtering implementation.
Phase 4: CSV export, no PII verified.
Phase 5: 41 logging tests passing.
Phase 6: end-to-end correlationId tracing verified.

## What this log proves

Between 2026-04-11 and 2026-04-18, the project shipped:
- 18+ base migrations + 9 follow-ups
- 4 major epics (A persons, B check-in, C dashboard, D programs)
- 1 large feature (E familia workflow)
- 1 cross-cutting infra (logging system)
- ~30 distinct bug clusters fixed
- Test count grew from ~150 → 800+

It's preserved here as a historical record. For the **current** state, read `README.md` (architecture), the open PR #29 / #30 / #31 / Phase 5 PR for in-flight work, and `mcp__supabase__list_migrations` for the canonical schema history.
