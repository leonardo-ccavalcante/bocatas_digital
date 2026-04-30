# OCR Delivery Document Extraction - Implementation Plan

**Date:** April 27, 2026  
**Epic:** Delivery Document Management (OCR Enhancement)  
**Status:** Planning

---

## Overview

Add OCR capability to extract delivery data from photos of physical delivery tracking tables. Users can upload a photo instead of a CSV file, and the system will extract beneficiary names, delivery dates, and quantities using LLM-based table extraction. Human validation is required before saving to database.

---

## Requirements

### Functional Requirements

1. **Photo Upload Interface**
   - New tab in "Subir Documento de Entregas" modal: "📸 Escanear Documento"
   - Allow users to take photo or select from gallery
   - Support common image formats (JPEG, PNG, WebP)
   - Image size limit: 5MB

2. **LLM-Based Extraction**
   - Send photo to LLM with structured prompt
   - Extract: beneficiary names, delivery dates, quantities
   - Return confidence scores per row and field
   - Handle handwritten and printed text
   - Detect and report extraction issues (blurry, no table, etc.)

3. **Validation Workflow**
   - Display extracted data in editable table
   - Show confidence indicators (high/medium/low)
   - Allow user to edit individual cells
   - Allow user to add/remove rows
   - Option to reject and re-upload

4. **Data Persistence**
   - Save validated data to `entregas` table
   - Store original photo in S3 for audit trail
   - Log extraction metadata (confidence, timestamp, user)

### Non-Functional Requirements

- **Performance:** LLM extraction should complete within 10-15 seconds
- **Reliability:** Handle network failures gracefully
- **Security:** Validate image files before processing
- **Accessibility:** Keyboard navigation for validation table
- **Responsiveness:** Work on mobile and desktop

---

## Technical Design

### Backend Architecture

**New Service: `DeliveryDocumentOCRService`**

```typescript
interface ExtractedDelivery {
  beneficiaryName: string;
  nameConfidence: number; // 0-1
  deliveries: {
    date: string; // YYYY-MM-DD
    quantity: number;
    quantityConfidence: number;
  }[];
}

interface OCRExtractionResult {
  success: boolean;
  extractionConfidence: number; // 0-1
  documentDate?: string;
  beneficiaries: ExtractedDelivery[];
  warnings: string[];
  errors?: string[];
}

async function extractDeliveryDataFromImage(
  imageUrl: string,
  programaId: string
): Promise<OCRExtractionResult>
```

**LLM Prompt Structure:**

The prompt will instruct the LLM to:
1. Analyze the delivery table structure
2. Extract beneficiary names from rows
3. Extract delivery dates from columns
4. Extract quantities from cells
5. Return JSON with confidence scores
6. Flag unclear or ambiguous entries

**tRPC Procedure: `entregas.extractFromPhoto`**

```typescript
entregas.extractFromPhoto.mutation({
  input: {
    imageUrl: string; // S3 URL after upload
    programaId: string;
  },
  output: OCRExtractionResult
})
```

### Frontend Architecture

**New Component: `DeliveryDocumentOCRTab`**

1. **Photo Upload Section**
   - Camera input for mobile
   - File picker for desktop
   - Preview of selected photo

2. **Extraction Progress**
   - Loading spinner while LLM processes
   - Estimated time: 10-15 seconds
   - Cancel option

3. **Validation Table**
   - Editable table with extracted data
   - Columns: Beneficiary Name | Delivery Date | Quantity | Confidence
   - Inline editing (click to edit)
   - Add/Remove row buttons
   - Confidence badges (green/yellow/red)

4. **Action Buttons**
   - "Guardar Entregas" - Save validated data
   - "Rechazar y Reintentar" - Reject and re-upload
   - "Descargar Plantilla" - Download CSV template

**Modified Component: `DeliveryDocumentUpload`**

- Add tab switcher: "📄 CSV" | "📸 Escanear"
- Conditional rendering based on active tab

---

## Implementation Tasks

### Task 1: Create OCR Extraction Service (Backend)
**Files:**
- `server/_core/delivery-ocr.ts` - LLM integration
- `server/routers/entregas.ts` - Add `extractFromPhoto` procedure

