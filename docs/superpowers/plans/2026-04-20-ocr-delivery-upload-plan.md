# OCR Delivery Document Upload - Implementation Plan

**Date:** 2026-04-20  
**Scope:** Complete OCR extraction, validation, and UI for delivery document uploads  
**Estimated Effort:** 3-4 days  
**Dependencies:** Manus OCR API (already available)

---

## Phase 1: Database Schema & Migrations

**Goal:** Create entregas table with proper structure and indexes

### Tasks

1. **Create Drizzle Schema**
   - File: `drizzle/schema.ts`
   - Add `entregas` table definition
   - Include all fields: familia_id, fecha, persona_recibio, quantities, notas
   - Add indexes on familia_id, fecha
   - Add unique constraint on (familia_id, fecha)
   - **Verify:** TypeScript compiles, schema exports correctly

2. **Generate Migration SQL**
   - Run: `pnpm drizzle-kit generate`
   - Review generated SQL for correctness
   - **Verify:** Migration file created in `drizzle/migrations/`

3. **Apply Migration**
   - Use `webdev_execute_sql` to apply migration
   - **Verify:** Table created in database, can query it

4. **Add Drizzle Query Helper**
   - File: `server/db.ts`
   - Add `getEntregasByFamilia(familia_id)`
   - Add `createEntrega(data)`
   - Add `getEntregasByDate(fecha)`
   - **Verify:** Functions compile and have correct types

---

## Phase 2: Backend OCR Extraction & Validation

**Goal:** Extract delivery data from OCR text and validate

### Tasks

1. **Create OCR Extraction Module**
   - File: `server/ocrDeliveryExtraction.ts`
   - Function: `extractDeliveriesFromOCR(ocrText: string)`
   - Parse table structure from OCR output
   - Extract columns: familia_id, fecha, persona_recibio, products, notas
   - Parse quantities with units (e.g., "3.5kg" → {amount: 3.5, unit: "kg"})
   - Return structured rows with confidence scores
   - **Tests:** 15+ test cases covering:
     - Valid rows
     - Missing columns
     - Invalid formats
     - Special characters
     - Handwritten notes
   - **Verify:** All tests pass, 90%+ accuracy on mock OCR

2. **Create Validation Module**
   - File: `server/validateDeliveryRow.ts`
   - Function: `validateDeliveryRow(row, db)`
   - Validate familia_id format (UUID v4)
   - Check familia_id exists in database
   - Validate date format and not in future
   - Check quantities are positive
   - Detect duplicate entries (same familia_id + fecha)
   - Return validation result with errors/warnings
   - **Tests:** 20+ test cases covering:
     - Valid rows
     - Invalid UUIDs
     - Non-existent families
     - Future dates
     - Negative quantities
     - Duplicates
   - **Verify:** All tests pass, clear error messages

3. **Create tRPC Procedures**
   - File: `server/routers/entregas.ts`
   - Procedure: `uploadDeliveryDocument`
     - Input: file (File), locationId (string)
     - Call Manus OCR API with file
     - Extract delivery rows from OCR
     - Validate each row
     - Return preview data with warnings
   - Procedure: `saveDeliveries`
     - Input: array of validated delivery rows
     - Re-validate all rows
     - Check for duplicates
     - Save to database
     - Return success count
   - **Tests:** Integration tests covering:
     - Full upload → extract → save flow
     - Error handling
     - Duplicate prevention
   - **Verify:** All tests pass, procedures are typed correctly

---

## Phase 3: Frontend Upload & Confirmation UI

**Goal:** Build user interface for document upload and confirmation

### Tasks

1. **Create Upload Component Structure**
   - File: `client/src/components/DeliveryDocumentUpload.tsx`
   - Main component managing upload flow
   - State management: idle → uploading → preview → editing → saving → success
   - **Verify:** Component renders, state transitions work

2. **Create DocumentUploadZone Component**
   - File: `client/src/components/DocumentUploadZone.tsx`
   - Drag-and-drop file upload
   - File type validation (JPG, PNG, PDF)
   - File size validation (max 10MB)
   - Progress indicator
   - **Verify:** Can drag files, shows progress, validates types

3. **Create DeliveryPreviewTable Component**
   - File: `client/src/components/DeliveryPreviewTable.tsx`
   - Display extracted rows in table
   - Show confidence scores
   - Highlight warnings (yellow)
   - Show errors (red)
   - "Next" button to proceed to editing
   - **Verify:** Table displays correctly, warnings highlighted

