# Novedades Authoring Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement PR #17 — a full authoring pipeline for the Novedades (announcements) feature: multi-rule audience targeting, urgency banner, bulk CSV import, per-field audit log, and 8 DB migrations.

**Architecture:** Schema-first — apply 8 Supabase migrations before touching any code. The server layer is a single `server/routers/announcements.ts` file (1217 lines) that replaces the existing 227-line stub. Pure helper functions live in `server/announcements-helpers.ts` and are tested in isolation. The client layer adds 3 new components, expands the hooks file to 11 hooks, and updates 5 existing pages/components.

**Tech Stack:** React 19 + Tailwind 4 + tRPC 11 + Supabase PostgreSQL (admin client via `createAdminClient()`). Vitest for tests. `@shared/announcementTypes` alias for the shared enum/type file.

---

## Karpathy Pre-Flight Checklist

Before starting:
- **Assumption 1:** `announcements` table exists in Supabase but has `roles_visibles text[]` and `tipo text` (not enum). Migrations 1–3 will evolve this.
- **Assumption 2:** `announcement_audiences`, `announcement_audit_log`, `announcement_dismissals`, `announcement_webhook_log`, `bulk_import_previews` tables do NOT yet exist.
- **Assumption 3:** `@shared/*` alias is already configured in `tsconfig.json` and `vite.config.ts`.
- **Assumption 4:** `adminProcedure` already exists in `server/_core/trpc.ts` (used by existing admin routes).
- **Surgical rule:** Only touch files listed in "Files" per task. Do not refactor adjacent code.
- **Single source of truth:** `shared/announcementTypes.ts` is the canonical enum — never duplicate values.

---

## File Structure

**New files to create:**
```
shared/announcementTypes.ts                          ← Canonical tipo enum + AudienceRule type
server/announcements-helpers.ts                      ← Pure helpers: isVisibleToUser, diffForAudit, shouldFireWebhook, parseAudienciasDSL, validateBulkRow
server/__tests__/announcementVisibility.test.ts      ← 16 tests for isVisibleToUser
server/__tests__/announcementAudit.test.ts           ← 22 tests for diffForAudit
server/__tests__/announcementWebhook.test.ts         ← 6 tests for shouldFireWebhook
server/__tests__/announcementDSL.test.ts             ← 14 tests for parseAudienciasDSL
server/__tests__/announcementBulkRow.test.ts         ← 25 tests for validateBulkRow
client/src/components/UrgentAnnouncementBanner.tsx   ← Dismissable banner for /inicio
client/src/components/CrearNovedadButton.tsx         ← Admin-only entry point on /novedades
client/src/components/BulkImportNovedadesModal.tsx   ← 3-step CSV import modal
client/public/novedades-bulk-template.csv            ← 8-column CSV template
docs/novedades-bulk-import-guide.md                  ← Spanish author guide
scripts/create_announcement_images_bucket.sh         ← S3 bucket creation script
supabase/migrations/ (8 files)                       ← DB migrations
```

**Files to replace entirely:**
```
server/routers/announcements.ts                      ← 227 lines → 1217 lines (full authoring pipeline)
client/src/features/announcements/hooks/useAnnouncements.ts  ← 3 hooks → 11 hooks
client/src/lib/database.types.ts                     ← Add 5 new table types + es_urgente column
```

**Files to modify surgically:**
```
client/src/App.tsx                                   ← Convert eager imports to lazy + add Perfil/MiQR lazy
client/src/components/layout/AppShell.tsx            ← Add "Administrar novedades" nav item
client/src/pages/Home.tsx                            ← Add UrgentAnnouncementBanner above greeting
client/src/pages/Novedades.tsx                       ← Add tipo chips, urgente badge, CrearNovedadButton
client/src/pages/AdminNovedades.tsx                  ← Migrate form to new tipo enum + es_urgente + audiences
```

---

## Task 1: Shared Types — `shared/announcementTypes.ts`

