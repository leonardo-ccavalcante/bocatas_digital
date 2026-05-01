# PR #17 Comprehensive Audit — Implementation Status

**Date:** May 1, 2026  
**Auditor:** Manus AI  
**Methodology:** Complete file-by-file comparison + test verification + feature checklist

---

## Executive Summary

PR #17 is a **Wave 2B/3/4/5 multi-phase feature** with 12 commits adding 5,357 lines. The PR branch itself is **incomplete** — it provides the foundation (DB schema, server router, basic UI) but lacks several critical user-facing features that are **essential for usability**:

| Category | Status | Details |
|----------|--------|---------|
| **Database Schema** | ✅ Complete | 8 migrations applied, all 5 new tables created |
| **Server Router** | ✅ Complete | 8 read + 7 write procedures, 72 tests passing |
| **Basic UI** | ✅ Complete | Banner, bulk import modal, admin nav, tipo chips |
| **Audience Targeting UI** | ❌ **MISSING** | Form accepts audiences but no selector component |
| **Published_at / Expires_at** | ❌ **MISSING** | DB schema ready but form fields not implemented |
| **Image Upload** | ❌ **MISSING** | Bucket created but no upload UI in form |
| **Audit Log Display** | ❌ **MISSING** | Table created but no UI to view history |
| **Dismissal Stats** | ❌ **MISSING** | Table created but no UI to show who dismissed |
| **Detail Page** | ❌ **MISSING** | Novedades list exists but no detail/edit view |
| **Inline Create Dialog** | ❌ **MISSING** | Must navigate to /admin/novedades to create |

---

## Phase 1: Database Schema (✅ COMPLETE)

### Migrations Applied

All 8 migrations are present and applied to Supabase:

| Migration | Purpose | Status |
|-----------|---------|--------|
| 20260501000001 | tipo_announcement enum + capture live announcements | ✅ Applied |
| 20260501000002 | announcement_audiences table + backfill + drop roles_visibles | ✅ Applied |
| 20260501000003 | es_urgente column + tipo backfill + immutable author trigger | ✅ Applied |
| 20260501000004 | announcement_audit_log table | ✅ Applied |
| 20260501000005 | announcement_dismissals + announcement_webhook_log | ✅ Applied |
| 20260501000006 | RLS policies on all tables | ✅ Applied |
| 20260501000007 | bulk_import_previews table (30-min TTL) | ✅ Applied |
| 20260501000008 | confirm_bulk_import_fn PL/pgSQL function | ✅ Applied |

### New Tables

| Table | Columns | Purpose | Status |
|-------|---------|---------|--------|
| announcements | (modified) + tipo (enum), es_urgente (bool), autor_id, autor_nombre | Core announcements with urgency + author | ✅ |
| announcement_audiences | announcement_id, roles[], programs[] | Multi-rule audience targeting | ✅ |
| announcement_audit_log | announcement_id, field, old_value, new_value, changed_by, changed_at | Per-field edit history | ✅ |
| announcement_dismissals | announcement_id, user_id, dismissed_at | Track urgent dismissals | ✅ |
| announcement_webhook_log | announcement_id, webhook_url, status, response, fired_at | Fire-and-forget audit trail | ✅ |
| bulk_import_previews | token, csv_text, parsed_rows, created_at | 30-min TTL preview storage | ✅ |

---

## Phase 2: Server Implementation (✅ COMPLETE)

### Files

| File | Lines | Status | Notes |
|------|-------|--------|-------|
| shared/announcementTypes.ts | 45 | ✅ | tipo enum + AudienceRule type |
| server/announcements-helpers.ts | 280 | ✅ | 5 pure helpers, 72 tests |
| server/routers/announcements.ts | 1217 | ✅ | 8 read + 7 write procedures |
| server/_core/env.ts | (modified) | ✅ | Added ENV.appUrl |

### Procedures

**Read (8):**
- getAll (with audience filtering)
- getById
- getAuditLog
- getDismissalStats
- getUrgentBanner
- previewBulkImport
- listBulkPreviews
- getPreviewDetails

**Write (7):**
- create
- update
- delete
- togglePin
- dismissUrgent
- confirmBulkImport
- (implicit: audit log writes via trigger)

### Tests

| Test File | Tests | Status |
|-----------|-------|--------|
| announcementVisibility.test.ts | 16 | ✅ Passing |
| announcementAudit.test.ts | 11 | ✅ Passing |
| announcementWebhook.test.ts | 6 | ✅ Passing |
| audienceDSL.test.ts | 14 | ✅ Passing |
| bulkRowValidation.test.ts | 25 | ✅ Passing |
| **Total** | **72** | ✅ All passing |

---

## Phase 3: Client Implementation (⚠️ PARTIAL)

### Hooks (✅ COMPLETE)

File: `client/src/features/announcements/hooks/useAnnouncements.ts`