4. **Create DeliveryEditableTable Component**
   - File: `client/src/components/DeliveryEditableTable.tsx`
   - Editable table cells
   - Click to edit functionality
   - Real-time validation feedback
   - Quantity parsing helper (split "3.5kg" into amount + unit)
   - Add/remove rows
   - "Confirm & Save" button
   - **Verify:** Can edit cells, validation works, save button functional

5. **Create ValidationWarnings Component**
   - File: `client/src/components/ValidationWarnings.tsx`
   - Display OCR validation issues
   - Invalid familia_id with dropdown selector
   - Missing required fields
   - Confidence warnings
   - Duplicate warnings
   - **Verify:** Warnings display correctly, dropdown works

6. **Integrate into Entregas Tab**
   - File: `client/src/pages/FamiliaDetalle.tsx`
   - Add "Cargar Documento" button in Entregas tab
   - Show DeliveryDocumentUpload modal when clicked
   - Refresh delivery list after successful save
   - **Verify:** Button appears, modal opens, list refreshes

---

## Phase 4: Testing & Error Handling

**Goal:** Comprehensive testing and error handling

### Tasks

1. **Unit Tests for OCR Extraction**
   - File: `server/ocrDeliveryExtraction.test.ts`
   - 15+ test cases
   - Coverage: Valid rows, missing data, special chars, confidence scores
   - **Verify:** All tests pass, >90% coverage

2. **Unit Tests for Validation**
   - File: `server/validateDeliveryRow.test.ts`
   - 20+ test cases
   - Coverage: UUID validation, duplicate detection, date validation
   - **Verify:** All tests pass, >90% coverage

3. **Integration Tests**
   - File: `server/entregas.test.ts`
   - Full flow: upload → extract → validate → save
   - Error cases: invalid UUID, duplicates, bad OCR
   - **Verify:** All tests pass

4. **Frontend Component Tests**
   - File: `client/src/components/DeliveryDocumentUpload.test.tsx`
   - Test state transitions
   - Test file upload
   - Test table editing
   - Test error display
   - **Verify:** All tests pass

5. **Error Handling**
   - OCR failures: Show clear error messages
   - Validation failures: Highlight problematic rows
   - Save failures: Rollback and show error
   - Network errors: Retry logic
   - **Verify:** All error paths tested

---

## Phase 5: Integration & Polish

**Goal:** Final integration and user experience polish

### Tasks

1. **Integrate with Existing Entregas Page**
   - Update FamiliaDetalle.tsx to show upload button
   - Refresh delivery list after save
   - Show success toast with count
   - **Verify:** Integration works end-to-end

2. **Add Loading States**
   - Show "Processing document..." during OCR
   - Show "Saving..." during confirmation
   - Disable buttons during processing
   - **Verify:** UX feels responsive

3. **Add Accessibility**
   - Keyboard navigation in tables
   - Screen reader support for warnings
   - ARIA labels on buttons
   - **Verify:** Keyboard accessible, screen reader works

4. **Documentation**
   - Add comments to complex functions
   - Document OCR extraction logic
   - Document validation rules
   - **Verify:** Code is well-documented

---

## Success Criteria

- ✅ Database: entregas table created with correct schema
- ✅ Backend: OCR extraction works with 90%+ accuracy
- ✅ Backend: Validation catches all error cases
- ✅ Frontend: Upload flow works end-to-end
- ✅ Frontend: User can edit and confirm data
- ✅ Tests: 100+ tests covering all scenarios
- ✅ Error handling: Clear messages for all failure cases
- ✅ Integration: Works with existing Entregas page

---

## Dependencies & Risks

### Dependencies
- Manus OCR API (already available)
- Database migration system (already available)
- tRPC router system (already available)

### Risks
- **OCR Accuracy:** Physical documents may have poor image quality
  - Mitigation: Show confidence scores, allow user edits
- **UUID Parsing:** OCR might misread UUIDs
  - Mitigation: Validate UUID format, show warnings
- **Duplicate Prevention:** Race condition if multiple uploads same time
  - Mitigation: Use database unique constraint

---

## Implementation Order

1. **Day 1:** Database schema + migrations + query helpers
2. **Day 1-2:** OCR extraction + validation modules + tests
3. **Day 2-3:** Frontend components + integration
4. **Day 3-4:** Testing, error handling, polish
5. **Day 4:** Final integration and documentation

---

## Rollback Plan

If critical issues arise:
1. Disable upload button (feature flag)
2. Rollback database migration
3. Revert frontend changes
4. Keep code in feature branch for later fixes

---

**Status:** ✅ Ready for Implementation