**Files:**
- Create: `shared/announcementTypes.ts`

**Verifiable success:** `pnpm check` still passes; `grep -r "ANNOUNCEMENT_TYPES" shared/` returns the new file.

- [ ] **Step 1: Create the shared types file**

```typescript
// shared/announcementTypes.ts
export const ANNOUNCEMENT_TYPES = [
  "info",
  "evento",
  "cierre_servicio",
  "convocatoria",
] as const;

export type TipoAnnouncement = (typeof ANNOUNCEMENT_TYPES)[number];

export const LEGACY_ANNOUNCEMENT_TYPES = ["cierre", "urgente"] as const;
export type LegacyTipoAnnouncement = (typeof LEGACY_ANNOUNCEMENT_TYPES)[number];

export const ANNOUNCEMENT_TYPE_LABELS: Record<TipoAnnouncement, string> = {
  info: "Info",
  evento: "Evento",
  cierre_servicio: "Cierre",
  convocatoria: "Convocatoria",
};

export const ANNOUNCEMENT_TYPE_DESCRIPTIONS: Record<TipoAnnouncement, string> = {
  info: "Información general (bienvenidas, recordatorios, novedades del equipo).",
  evento: "Fecha planificada a la que el destinatario puede asistir (reunión, donante, formación).",
  cierre_servicio: "El servicio no operará o tendrá horario alterado (comedor cerrado, sin reparto).",
  convocatoria: "Llamada para que voluntarios se apunten o cubran un turno extra.",
};

export const ANNOUNCEMENT_ROLES = ["superadmin", "admin", "voluntario", "beneficiario"] as const;
export type AnnouncementRole = (typeof ANNOUNCEMENT_ROLES)[number];

export const ANNOUNCEMENT_PROGRAMS = [
  "comedor",
  "familia",
  "formacion",
  "atencion_juridica",
  "voluntariado",
  "acompanamiento",
] as const;
export type AnnouncementProgram = (typeof ANNOUNCEMENT_PROGRAMS)[number];

export interface AudienceRule {
  roles: readonly AnnouncementRole[];
  programs: readonly AnnouncementProgram[];
}

export function isLegacyTipo(t: string): boolean {
  return (LEGACY_ANNOUNCEMENT_TYPES as readonly string[]).includes(t);
}

export function isCurrentTipo(t: string): t is TipoAnnouncement {
  return (ANNOUNCEMENT_TYPES as readonly string[]).includes(t);
}
```

- [ ] **Step 2: Verify TypeScript still passes**

Run: `cd /home/ubuntu/bocatas-digital && pnpm check 2>&1 | tail -5`
Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
cd /home/ubuntu/bocatas-digital
git add shared/announcementTypes.ts
git commit -m "feat(novedades/shared): single-source-of-truth tipo enum + audience rule type"
```

---

## Task 2: DB Migrations — Apply all 8 via Supabase MCP

**Files:**
- Create: `supabase/migrations/20260501000001_create_announcements_table.sql` (copy from PR branch)
- Create: `supabase/migrations/20260501000002_announcement_audiences_table.sql`
- Create: `supabase/migrations/20260501000003_es_urgente_and_tipo_legacy_check.sql`
- Create: `supabase/migrations/20260501000004_announcement_audit_log.sql`
- Create: `supabase/migrations/20260501000005_announcement_dismissals_and_webhook_log.sql`
- Create: `supabase/migrations/20260501000006_announcements_rls.sql`
- Create: `supabase/migrations/20260501000007_bulk_import_previews.sql`
- Create: `supabase/migrations/20260501000008_confirm_bulk_import_fn.sql`

**Supabase project ID:** `vqvgcsdvvgyubqxumlwn`

**Verifiable success:** After each migration, run a SELECT to confirm the schema change took effect.

**CRITICAL ordering:** Migrations MUST be applied in order 1→8. Each is idempotent (uses IF NOT EXISTS / CREATE OR REPLACE). Migration 1 converts `tipo` from `text` to enum and adds `tipo_announcement` enum. Migration 2 creates `announcement_audiences` and drops `roles_visibles`. Migration 3 adds `es_urgente` column. Migration 8 creates the PL/pgSQL function.

- [ ] **Step 1: Copy migration files from PR branch to Manus project**

```bash
mkdir -p /home/ubuntu/bocatas-digital/supabase/migrations
cp /tmp/pr17/supabase/migrations/2026050100000*.sql /home/ubuntu/bocatas-digital/supabase/migrations/
```

- [ ] **Step 2: Apply migration 1 (announcements table + tipo enum)**

Use Supabase MCP `execute_sql` with project_id `vqvgcsdvvgyubqxumlwn` and the full SQL from `20260501000001_create_announcements_table.sql`.

Verify: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'announcements' ORDER BY ordinal_position` — should show `tipo` as `USER-DEFINED` (enum).

