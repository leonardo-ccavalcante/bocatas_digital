# OCR Country Detection & Document Validation Design

**Date:** 2026-04-26  
**Status:** Design Review  
**Scope:** Two related features for international document handling

---

## Executive Summary

This design introduces two complementary features to improve data quality for international document (`Documento_Extranjero`) registration:

1. **OCR pais_documento Extraction** - Automatically suggest the country code by analyzing the document image + extracted text + user context via LLM
2. **Document Country Validation** - Ensure `pais_documento` is provided for international documents with inline warnings

Together, these reduce manual data entry errors and ensure complete records for international beneficiaries.

---

## Problem Statement

**Current State:**
- Bocatas Digital supports international documents (`Documento_Extranjero`) with a `pais_documento` field
- When staff register international beneficiaries, they must manually enter the country code
- No validation prevents incomplete records (missing `pais_documento` for international docs)
- This leads to incomplete data and manual follow-up work

**Desired State:**
- System automatically suggests country code from document image
- Staff confirms the suggestion with explicit checkbox
- Validation warns about missing country codes with inline error UI
- Data quality improves, manual work decreases

---

## Feature 1: OCR pais_documento Extraction

### Overview

When a user uploads an international document during person registration, the system analyzes the document image to suggest the country code. The suggestion is pre-filled in the form, and the user must explicitly confirm it before saving.

### Data Flow

```
1. User uploads document image
   ↓
2. OCR pipeline extracts text + visual features
   ↓
3. LLM analyzes: image + extracted_text + pais_origen → country_suggestion + confidence
   ↓
4. Suggestion stored in form state (not persisted)
   ↓
5. Form pre-fills pais_documento field with suggestion
   ↓
6. User sees suggestion + confirmation checkbox
   ↓
7. User confirms OR overrides with dropdown
   ↓
8. Save only succeeds if country is confirmed/selected
```

### LLM Prompt Design

**Input:**
- Document image (base64)
- Extracted OCR text (from existing pipeline)
- Person's `pais_origen` (country of origin, if available)

**Output:**
```json
{
  "suggested_country_code": "FR",
  "confidence": 0.92,
  "reasoning": "Document shows French flag and 'République Française' text",
  "alternative_suggestions": ["ES", "IT"]
}
```

**Prompt Strategy:**
- Analyze visual features: colors, flags, national symbols, security features
- Parse text: country names, issuing authority, official seals
- Use context: if person is from France, France is more likely
- Return ISO 3166-1 alpha-2 codes only
- Include confidence score for future filtering

### Form Integration

**When suggestion exists:**
- Pre-fill `pais_documento` field with suggested code
- Show confirmation checkbox: "✓ Confirmar país: [FR]"
- Show alternative suggestions as dropdown fallback
- Helper text: "El sistema detectó el país del documento. Confirma o selecciona otro."

**When user interacts:**
- Checkbox checked → country confirmed, save allowed
- Dropdown changed → country overridden, save allowed
- Neither checked/changed → country unconfirmed, save blocked with message: "Confirma o selecciona el país del documento"

**When suggestion doesn't exist:**
- Show empty `pais_documento` field with dropdown
- No confirmation checkbox
- Validation warning applies (see Feature 2)

### Implementation Details

**New File: `server/_core/ocr-country-detection.ts`**
```typescript
export interface CountrySuggestion {
  suggested_country_code: string;
  confidence: number;
  reasoning: string;
  alternative_suggestions: string[];
}

export async function suggestCountryFromDocument(
  documentImage: Buffer | string,
  extractedText: string,
  paisOrigen?: string
): Promise<CountrySuggestion>
```

**Modified: `server/routers/persons.ts`**
- Add `pais_documento_confirmed?: boolean` to validation schema
- When `tipo_documento === "Documento_Extranjero"` and suggestion exists:
  - Require `pais_documento_confirmed === true` OR `pais_documento` manually set
  - Return validation error if neither

**Modified: `client/src/pages/PersonForm.tsx`**
- After OCR extraction, call backend to get country suggestion
- Store suggestion in form state
- Render confirmation checkbox if suggestion exists
- Track confirmation state
- Include in form submission

### Testing Strategy

**Unit Tests:**
- LLM prompt parsing: valid/invalid responses, edge cases
- Confidence scoring: high/medium/low confidence handling
- Country code validation: ISO 3166-1 alpha-2 format

**Integration Tests:**
- Form flow: upload → suggestion → confirmation → save
- Override flow: upload → suggestion → dropdown change → save
- Missing suggestion: upload → no suggestion → validation warning