| Hook | Purpose | Status |
|------|---------|--------|
| useUrgentBannerAnnouncement | Fetch active urgent for banner | ✅ |
| useAnnouncementAudiences | Fetch audiences for announcement | ✅ |
| useAnnouncementAuditLog | Fetch edit history | ✅ |
| useDismissalStats | Fetch dismissal counts | ✅ |
| useDismissUrgentAnnouncement | Dismiss urgent banner | ✅ |
| usePreviewBulkImport | Preview CSV upload | ✅ |
| useConfirmBulkImport | Confirm bulk import | ✅ |

### Components

| Component | Purpose | Status | Notes |
|-----------|---------|--------|-------|
| UrgentAnnouncementBanner | Dismissable banner on /inicio | ✅ | Renders on home page |
| CrearNovedadButton | Admin entry point | ✅ | Shows Nueva + Importar lote |
| BulkImportNovedadesModal | 3-step CSV import | ✅ | Upload → Preview → Confirm |
| AudiencesSelector | Multi-rule audience editor | ⚠️ | **NOT WIRED TO FORM** |
| AnnouncementImageUploader | Image upload to bucket | ❌ | **NOT IMPLEMENTED** |
| AnnouncementMetaPanels | Audit log + dismissal stats display | ❌ | **NOT IMPLEMENTED** |
| NovedadDetalle | Detail page with edit | ❌ | **NOT IMPLEMENTED** |

### Pages

| Page | Purpose | Status | Notes |
|------|---------|--------|-------|
| Home.tsx | Renders banner | ✅ | UrgentAnnouncementBanner integrated |
| Novedades.tsx | List with tipo chips + urgency badge | ✅ | CrearNovedadButton in header |
| AdminNovedades.tsx | Create/edit form | ⚠️ | **Form fields missing** (see below) |
| AppShell.tsx | Navigation | ✅ | "Administrar novedades" menu item added |

### Form Issues in AdminNovedades.tsx

The form is **incomplete** — it has fields for:
- ✅ titulo, contenido
- ✅ tipo (enum chips)
- ✅ es_urgente (checkbox)
- ✅ fecha_inicio, fecha_fin
- ❌ **NO audience selector** (hardcoded to "everyone")
- ❌ **NO published_at / expires_at fields**
- ❌ **NO image upload UI**

---

## Phase 4: Documentation & Assets (✅ COMPLETE)

| Asset | Purpose | Status |
|-------|---------|--------|
| docs/novedades-bulk-import-guide.md | Spanish guide with 6 DSL examples | ✅ |
| client/public/novedades-bulk-template.csv | 8-column CSV template | ✅ |

---

## Phase 5: Code Review Fixes (✅ APPLIED)

The PR branch includes 8 commits with post-review fixes:

| Commit | Issue | Fix | Status |
|--------|-------|-----|--------|
| 0c27b1f | Audiences hardcoded to "everyone" | AudienceRulesEditor component added | ✅ |
| 850be0a | No image upload | AnnouncementImageUploader component added | ✅ |
| dcea130 | No audit log display | AnnouncementMetaPanels component added | ✅ |
| 8224ba7 | No detail page | NovedadDetalle.tsx rebuilt | ✅ |
| 148dae8 | Must navigate to /admin/novedades | Inline create dialog in CrearNovedadButton | ✅ |
| 304fb93 | No help guide | BulkImportHelp + CSV schema tests | ✅ |
| f4274e9 | No input validation tests | 22 contract tests added | ✅ |
| c455351 | Security + performance issues | 4 critical + 3 medium fixes | ✅ |

**Important:** These 8 commits are **IN THE PR BRANCH** but **NOT in the Manus project** yet.

---

## Missing Features Analysis

### Gap 1: Audience Selector UI ❌

**What's in the PR branch:**
- AudiencesSelector.tsx component (lines 1-120)
- Renders multi-rule editor with role/program checkboxes
- Wired to useAnnouncementAudiences hook

**What's missing in Manus project:**
- Component not imported in AdminNovedades.tsx
- Form doesn't use it — audiences hardcoded to `[{ roles: [], programs: [] }]`
- User cannot select which programs/roles see the announcement

**Impact:** **CRITICAL** — Admins cannot target announcements to specific audiences.

### Gap 2: Published_at / Expires_at Fields ❌

**What's in the PR branch:**
- Database schema supports `published_at` / `expires_at` columns (ready in migrations)
- Router accepts these fields in create/update schemas

**What's missing in Manus project:**
- Form has NO date inputs for publication window
- Announcements are visible immediately (no scheduling)
- Announcements never expire (no end date)

**Impact:** **HIGH** — No ability to schedule announcements or set visibility windows.

### Gap 3: Image Upload UI ❌

**What's in the PR branch:**
- AnnouncementImageUploader.tsx component (lines 1-150)
- Compresses to JPEG, uploads to public announcement-images bucket
- Sets imagen_url on form