- [ ] **Step 3: Apply migration 2 (announcement_audiences + drop roles_visibles)**

Use Supabase MCP `execute_sql` with the full SQL from `20260501000002_announcement_audiences_table.sql`.

Verify: `SELECT table_name FROM information_schema.tables WHERE table_name = 'announcement_audiences'` — should return 1 row.

- [ ] **Step 4: Apply migration 3 (es_urgente column + legacy tipo CHECK + immutable author trigger)**

Use Supabase MCP `execute_sql` with the full SQL from `20260501000003_es_urgente_and_tipo_legacy_check.sql`.

Verify: `SELECT column_name FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'es_urgente'` — should return 1 row.

- [ ] **Step 5: Apply migration 4 (announcement_audit_log table)**

Use Supabase MCP `execute_sql` with the full SQL from `20260501000004_announcement_audit_log.sql`.

Verify: `SELECT table_name FROM information_schema.tables WHERE table_name = 'announcement_audit_log'` — should return 1 row.

- [ ] **Step 6: Apply migration 5 (announcement_dismissals + announcement_webhook_log)**

Use Supabase MCP `execute_sql` with the full SQL from `20260501000005_announcement_dismissals_and_webhook_log.sql`.

Verify: `SELECT table_name FROM information_schema.tables WHERE table_name IN ('announcement_dismissals', 'announcement_webhook_log') ORDER BY table_name` — should return 2 rows.

- [ ] **Step 7: Apply migration 6 (RLS policies on all new tables)**

Use Supabase MCP `execute_sql` with the full SQL from `20260501000006_announcements_rls.sql`.

Verify: `SELECT tablename, policyname FROM pg_policies WHERE tablename LIKE 'announcement%' ORDER BY tablename, policyname` — should return multiple rows.

- [ ] **Step 8: Apply migration 7 (bulk_import_previews table)**

Use Supabase MCP `execute_sql` with the full SQL from `20260501000007_bulk_import_previews.sql`.

Verify: `SELECT table_name FROM information_schema.tables WHERE table_name = 'bulk_import_previews'` — should return 1 row.

- [ ] **Step 9: Apply migration 8 (confirm_bulk_announcement_import PL/pgSQL function)**

Use Supabase MCP `execute_sql` with the full SQL from `20260501000008_confirm_bulk_import_fn.sql`.

Verify: `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'confirm_bulk_announcement_import'` — should return 1 row.

- [ ] **Step 10: Commit migration files**

```bash
cd /home/ubuntu/bocatas-digital
git add supabase/migrations/
git commit -m "feat(novedades/db): 8 migrations for announcements authoring pipeline"
```

---

## Task 3: Server Helpers + Tests

**Files:**
- Create: `server/announcements-helpers.ts`
- Create: `server/__tests__/announcementVisibility.test.ts`
- Create: `server/__tests__/announcementAudit.test.ts`
- Create: `server/__tests__/announcementWebhook.test.ts`
- Create: `server/__tests__/announcementDSL.test.ts`
- Create: `server/__tests__/announcementBulkRow.test.ts`

