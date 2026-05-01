# PR #17 Surgical Implementation Plan

**Date:** May 1, 2026  
**Methodology:** writing-plans + karpathy-guidelines (surgical changes, verifiable success criteria, no patches)  
**Scope:** 7 missing features, 10 tasks, TDD-first approach

---

## Principle: Surgical Changes Over Patches

Following karpathy-guidelines, this plan prioritizes **correct solutions over easy ones**. Each feature is implemented with:

1. **Clear verifiable success criteria** (not vague "it works")
2. **Root-cause thinking** (why this feature is needed, not just how to add it)
3. **Minimal scope** (surgical changes, no refactoring unless necessary)
4. **Test-first** (write failing test, implement minimal code to pass)
5. **No technical debt** (proper error handling, validation, edge cases)

---

## Gap Analysis & Root Causes

### Gap 1: Audiences Not Selectable in Form

**Root cause:** AudiencesSelector component exists but is not wired to AdminNovedades form. Form hardcodes `audiences: [{ roles: [], programs: [] }]` (everyone).

**Impact:** Admins cannot target announcements to specific programs/roles. All announcements are visible to all users.

**Solution:** Wire AudiencesSelector to form field + validate at least one rule exists.

**Success criteria:**
- Form renders AudiencesSelector component
- User can add/remove rules
- User can toggle roles/programs per rule
- Form validation rejects zero rules
- Form submission includes correct audiences array
- Tests: 3 new integration tests

---

### Gap 2: Published_at / Expires_at Not Controlling Visibility

**Root cause:** Form fields exist (added in 3bf1969) but server doesn't filter by them. getAll procedure returns all announcements regardless of publication window.

**Impact:** Announcements are visible immediately (no scheduling) and never expire.

**Solution:** Add server-side filtering in getAll to respect published_at <= now() AND (expires_at IS NULL OR expires_at > now()).

**Success criteria:**
- Unpublished announcements hidden from regular users
- Expired announcements hidden from regular users
- Admin can see all announcements in edit view
- Urgency banner respects visibility window
- Tests: 6 new edge case tests (timezone, DST, null handling)

---

### Gap 3: No Image Upload UI

**Root cause:** Database schema supports imagen_url but no upload component exists.

**Impact:** Announcements cannot have images.

**Solution:** Implement AnnouncementImageUploader component (drag-drop, compression, S3 upload) and integrate into AdminNovedades form.

**Success criteria:**
- Component renders drag-drop zone
- User can drag image or click to select
- Image compressed to JPEG (max 1920px, q=0.85)
- Image uploaded to announcement-images bucket
- imagen_url set on form
- User can remove image
- 5MB cap enforced
- Tests: 5 new component tests

---

### Gap 4: No Audit Log Display

**Root cause:** announcement_audit_log table exists with per-field edit history, but no UI to view it.

**Impact:** Admins cannot see who changed what and when.

**Solution:** Implement AnnouncementMetaPanels component (renders in edit dialog) showing audit log + dismissal stats.

**Success criteria:**
- Edit dialog shows "Historial de cambios" panel
- Panel shows old → new value per field
- Panel shows editor name + timestamp
- Panel shows dismissal stats (only if es_urgente=true)
- Panels are collapsible
- Tests: 6 new component tests

---

### Gap 5: No Detail Page

**Root cause:** Announcements can be created but not viewed individually. No route for /novedades/:id.

**Impact:** Users cannot view full announcement details or edit existing announcements.

**Solution:** Implement NovedadDetalle page showing full announcement + edit button (admin only).

**Success criteria:**
- Route /novedades/:id renders detail page
- Page shows: title, content, tipo, urgency, vigencia, audiences, author, timestamps
- Edit button opens AdminNovedades dialog (admin only)
- Delete button works (admin only)
- List cards are clickable → navigate to detail
- Tests: 8 new component tests

---

### Gap 6: CrearNovedadButton Navigates Away

**Root cause:** CrearNovedadButton navigates to /admin/novedades instead of opening inline dialog.

**Impact:** Poor UX — user leaves /novedades page to create, then must navigate back.

**Solution:** Update CrearNovedadButton to open full create dialog in-place.

**Success criteria:**
- Button opens dialog without navigation
- Dialog has all form fields (audiences, image, dates)
- After create, dialog closes and list refreshes
- User stays on /novedades
- Tests: 5 new component tests

