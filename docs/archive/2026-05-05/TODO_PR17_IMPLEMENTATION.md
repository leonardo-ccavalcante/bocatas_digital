# PR #17 Implementation Execution Checklist

## Fase 1: Implementación (6 tareas)

- [ ] **Task 1:** Wire AudiencesSelector to AdminNovedades form
  - [ ] Import AudiencesSelector component
  - [ ] Add audiences field to FormSchema
  - [ ] Render component in form JSX
  - [ ] Add form-level validation (>= 1 rule)
  - [ ] Write 3 integration tests
  - [ ] pnpm check: 0 errors
  - [ ] pnpm test: Task 1 tests passing

- [ ] **Task 2:** Add server-side visibility logic for published_at/expires_at
  - [ ] Create isVisibleNow() helper function
  - [ ] Update getAll procedure to filter by visibility
  - [ ] Update getUrgentBanner to respect visibility window
  - [ ] Admin users bypass visibility filter
  - [ ] Write 6 edge case tests (timezone, DST, null handling)
  - [ ] pnpm check: 0 errors
  - [ ] pnpm test: Task 2 tests passing

- [ ] **Task 3:** Implement AnnouncementImageUploader component
  - [ ] Create component file with drag-drop zone
  - [ ] Implement file picker
  - [ ] Add compression logic (JPEG, max 1920px, q=0.85)
  - [ ] Implement S3 upload to announcement-images bucket
  - [ ] Add preview thumbnail + remove button
  - [ ] Add 5MB size cap enforcement
  - [ ] Write 5 component tests
  - [ ] pnpm check: 0 errors
  - [ ] pnpm test: Task 3 tests passing

- [ ] **Task 4:** Implement AnnouncementMetaPanels component
  - [ ] Create component file
  - [ ] Fetch audit log via hook
  - [ ] Fetch dismissal stats via hook
  - [ ] Render "Historial de cambios" card (old → new per field)
  - [ ] Render "Visto por" card (only if esUrgente)
  - [ ] Make cards collapsible
  - [ ] Parse JSON values for display
  - [ ] Write 6 component tests
  - [ ] pnpm check: 0 errors
  - [ ] pnpm test: Task 4 tests passing

- [ ] **Task 5:** Implement NovedadDetalle page
  - [ ] Create page component
  - [ ] Add route /novedades/:id to App.tsx
  - [ ] Fetch announcement via getById hook
  - [ ] Render all fields (title, content, tipo, urgency, vigencia, audiences, author, timestamps)
  - [ ] Add Edit button (admin only) → opens AdminNovedades dialog
  - [ ] Add Delete button (admin only) → confirmation → redirect
  - [ ] Handle loading/error states
  - [ ] Make list cards clickable → navigate to detail
  - [ ] Write 8 component tests
  - [ ] pnpm check: 0 errors
  - [ ] pnpm test: Task 5 tests passing

- [ ] **Task 6:** Update CrearNovedadButton to inline dialog
  - [ ] Remove navigation to /admin/novedades
  - [ ] Add state for dialog open/close
  - [ ] Render full AdminNovedades form in dialog
  - [ ] On successful create, close dialog and refresh list
  - [ ] User stays on /novedades
  - [ ] Write 5 component tests
  - [ ] pnpm check: 0 errors
  - [ ] pnpm test: Task 6 tests passing

## Fase 1 Verification

- [ ] **Checkpoint 1:** All 6 tasks complete
  - [ ] pnpm check: 0 errors
  - [ ] pnpm test: 153+ passing (72 existing + 81 new)
  - [ ] No TypeScript errors
  - [ ] No dev server errors
  - [ ] Save checkpoint

## Fase 2: Code Review & Debugging

- [ ] **Task 7:** Request code review
  - [ ] Prepare code review request with all 6 tasks
  - [ ] Get feedback from code reviewer
  - [ ] Document all issues found

- [ ] **Task 8:** Receive feedback & systematic debugging
  - [ ] Analyze all feedback using systematic-debugging
  - [ ] Fix all critical issues
  - [ ] Fix all medium issues
  - [ ] Re-test after each fix
  - [ ] Verify no regressions

- [ ] **Task 9:** Final component tests
  - [ ] Write remaining component tests if needed
  - [ ] Achieve > 80% coverage
  - [ ] All tests passing

## Fase 3: Final Verification & Delivery

- [ ] **Task 10:** Final verification
  - [ ] pnpm check: 0 errors
  - [ ] pnpm test: all passing (153+)
  - [ ] No dev server errors
  - [ ] Manual testing: audiences work
  - [ ] Manual testing: scheduling works
  - [ ] Manual testing: image upload works
  - [ ] Manual testing: audit log displays
  - [ ] Manual testing: detail page works
  - [ ] Manual testing: inline create works

- [ ] **Delivery:**
  - [ ] Commit all changes
  - [ ] Push to GitHub main
  - [ ] Save final checkpoint
  - [ ] Deliver to user
