# PR #17 Complete Implementation Plan

**Date:** May 1, 2026  
**Methodology:** writing-plans + karpathy-guidelines  
**Scope:** Implement all 7 missing features from PR #17 post-review commits

---

## Overview

This plan implements the 7 missing features identified in the comprehensive audit. The PR branch has all code ready (8 post-review commits), but they are not yet in the Manus project.

**Total effort:** 10 tasks, organized by dependency order (database → server → client).

---

## Success Criteria

After implementation:

- [ ] All 8 post-review commits from PR branch are cherry-picked into Manus project
- [ ] AudiencesSelector component is wired to AdminNovedades form
- [ ] Published_at / expires_at fields control announcement visibility
- [ ] Image upload works (AnnouncementImageUploader integrated)
- [ ] Audit log display works (AnnouncementMetaPanels integrated)
- [ ] NovedadDetalle page exists with edit route
- [ ] CrearNovedadButton opens inline dialog
- [ ] All new components have passing tests
- [ ] pnpm check: 0 errors
- [ ] pnpm test: all passing (including new component tests)
- [ ] Code review: no critical issues

---

## Implementation Tasks

### Task 1: Cherry-pick post-review commits from PR branch

**Dependency:** None  
**Commits:** 0c27b1f, 850be0a, dcea130, 8224ba7, 148dae8, 304fb93, f4274e9, c455351

**What it does:**
- Copies AudiencesSelector, AnnouncementImageUploader, AnnouncementMetaPanels components
- Updates AdminNovedades.tsx to use new components
- Adds NovedadDetalle.tsx page
- Updates CrearNovedadButton to use inline dialog
- Adds BulkImportHelp guide + CSV schema tests
- Adds 22 contract tests for router input validation
- Applies 4 critical + 3 medium security/performance fixes

**Verification:**
- All files exist in Manus project
- pnpm check: 0 errors
- pnpm test: all passing (including new 22 tests)

---

### Task 2: Wire AudiencesSelector to AdminNovedades form

**Dependency:** Task 1  
**Component:** AudiencesSelector.tsx (from PR branch)  
**Form:** AdminNovedades.tsx

**What it does:**
- Import AudiencesSelector in AdminNovedades
- Add `audiences` field to FormSchema (array of AudienceRule)
- Render AudiencesSelector in form JSX
- Pass form value + onChange handler
- Validate that at least one rule exists (form-level validation)
- Default to one empty rule (visible to everyone) for new announcements

**Verification:**
- Form renders audience selector
- User can add/remove rules
- User can toggle roles/programs per rule
- Form submission includes audiences array
- Validation rejects zero rules

**Tests:**
- AudiencesSelector.test.tsx: 9 tests (already in PR branch)
- AdminNovedades form integration test: 3 new tests

---

### Task 3: Add published_at / expires_at fields to form

**Dependency:** Task 1  
**Form:** AdminNovedades.tsx  
**Router:** announcements.ts

**What it does:**
- Add `published_at` (datetime input, optional) to form
- Add `expires_at` (datetime input, optional) to form
- Update CreateAnnouncementSchema to accept these fields
- Update UpdateAnnouncementSchema to accept these fields
- Form-level validation: expires_at must be after published_at (if both set)
- Helper text: "Leave blank to publish immediately" + "Leave blank for no expiration"

**Verification:**
- Form renders date inputs
- User can set publication window
- Form validation rejects invalid date ranges
- Router accepts and stores dates
- Database columns updated

**Tests:**
- AdminNovedades form validation: 4 new tests
- Router schema validation: 2 new tests (contract tests)

---

### Task 4: Add server-side visibility logic for published_at / expires_at

**Dependency:** Task 3  
**Router:** announcements.ts (getAll procedure)

**What it does:**
- Modify getAll to filter by published_at <= now() AND (expires_at IS NULL OR expires_at > now())
- Announcements not yet published are hidden from all users (except admin viewing edit dialog)
- Announcements past expiration are hidden from all users (except admin viewing edit dialog)
- Admin can always see all announcements in AdminNovedades (edit view)

**Verification:**
- Unpublished announcements don't appear in /novedades for regular users
- Expired announcements don't appear in /novedades for regular users
- Admin can see all announcements in edit view
- Urgency banner respects visibility window

**Tests:**
- Visibility logic: 6 new tests (published_at + expires_at edge cases)

---

### Task 5: Integrate AnnouncementImageUploader into form

**Dependency:** Task 1  
**Component:** AnnouncementImageUploader.tsx (from PR branch)  
**Form:** AdminNovedades.tsx

**What it does:**
- Import AnnouncementImageUploader in AdminNovedades
- Add `imagen_url` field to FormSchema (string, optional)
- Render AnnouncementImageUploader in form JSX
- Pass form value + onChange handler
- Component handles: drag-drop, compression, upload to S3 bucket, preview, remove

**Verification:**
- Form renders image uploader
- User can drag-drop image
- Image is compressed to JPEG (max 1920px, q=0.85)
- Image is uploaded to announcement-images bucket
- imagen_url is set on form
- User can remove image
- Form submission includes imagen_url

**Tests:**
- AnnouncementImageUploader.test.tsx: 5 new tests

---

### Task 6: Integrate AnnouncementMetaPanels into edit dialog

**Dependency:** Task 1  
**Component:** AnnouncementMetaPanels.tsx (from PR branch)  
**Form:** AdminNovedades.tsx (edit mode)