---

### Gap 7: Missing Component Tests

**Root cause:** New components lack test coverage.

**Impact:** No confidence in component behavior, bugs slip through.

**Solution:** Write comprehensive vitest tests for all new components.

**Success criteria:**
- All new components have tests
- Coverage > 80%
- Tests cover: rendering, user interactions, form submission, error handling, edge cases
- All tests passing
- Tests: 41 new tests across 7 components

---

## Implementation Order (Dependency Graph)

```
Task 1: Wire AudiencesSelector (no dependencies)
  ↓
Task 2: Add server visibility logic (no dependencies)
  ↓
Task 3: Implement AnnouncementImageUploader (no dependencies)
  ↓
Task 4: Implement AnnouncementMetaPanels (depends on Task 2)
  ↓
Task 5: Implement NovedadDetalle (depends on Task 2)
  ↓
Task 6: Update CrearNovedadButton (depends on Task 1, 3)
  ↓
Task 7: Add all component tests (depends on Tasks 1-6)
  ↓
Task 8: Code review + debugging
```

---

## Task Details

### Task 1: Wire AudiencesSelector to AdminNovedades

**Files to modify:** `client/src/pages/AdminNovedades.tsx`

**Changes:**
1. Import AudiencesSelector component
2. Add `audiences: z.array(AudienceRuleSchema)` to FormSchema
3. Render `<AudiencesSelector value={form.watch("audiences")} onChange={(v) => form.setValue("audiences", v)} />`
4. Add form-level validation: `audiences.length > 0` (reject zero rules)
5. Default new announcements to `[{ roles: [], programs: [] }]` (everyone)

**Verification:**
- Form renders component
- User can add/remove rules
- Form validation works
- Submission includes audiences

**Tests:** 3 new tests in AdminNovedades.test.tsx

---

### Task 2: Add Server Visibility Logic

**Files to modify:** `server/routers/announcements.ts` (getAll procedure)

**Changes:**
1. Add helper function `isVisibleNow(published_at, expires_at)` that checks:
   - `published_at IS NULL OR published_at <= now()`
   - `expires_at IS NULL OR expires_at > now()`
2. In getAll, after fetching announcements, filter by `isVisibleNow()`
3. For admin users, skip visibility filter (show all)
4. Update getUrgentBanner to also respect visibility window

**Verification:**
- Unpublished announcements hidden
- Expired announcements hidden
- Admin sees all
- Banner respects window

**Tests:** 6 new tests in announcementVisibility.test.ts

---

### Task 3: Implement AnnouncementImageUploader

**Files to create:** `client/src/components/AnnouncementImageUploader.tsx`

**Component structure:**
```tsx
interface AnnouncementImageUploaderProps {
  value?: string; // imagen_url
  onChange: (url: string | undefined) => void;
  maxSizeMB?: number; // default 5
}

export function AnnouncementImageUploader(props: AnnouncementImageUploaderProps) {
  // Drag-drop zone
  // File picker
  // Compression (JPEG, max 1920px, q=0.85)
  // S3 upload to announcement-images bucket
  // Preview thumbnail + remove button
  // Error handling + user messages
}
```

**Verification:**
- Drag-drop works
- Compression works
- Upload succeeds
- imagen_url set
- Remove works
- 5MB cap enforced

**Tests:** 5 new tests in AnnouncementImageUploader.test.tsx

---

### Task 4: Implement AnnouncementMetaPanels

**Files to create:** `client/src/components/AnnouncementMetaPanels.tsx`

**Component structure:**
```tsx
interface AnnouncementMetaPanelsProps {
  announcementId: string;
  esUrgente: boolean;
}

export function AnnouncementMetaPanels(props: AnnouncementMetaPanelsProps) {
  // Fetch audit log via useAnnouncementAuditLog hook
  // Fetch dismissal stats via useDismissalStats hook
  // Render two collapsible cards:
  //   1. "Historial de cambios" — old → new value per field
  //   2. "Visto por" — dismissal stats (only if esUrgente)
  // Parse JSON-encoded values for nicer display
}
```

**Verification:**
- Audit log renders correctly
- Dismissal stats render correctly
- Panels collapsible
- JSON values parsed nicely