**Manual Testing:**
- Real document images: passport, national ID, visa
- Different countries: EU, non-EU, special cases
- Edge cases: blurry images, unusual documents

---

## Feature 2: Document Country Validation

### Overview

Ensure that `Documento_Extranjero` records always have a `pais_documento` value. Validation warns users with inline field error UI but allows save to proceed (warning mode).

### Validation Rules

| Scenario | Rule | Behavior |
|----------|------|----------|
| `tipo_documento === "Documento_Extranjero"` + `pais_documento` empty | Invalid | Show inline warning, allow save |
| `tipo_documento === "Documento_Extranjero"` + `pais_documento` filled | Valid | No warning, allow save |
| `tipo_documento === "DNI"` + `pais_documento` empty | Valid | No warning, allow save |
| `tipo_documento === "DNI"` + `pais_documento` filled | Valid | No warning, allow save |
| `tipo_documento === "Pasaporte"` + `pais_documento` empty | Valid | No warning, allow save |

### Error Display

**Inline Field Warning (when invalid):**
- Red border around `pais_documento` field
- Helper text below: "País de origen del documento requerido para Documento Extranjero"
- Field remains editable
- Save button remains enabled

**Implementation:**
```typescript
// In form validation
if (formData.tipo_documento === "Documento_Extranjero" && !formData.pais_documento) {
  fieldErrors.pais_documento = "País de origen del documento requerido para Documento Extranjero";
}
```

### Backend Validation

**In `server/routers/persons.ts` `createPerson` procedure:**
```typescript
if (input.tipo_documento === "Documento_Extranjero" && !input.pais_documento) {
  // Log warning but don't throw error
  console.warn(`Warning: Documento_Extranjero without pais_documento for person ${input.nombre}`);
  // Could also trigger notification to staff
}
```

### Testing Strategy

**Unit Tests:**
- Validation rules for each document type
- Empty/null/whitespace handling
- Case sensitivity of enum values

**Form Tests:**
- Field shows warning when invalid
- Field clears warning when valid
- Save succeeds despite warning
- Save succeeds when field is valid

---

## Data Model

### No Schema Changes

The `pais_documento` field already exists in the `persons` table:
```sql
pais_documento VARCHAR(2) -- ISO 3166-1 alpha-2 code
```

### Form State (Transient)

New transient form field (not persisted):
```typescript
pais_documento_confirmed?: boolean // Tracks if user confirmed LLM suggestion
```

---

## Architecture

### Layering

```
Client (PersonForm.tsx)
  ↓ calls
Server (persons.ts router)
  ↓ calls
OCR Country Detection (ocr-country-detection.ts)
  ↓ calls
LLM Service (invokeLLM)
  ↓
Database (persons table)
```

### Error Handling

**LLM Suggestion Failures:**
- If LLM call fails: silently skip suggestion, show empty field
- If parsing fails: log error, show empty field
- User can still manually enter country

**Validation Failures:**
- Inline warning shown, save allowed
- No exception thrown
- Staff can review and correct later

---

## Success Criteria

1. ✅ LLM correctly identifies country from document image 80%+ of the time
2. ✅ User can confirm suggestion with single checkbox click
3. ✅ User can override suggestion with dropdown
4. ✅ Form prevents save if country unconfirmed (when suggestion exists)
5. ✅ Validation warns about missing `pais_documento` for `Documento_Extranjero`
6. ✅ Warning is inline field error, not blocking
7. ✅ All existing tests pass, no regressions
8. ✅ New tests cover both features

---

## Out of Scope

- Automatic country detection from user IP/location
- Multi-language document support (beyond OCR text)
- Historical pattern analysis (e.g., "user previously had Spanish docs")
- Batch import with country detection
- Admin override of validation rules

---

## Implementation Order

1. Implement `ocr-country-detection.ts` with LLM prompt
2. Add validation rules to `persons.ts` router
3. Update `PersonForm.tsx` to show confirmation UI
4. Write unit tests for country detection
5. Write form integration tests
6. Manual testing with real documents
7. Deploy and monitor

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| LLM accuracy low on poor-quality images | Show confidence score, allow manual override, log failures for improvement |
| User confusion about confirmation checkbox | Clear helper text, visual feedback on confirmation |
| Staff bypass validation by ignoring warnings | Dashboard alerts for incomplete records (future feature) |
| Performance impact of LLM calls | Cache results, async processing, timeout handling |

---

## Future Enhancements

- Dashboard report of incomplete `pais_documento` records
- Batch country detection for bulk imports
- Confidence-based filtering (only suggest if confidence > 80%)
- Multi-language document support
- Integration with country-specific validation (e.g., verify passport format)