**What it does:**
- Import AnnouncementMetaPanels in AdminNovedades
- Render in edit dialog (only when editing, not creating)
- Passes announcement ID to fetch audit log + dismissal stats
- Renders two collapsible cards:
  - "Historial de cambios" — old → new value per field, editor, timestamp
  - "Visto por" — shows "Visto por: X / Y" + list of pending names (capped at 50)

**Verification:**
- Edit dialog shows audit log panel
- Edit dialog shows dismissal stats panel (only if es_urgente=true)
- Audit log shows correct old/new values
- Dismissal stats show correct counts
- Panels are collapsible

**Tests:**
- AnnouncementMetaPanels.test.tsx: 6 new tests

---

### Task 7: Add NovedadDetalle page with edit route

**Dependency:** Task 1  
**Component:** NovedadDetalle.tsx (from PR branch)  
**Router:** App.tsx

**What it does:**
- Create route `/novedades/:id` that renders NovedadDetalle
- NovedadDetalle shows:
  - Announcement title + content
  - Tipo chip (info/evento/cierre_servicio/convocatoria)
  - Urgency badge (if es_urgente=true)
  - Vigencia card (desde/hasta dates)
  - Dirigido a card (audience rules)
  - Author + timestamp
  - Edit button (admin only) → opens AdminNovedades edit dialog
  - Delete button (admin only) → delete confirmation → redirect to /novedades
- Novedades.tsx list cards are clickable → navigate to detail page

**Verification:**
- Route exists and renders
- Detail page shows all fields correctly
- Edit button opens dialog (admin only)
- Delete button works (admin only)
- List cards are clickable
- Non-admin users can view but can't edit/delete

**Tests:**
- NovedadDetalle.test.tsx: 8 new tests

---

### Task 8: Update CrearNovedadButton to use inline dialog

**Dependency:** Task 1  
**Component:** CrearNovedadButton.tsx (from PR branch)  
**Integration:** Novedades.tsx

**What it does:**
- CrearNovedadButton opens full create dialog in-place (no navigation)
- Dialog has same form as AdminNovedades (audiences, image, dates, etc.)
- After successful create, dialog closes and list refreshes
- User stays on /novedades page

**Verification:**
- CrearNovedadButton renders on /novedades
- Clicking opens dialog
- Form works (all fields, validation, submission)
- After create, dialog closes and new announcement appears in list
- User stays on /novedades

**Tests:**
- CrearNovedadButton.test.tsx: 5 new tests

---

### Task 9: Add component tests for all new UI

**Dependency:** Tasks 2-8  
**Test files:** 
- AudiencesSelector.test.tsx (9 tests, already in PR)
- AnnouncementImageUploader.test.tsx (5 new tests)
- AnnouncementMetaPanels.test.tsx (6 new tests)
- NovedadDetalle.test.tsx (8 new tests)
- CrearNovedadButton.test.tsx (5 new tests)
- AdminNovedades.test.tsx (8 new tests for form integration)

**What it does:**
- Write vitest tests for all new components
- Test rendering, user interactions, form submission, error handling
- Test integration with hooks and router

**Verification:**
- All tests pass
- Coverage > 80% for new components

---

### Task 10: Code review + systematic debugging

**Dependency:** Tasks 1-9  
**Process:** requesting-code-review + receiving-code-review + systematic-debugging

**What it does:**
- Request code review on complete implementation
- Review feedback identifies bugs/issues
- Fix bugs using systematic-debugging (root cause first)
- Re-run tests after each fix
- Final verification: pnpm check 0 errors, pnpm test all passing

**Verification:**
- Code review: no critical issues
- All bugs fixed
- All tests passing
- pnpm check: 0 errors

---

## Implementation Order

```
1. Cherry-pick 8 commits from PR branch
   ↓
2. Wire AudiencesSelector to form
   ↓
3. Add published_at / expires_at fields
   ↓
4. Add server-side visibility logic
   ↓
5. Integrate AnnouncementImageUploader
   ↓
6. Integrate AnnouncementMetaPanels
   ↓
7. Add NovedadDetalle page
   ↓
8. Update CrearNovedadButton
   ↓
9. Add component tests
   ↓
10. Code review + debugging
```

---

## Estimated Test Count After Implementation

| Category | Current | New | Total |
|----------|---------|-----|-------|
| Announcement helpers | 72 | 0 | 72 |
| Router contracts | 0 | 22 | 22 |
| Component tests | 0 | 41 | 41 |
| Form integration | 0 | 12 | 12 |
| Visibility logic | 0 | 6 | 6 |
| **Total** | **72** | **81** | **153** |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Cherry-pick conflicts | Use git cherry-pick with -n flag, resolve manually |
| Form state complexity | Use React Hook Form with proper validation schema |
| Image upload failures | Add retry logic + user-friendly error messages |
| Audit log parsing | Pre-test JSON parsing with various field types |
| Visibility window logic | Add comprehensive tests for edge cases (timezone, DST) |
| Component integration bugs | Test each component in isolation before integrating |

---

## Rollback Plan

If implementation fails:
1. `webdev_rollback_checkpoint` to previous stable state
2. Identify root cause using systematic-debugging
3. Fix and re-implement

---

## Delivery Checklist

- [ ] All 8 commits cherry-picked
- [ ] All 7 features implemented
- [ ] All 81 new tests passing
- [ ] pnpm check: 0 errors
- [ ] pnpm test: 153 total passing
- [ ] Code review: no critical issues
- [ ] All bugs fixed
- [ ] Checkpoint saved
- [ ] Pushed to GitHub main