**Subtasks:**
1. Write LLM prompt for table extraction
2. Implement image validation
3. Implement confidence scoring
4. Add error handling (blurry, no table, etc.)
5. Write unit tests

**Estimated Time:** 4-6 hours

---

### Task 2: Create Validation UI Component (Frontend)
**Files:**
- `client/src/components/DeliveryOCRValidation.tsx` - Main component
- `client/src/components/ConfidenceBadge.tsx` - Badge component
- `client/src/components/EditableDeliveryTable.tsx` - Editable table

**Subtasks:**
1. Build editable table component
2. Implement inline editing
3. Add confidence indicators
4. Add row management (add/remove)
5. Add form validation
6. Write component tests

**Estimated Time:** 6-8 hours

---

### Task 3: Integrate Photo Upload (Frontend)
**Files:**
- `client/src/components/DeliveryDocumentUpload.tsx` - Modify
- `client/src/components/PhotoUploadInput.tsx` - New component

**Subtasks:**
1. Add camera/file input
2. Implement image preview
3. Add file validation (size, format)
4. Implement upload to S3
5. Handle mobile camera access
6. Add error handling

**Estimated Time:** 3-4 hours

---

### Task 4: Connect UI to Backend (Frontend)
**Files:**
- `client/src/pages/FamiliasEntregas.tsx` - Modify modal
- `client/src/lib/trpc.ts` - Already has tRPC client

**Subtasks:**
1. Call `entregas.extractFromPhoto` mutation
2. Handle loading states
3. Handle errors and retries
4. Display extracted data in validation table
5. Save validated data via existing `entregas.create` mutation

**Estimated Time:** 3-4 hours

---

### Task 5: Testing & QA
**Files:**
- `server/__tests__/delivery-ocr.test.ts` - Backend tests
- `client/src/components/__tests__/DeliveryOCRValidation.test.tsx` - Frontend tests

**Subtasks:**
1. Unit tests for LLM prompt
2. Integration tests for extraction
3. Component tests for validation UI
4. E2E tests for complete workflow
5. Test with various document qualities
6. Test error scenarios

**Estimated Time:** 4-5 hours

---

## Data Model

No schema changes needed. Using existing `entregas` table.

**Metadata to Log:**
- `extraction_source`: 'ocr' | 'csv'
- `extraction_confidence`: number (0-1)
- `extraction_timestamp`: datetime
- `photo_url`: string (S3 URL)
- `extracted_by_user_id`: string

---

## Success Criteria

- ✅ Users can upload photo of delivery table
- ✅ LLM extracts data with >80% accuracy
- ✅ Validation table displays extracted data
- ✅ Users can edit and correct data
- ✅ Validated data saves to database
- ✅ Photo stored in S3 for audit trail
- ✅ All tests passing (>90% coverage)
- ✅ Zero TypeScript errors
- ✅ Responsive on mobile and desktop
- ✅ Error handling for edge cases

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| LLM accuracy varies with photo quality | Add confidence scores, allow manual correction |
| Slow LLM processing | Show progress indicator, set timeout limit |
| Large image files | Compress before upload, enforce size limit |
| Handwriting recognition errors | Provide validation UI for user correction |
| Mobile camera access issues | Fallback to file picker, clear error messages |

---

## Timeline

**Total Estimated Time:** 20-27 hours

- Task 1 (Backend): 4-6 hours
- Task 2 (Validation UI): 6-8 hours
- Task 3 (Photo Upload): 3-4 hours
- Task 4 (Integration): 3-4 hours
- Task 5 (Testing): 4-5 hours

**Recommended Approach:** Execute tasks in parallel where possible (Tasks 2 & 3 can run simultaneously while Task 1 is being implemented).

---

## Rollback Plan

If issues arise:
1. Keep CSV upload as fallback (always available)
2. Feature flag to disable OCR tab if needed
3. Rollback to previous checkpoint if critical bugs found

---

## Next Steps

1. ✅ Approve implementation plan
2. Create todo.md with all tasks
3. Start Task 1: Backend OCR service
4. Proceed with Tasks 2-5 in parallel
5. Comprehensive QA before delivery