**Verifiable success:** `pnpm test --run server/__tests__/announcement*.test.ts` → 83 passing (16+22+6+14+25), 0 failures.

- [ ] **Step 1: Copy helpers and test files from PR branch**

```bash
cp /tmp/pr17/server/announcements-helpers.ts /home/ubuntu/bocatas-digital/server/
cp /tmp/pr17/server/__tests__/announcementVisibility.test.ts /home/ubuntu/bocatas-digital/server/__tests__/
cp /tmp/pr17/server/__tests__/announcementAudit.test.ts /home/ubuntu/bocatas-digital/server/__tests__/
cp /tmp/pr17/server/__tests__/announcementWebhook.test.ts /home/ubuntu/bocatas-digital/server/__tests__/
cp /tmp/pr17/server/__tests__/announcementDSL.test.ts /home/ubuntu/bocatas-digital/server/__tests__/
cp /tmp/pr17/server/__tests__/announcementBulkRow.test.ts /home/ubuntu/bocatas-digital/server/__tests__/
```

- [ ] **Step 2: Run only the announcement tests to verify all pass**

Run: `cd /home/ubuntu/bocatas-digital && pnpm test --run server/__tests__/announcement 2>&1 | tail -10`
Expected: `83 passed | 0 failed`

- [ ] **Step 3: Run full test suite to verify no regressions**

Run: `cd /home/ubuntu/bocatas-digital && pnpm test --run 2>&1 | tail -5`
Expected: `753 passed | 0 failed` (670 existing + 83 new)

- [ ] **Step 4: Commit**

```bash
cd /home/ubuntu/bocatas-digital
git add server/announcements-helpers.ts server/__tests__/announcement*.test.ts
git commit -m "feat(novedades/server): pure helpers + 5 test files (83 tests)"
```

---

## Task 4: Announcements Router (full replacement)

**Files:**
- Replace: `server/routers/announcements.ts` (227 lines → 1217 lines)

**Verifiable success:** `pnpm check` → 0 errors. `pnpm test --run` → all passing.

**Key behaviors to preserve from existing router:** The existing router has `getAll`, `getById`, `create`, `update`, `delete`, `togglePin` procedures. The new router replaces ALL of these with the audience-aware versions. The `announcementsRouter` export name stays the same, so `server/routers.ts` needs no change.

- [ ] **Step 1: Replace the announcements router**

```bash
cp /tmp/pr17/server/routers/announcements.ts /home/ubuntu/bocatas-digital/server/routers/announcements.ts
```

- [ ] **Step 2: Check TypeScript**

Run: `cd /home/ubuntu/bocatas-digital && pnpm check 2>&1 | tail -10`
Expected: `0 errors` (the PR notes 11 pre-existing errors in DeliveryDocumentUpload.tsx and families.ts — those are acceptable if they were pre-existing).

- [ ] **Step 3: Run tests**

Run: `cd /home/ubuntu/bocatas-digital && pnpm test --run 2>&1 | tail -5`
Expected: all passing, 0 failures.

- [ ] **Step 4: Commit**

```bash
cd /home/ubuntu/bocatas-digital
git add server/routers/announcements.ts
git commit -m "feat(novedades/server): full authoring pipeline router — audiences, audit, webhook, bulk import"
```

---

## Task 5: Update `database.types.ts`

**Files:**
- Modify: `client/src/lib/database.types.ts`

**Verifiable success:** `pnpm check` → 0 errors. The new tables (`announcement_audiences`, `announcement_audit_log`, `announcement_dismissals`, `announcement_webhook_log`, `bulk_import_previews`) are present. The `announcements` table Row type has `es_urgente: boolean` and no `roles_visibles`.

**Strategy:** Copy the PR branch version of `database.types.ts` directly — it was manually augmented with the 5 new tables and the `es_urgente` column. This is the correct approach since we cannot regenerate types without a local Supabase CLI.

- [ ] **Step 1: Replace database.types.ts with the PR branch version**