**Tests:** 6 new tests in AnnouncementMetaPanels.test.tsx

---

### Task 5: Implement NovedadDetalle Page

**Files to create:** `client/src/pages/NovedadDetalle.tsx`

**Page structure:**
```tsx
export function NovedadDetalle() {
  // Get ID from URL params
  // Fetch announcement via getById hook
  // Render:
  //   - Title + content
  //   - Tipo chip + urgency badge
  //   - Vigencia card (desde/hasta)
  //   - Dirigido a card (audience rules)
  //   - Author + timestamps
  //   - Edit button (admin only) → opens AdminNovedades dialog
  //   - Delete button (admin only) → confirmation → redirect
  // Handle loading/error states
}
```

**Route:** Add `/novedades/:id` to App.tsx

**Verification:**
- Route renders
- All fields display correctly
- Edit button works (admin only)
- Delete button works (admin only)
- Non-admin users can view but not edit/delete

**Tests:** 8 new tests in NovedadDetalle.test.tsx

---

### Task 6: Update CrearNovedadButton

**Files to modify:** `client/src/components/CrearNovedadButton.tsx`

**Changes:**
1. Remove navigation to /admin/novedades
2. Add state for dialog open/close
3. Render dialog with full AdminNovedades form
4. On successful create, close dialog and refresh list
5. User stays on /novedades

**Verification:**
- Dialog opens without navigation
- Form works
- After create, dialog closes and list refreshes
- User stays on /novedades

**Tests:** 5 new tests in CrearNovedadButton.test.tsx

---

### Task 7: Add Component Tests

**Test files to create:**
- AnnouncementImageUploader.test.tsx (5 tests)
- AnnouncementMetaPanels.test.tsx (6 tests)
- NovedadDetalle.test.tsx (8 tests)
- CrearNovedadButton.test.tsx (5 tests)
- AdminNovedades.test.tsx (3 tests for form integration)

**Total:** 27 new component tests

**Plus:** 6 server tests (visibility logic) + 8 integration tests = 41 total new tests

---

## Success Metrics

After implementation:

| Metric | Target | Verification |
|--------|--------|--------------|
| TypeScript errors | 0 | `pnpm check` |
| Tests passing | 153+ | `pnpm test` (72 existing + 81 new) |
| Component coverage | > 80% | vitest coverage report |
| Code review issues | 0 critical | requesting-code-review pass |
| Bugs found | 0 | systematic-debugging pass |
| User can target audiences | ✅ | Manual test: create announcement with specific program |
| User can schedule announcements | ✅ | Manual test: set published_at/expires_at, verify visibility |
| User can upload images | ✅ | Manual test: drag image, verify upload |
| User can view edit history | ✅ | Manual test: edit announcement, check audit log |
| User can view full details | ✅ | Manual test: click announcement, view detail page |
| User can create inline | ✅ | Manual test: click "Nueva novedad", create without leaving page |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Form state complexity | Use React Hook Form with proper schema validation |
| Image upload failures | Add retry logic + user-friendly error messages |
| Timezone issues in visibility logic | Use UTC timestamps, add comprehensive edge case tests |
| Component integration bugs | Test each component in isolation before integrating |
| Performance issues with large audit logs | Paginate audit log, cap dismissal names at 50 |
| Race conditions in create/delete | Use optimistic updates + proper error rollback |

---

## Rollback Plan

If any task fails:
1. Identify root cause using systematic-debugging
2. Fix and re-test
3. If unfixable, `webdev_rollback_checkpoint` to previous stable state
4. Re-implement with different approach

---

## Delivery Checklist

- [ ] Task 1: AudiencesSelector wired (3 tests passing)
- [ ] Task 2: Visibility logic implemented (6 tests passing)
- [ ] Task 3: ImageUploader component (5 tests passing)
- [ ] Task 4: MetaPanels component (6 tests passing)
- [ ] Task 5: NovedadDetalle page (8 tests passing)
- [ ] Task 6: CrearNovedadButton updated (5 tests passing)
- [ ] Task 7: All component tests (27 tests passing)
- [ ] pnpm check: 0 errors
- [ ] pnpm test: 153+ passing
- [ ] Code review: no critical issues
- [ ] All bugs fixed
- [ ] Checkpoint saved
- [ ] Pushed to GitHub main