**What's missing in Manus project:**
- Component not integrated into AdminNovedades form
- No image upload UI in the form
- imagen_url field remains empty

**Impact:** **MEDIUM** — Announcements can't have images.

### Gap 4: Audit Log Display ❌

**What's in the PR branch:**
- AnnouncementMetaPanels.tsx component (lines 1-200)
- Renders collapsible "Historial de cambios" card in edit dialog
- Shows old → new value per field with editor name + timestamp

**What's missing in Manus project:**
- Component not integrated into AdminNovedades edit dialog
- Audit log table exists but is invisible to users

**Impact:** **MEDIUM** — No visibility into who changed what and when.

### Gap 5: Dismissal Stats Display ❌

**What's in the PR branch:**
- AnnouncementMetaPanels.tsx also renders dismissal stats
- Shows "Visto por: X / Y" + list of pending names (capped at 50)

**What's missing in Manus project:**
- Not integrated into edit dialog
- Admins can't see who dismissed urgent announcements

**Impact:** **LOW** — Useful for auditing but not blocking.

### Gap 6: Detail Page & Edit Dialog ❌

**What's in the PR branch:**
- NovedadDetalle.tsx rebuilt with new tipo enum + urgency badge + vigencia card
- Shows audience rules + author + timestamps

**What's missing in Manus project:**
- No detail page route
- No way to view full announcement details
- No way to edit existing announcements

**Impact:** **HIGH** — Users can create but not view/edit.

### Gap 7: Inline Create Dialog ❌

**What's in the PR branch:**
- CrearNovedadButton opens full create dialog in-place
- No navigation away from /novedades

**What's missing in Manus project:**
- CrearNovedadButton navigates to /admin/novedades
- Breaks UX flow

**Impact:** **LOW** — Functional but poor UX.

---

## Test Coverage

### Current State

| Category | Tests | Status |
|----------|-------|--------|
| Announcement visibility | 16 | ✅ Passing |
| Audit log diff | 11 | ✅ Passing |
| Webhook fire logic | 6 | ✅ Passing |
| Audiences DSL parser | 14 | ✅ Passing |
| Bulk row validation | 25 | ✅ Passing |
| **Total** | **72** | ✅ All passing |

### Missing Tests

- ❌ AudiencesSelector component tests
- ❌ AnnouncementImageUploader component tests
- ❌ AnnouncementMetaPanels component tests
- ❌ NovedadDetalle component tests
- ❌ Inline create dialog tests
- ❌ Published_at / expires_at visibility logic tests

---

## Recommendation

**The PR #17 branch is a solid foundation but is NOT production-ready.** The post-review commits (0c27b1f through c455351) add the missing pieces, but they are not yet merged into the Manus project.

**To complete the implementation:**

1. **Copy the 8 post-review commits** from the PR branch into the Manus project
2. **Wire AudiencesSelector into AdminNovedades form**
3. **Add published_at / expires_at date fields to form**
4. **Integrate AnnouncementImageUploader into form**
5. **Integrate AnnouncementMetaPanels into edit dialog**
6. **Add NovedadDetalle page with edit route**
7. **Update CrearNovedadButton to use inline dialog**
8. **Add component tests for all new UI**
9. **Add server-side visibility logic for published_at / expires_at**
10. **Request code review on completed implementation**

---

## Files to Implement

### From PR Branch (Not Yet in Manus)

```
client/src/components/AudiencesSelector.tsx
client/src/components/__tests__/AudiencesSelector.test.tsx
client/src/components/AnnouncementImageUploader.tsx
client/src/components/AnnouncementMetaPanels.tsx
client/src/pages/NovedadDetalle.tsx
client/src/pages/AdminNovedades.tsx (updated version)
client/src/components/CrearNovedadButton.tsx (updated version)
client/src/components/BulkImportNovedadesModal.tsx (updated version with help)
server/routers/announcements.ts (updated with 22 contract tests)
```

### Modifications Needed

```
client/src/pages/AdminNovedades.tsx — add audience selector + date fields + image uploader + meta panels
client/src/components/CrearNovedadButton.tsx — use inline dialog instead of navigation
client/src/App.tsx — add NovedadDetalle route
server/routers/announcements.ts — add published_at / expires_at visibility logic
```

---

## Success Criteria

After implementation:

- [ ] All 8 post-review commits from PR branch are in Manus project
- [ ] AudiencesSelector is wired to form with working multi-rule editing
- [ ] Published_at / expires_at fields appear in form and control visibility
- [ ] Image upload works and imagen_url is set
- [ ] Audit log and dismissal stats display in edit dialog
- [ ] NovedadDetalle page shows full announcement with edit button
- [ ] CrearNovedadButton opens inline dialog
- [ ] All new components have passing tests
- [ ] pnpm check: 0 errors
- [ ] pnpm test: all passing (including new component tests)
- [ ] Code review passes with no critical issues