```bash
cp /tmp/pr17/client/src/lib/database.types.ts /home/ubuntu/bocatas-digital/client/src/lib/database.types.ts
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd /home/ubuntu/bocatas-digital && pnpm check 2>&1 | tail -10`
Expected: `0 errors` (or only the pre-existing 11 errors in DeliveryDocumentUpload/families.ts).

- [ ] **Step 3: Commit**

```bash
cd /home/ubuntu/bocatas-digital
git add client/src/lib/database.types.ts
git commit -m "feat(novedades/db): update database.types.ts with 5 new tables + es_urgente column"
```

---

## Task 6: Client Hooks — `useAnnouncements.ts`

**Files:**
- Replace: `client/src/features/announcements/hooks/useAnnouncements.ts`

**Verifiable success:** `pnpm check` → 0 errors. File exports 11 hooks: `useAnnouncements`, `useAnnouncement`, `useUrgentBannerAnnouncement`, `useAnnouncementAudiences`, `useAnnouncementAuditLog`, `useDismissalStats`, `useCreateAnnouncement`, `useUpdateAnnouncement`, `useDeleteAnnouncement`, `useTogglePinAnnouncement`, `usePreviewBulkImport`, `useConfirmBulkImport`, `useDismissUrgentAnnouncement`.

- [ ] **Step 1: Replace the hooks file**

```bash
cp /tmp/pr17/client/src/features/announcements/hooks/useAnnouncements.ts \
   /home/ubuntu/bocatas-digital/client/src/features/announcements/hooks/useAnnouncements.ts
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd /home/ubuntu/bocatas-digital && pnpm check 2>&1 | tail -5`
Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
cd /home/ubuntu/bocatas-digital
git add client/src/features/announcements/hooks/useAnnouncements.ts
git commit -m "feat(novedades/client): expand useAnnouncements to 11 hooks"
```

---

## Task 7: New UI Components

**Files:**
- Create: `client/src/components/UrgentAnnouncementBanner.tsx`
- Create: `client/src/components/CrearNovedadButton.tsx`
- Create: `client/src/components/BulkImportNovedadesModal.tsx`
- Create: `client/public/novedades-bulk-template.csv`

**Verifiable success:** `pnpm check` → 0 errors. Components render without import errors.

- [ ] **Step 1: Copy new components from PR branch**

```bash
cp /tmp/pr17/client/src/components/UrgentAnnouncementBanner.tsx \
   /home/ubuntu/bocatas-digital/client/src/components/
cp /tmp/pr17/client/src/components/CrearNovedadButton.tsx \
   /home/ubuntu/bocatas-digital/client/src/components/
cp /tmp/pr17/client/src/components/BulkImportNovedadesModal.tsx \
   /home/ubuntu/bocatas-digital/client/src/components/
cp /tmp/pr17/client/public/novedades-bulk-template.csv \
   /home/ubuntu/bocatas-digital/client/public/
```

- [ ] **Step 2: Verify TypeScript**

Run: `cd /home/ubuntu/bocatas-digital && pnpm check 2>&1 | tail -5`
Expected: `0 errors`

- [ ] **Step 3: Commit**

```bash
cd /home/ubuntu/bocatas-digital
git add client/src/components/UrgentAnnouncementBanner.tsx \
        client/src/components/CrearNovedadButton.tsx \
        client/src/components/BulkImportNovedadesModal.tsx \
        client/public/novedades-bulk-template.csv
git commit -m "feat(novedades/ui): UrgentAnnouncementBanner, CrearNovedadButton, BulkImportNovedadesModal"
```

---

## Task 8: Update Existing Pages and Layout

**Files:**
- Modify: `client/src/App.tsx` (convert eager imports to lazy; add Perfil/MiQR/Novedades/DeliveryList/DeliveryForm as lazy)
- Modify: `client/src/components/layout/AppShell.tsx` (add "Administrar novedades" nav item)
- Modify: `client/src/pages/Home.tsx` (add `<UrgentAnnouncementBanner />` above greeting)
- Modify: `client/src/pages/Novedades.tsx` (add tipo chips, urgente badge, CrearNovedadButton)
- Modify: `client/src/pages/AdminNovedades.tsx` (migrate form to new tipo enum + es_urgente + audiences)

**Strategy:** For each file, take the PR branch version directly. The PR branch already has the correct merge of all changes. The only risk is that `Home.tsx` in the PR branch still has the old "Selecciona una sede" fallback span — we already removed that in the current Manus project. We must preserve that removal.

**CRITICAL:** After copying `Home.tsx`, verify the "Selecciona una sede" span is absent. If it was re-introduced by the PR, remove it again.

- [ ] **Step 1: Copy App.tsx from PR branch**

```bash
cp /tmp/pr17/client/src/App.tsx /home/ubuntu/bocatas-digital/client/src/App.tsx
```

- [ ] **Step 2: Copy AppShell.tsx from PR branch**

```bash
cp /tmp/pr17/client/src/components/layout/AppShell.tsx \
   /home/ubuntu/bocatas-digital/client/src/components/layout/AppShell.tsx
```

- [ ] **Step 3: Copy Home.tsx from PR branch, then verify "Selecciona una sede" is absent**

```bash
cp /tmp/pr17/client/src/pages/Home.tsx /home/ubuntu/bocatas-digital/client/src/pages/Home.tsx
grep -n "Selecciona una sede" /home/ubuntu/bocatas-digital/client/src/pages/Home.tsx
```

If the grep returns a line, remove the entire fallback span (the `else` branch of the `selectedLocation` ternary) — change the ternary to `{selectedLocation && (...)}`.

- [ ] **Step 4: Copy Novedades.tsx and AdminNovedades.tsx from PR branch**

```bash
cp /tmp/pr17/client/src/pages/Novedades.tsx /home/ubuntu/bocatas-digital/client/src/pages/Novedades.tsx
cp /tmp/pr17/client/src/pages/AdminNovedades.tsx /home/ubuntu/bocatas-digital/client/src/pages/AdminNovedades.tsx
```

- [ ] **Step 5: Verify TypeScript**

Run: `cd /home/ubuntu/bocatas-digital && pnpm check 2>&1 | tail -10`
Expected: `0 errors` (or only pre-existing errors).

- [ ] **Step 6: Run full test suite**

Run: `cd /home/ubuntu/bocatas-digital && pnpm test --run 2>&1 | tail -5`
Expected: `753 passed | 0 failed`

- [ ] **Step 7: Commit**

```bash
cd /home/ubuntu/bocatas-digital
git add client/src/App.tsx \
        client/src/components/layout/AppShell.tsx \
        client/src/pages/Home.tsx \
        client/src/pages/Novedades.tsx \
        client/src/pages/AdminNovedades.tsx
git commit -m "feat(novedades/ui): update App.tsx lazy loading, AppShell nav, Home banner, Novedades chips, AdminNovedades form"
```

---

## Task 9: Docs, Scripts, and Final Assets

**Files:**
- Create: `docs/novedades-bulk-import-guide.md`
- Create: `scripts/create_announcement_images_bucket.sh`

- [ ] **Step 1: Copy docs and scripts from PR branch**

```bash
mkdir -p /home/ubuntu/bocatas-digital/docs
mkdir -p /home/ubuntu/bocatas-digital/scripts
cp /tmp/pr17/docs/novedades-bulk-import-guide.md /home/ubuntu/bocatas-digital/docs/
cp /tmp/pr17/scripts/create_announcement_images_bucket.sh /home/ubuntu/bocatas-digital/scripts/
chmod +x /home/ubuntu/bocatas-digital/scripts/create_announcement_images_bucket.sh
```

- [ ] **Step 2: Commit**

```bash
cd /home/ubuntu/bocatas-digital
git add docs/novedades-bulk-import-guide.md scripts/create_announcement_images_bucket.sh
git commit -m "docs(novedades): bulk import guide + bucket creation script"
```

---

## Task 10: Final Verification + Push to GitHub + Checkpoint

**Verifiable success criteria (ALL must pass before this task is complete):**
1. `pnpm check` → `0 errors` (TypeScript clean)
2. `pnpm test --run` → `753 passed | 0 failed` (670 existing + 83 new)
3. `git log --oneline -8` shows all 7 feature commits above
4. Dev server starts without errors
5. `/novedades` page loads and shows tipo chips
6. `/admin/novedades` page loads and shows es_urgente checkbox
7. AppShell shows "Administrar novedades" for admin users

- [ ] **Step 1: Run final TypeScript check**

Run: `cd /home/ubuntu/bocatas-digital && pnpm check 2>&1 | tail -5`
Expected: `0 errors`

- [ ] **Step 2: Run full test suite**

Run: `cd /home/ubuntu/bocatas-digital && pnpm test --run 2>&1 | tail -5`
Expected: `753 passed | 0 failed`

- [ ] **Step 3: Push all commits to GitHub main**

```bash
cd /tmp/bocatas_digital
git fetch origin main
git pull origin main
# Copy all new/changed files from Manus project to the GitHub clone
rsync -av --include="*.ts" --include="*.tsx" --include="*.sql" --include="*.csv" --include="*.md" --include="*.sh" \
  /home/ubuntu/bocatas-digital/shared/ /tmp/bocatas_digital/shared/
# ... (copy each file group)
git add -A
git commit -m "feat(novedades): authoring pipeline — multi-rule audiences, urgency banner, bulk import, audit log"
git push origin main
```

- [ ] **Step 4: Save Manus checkpoint**

Use `webdev_save_checkpoint` with description of all completed features.

---

## Self-Review

**Spec coverage check:**
- ✅ Multi-rule audience targeting → Task 2 (migration 2) + Task 4 (router `create`/`update` with `audiences` array)
- ✅ Urgency boolean → Task 2 (migration 3) + Task 4 (`es_urgente` field) + Task 7 (`UrgentAnnouncementBanner`) + Task 8 (Home.tsx)
- ✅ Tipo taxonomy rebuilt → Task 1 (shared enum) + Task 2 (migration 1 + 3 CHECK) + Task 4 (router validates)
- ✅ Per-field audit log → Task 2 (migration 4) + Task 3 (helpers) + Task 4 (router `update`/`delete`/`togglePin`)
- ✅ Bulk CSV import → Task 2 (migrations 7+8) + Task 4 (router `previewBulkImport`/`confirmBulkImport`) + Task 7 (`BulkImportNovedadesModal`) + Task 9 (CSV template + guide)
- ✅ Auto author attribution → Task 4 (router `create` uses `ctx.user.id`/`ctx.user.name`)
- ✅ Public bucket → Task 9 (bucket creation script)
- ✅ 72 new tests → Task 3 (83 tests: 16+22+6+14+25)
- ✅ AppShell nav → Task 8
- ✅ AdminNovedades form migration → Task 8

**Placeholder scan:** No TBD, no "implement later", no "similar to Task N" — all steps have exact commands.

**Type consistency:**
- `AudienceRule` defined in `shared/announcementTypes.ts` (Task 1), imported by helpers (Task 3) and router (Task 4) — consistent.
- `TipoAnnouncement` defined in `shared/announcementTypes.ts` (Task 1), used in router `AnnouncementTipoEnum` — consistent.
- `announcementsRouter` export name unchanged — `server/routers.ts` needs no modification.

**Risk: Home.tsx "Selecciona una sede" regression** — explicitly handled in Task 8 Step 3 with a grep check.

**Risk: database.types.ts `roles_visibles` removal** — the PR's `database.types.ts` removes `roles_visibles` from the `announcements` Row type. The existing `server/routers/announcements.ts` (pre-PR) referenced `roles_visibles`. After Task 4 replaces the router, this reference is gone. Safe.
