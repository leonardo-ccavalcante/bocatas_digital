# OCR-Based Delivery Document Upload System - Design Specification

**Date:** 2026-04-20  
**Status:** Approved (Updated with Header Metadata)  
**Author:** Manus AI  
**Epic:** Familias Improvements - Phase 3: Document Upload & OCR

---

## Executive Summary

This specification describes a system for uploading physical delivery documents (entregas), extracting data via OCR including document header metadata, and automatically updating family delivery records with UUID-based matching to ensure zero data mismatches.

**Key Innovation:** Physical documents now include:
- Document header with: Número de Albarán, Número de Reparto, Total de Personas Asistidas, Fecha
- familia_id (UUID) in first column of data table, enabling reliable matching during OCR extraction

---

## 1. Requirements

### Functional Requirements

1. **Document Upload**
   - Users can upload physical delivery document images (JPG, PNG, PDF)
   - System processes document via OCR
   - Extracted data displayed in preview table

2. **Header Metadata Extraction**
   - OCR extracts document header: Número de Albarán, Número de Reparto, Número de Factura de Carne, Total de Personas Asistidas, Fecha
   - Validates header fields are present and valid
   - Stores header data in `entregas_batch` table
   - Links all delivery rows to batch for audit trail

3. **Data Extraction**
   - OCR extracts table structure from document body
   - Parses columns: familia_id (UUID), fecha, persona_recibio, productos, notas
   - Validates familia_id exists in database
   - Parses quantities with units (e.g., "3.5kg" → amount: 3.5, unit: "kg")
   - Captures OCR confidence scores for each row

4. **User Confirmation Flow**
   - Step 1: Display extracted header metadata for review
   - Step 2: Preview extracted delivery rows (read-only)
   - Step 3: Edit individual cells to correct OCR errors
   - Step 4: Confirm and save all rows to database

5. **Data Persistence**
   - Save batch header to `entregas_batch` table
   - Save delivery records to `entregas` table
   - Link all records to batch via entregas_batch_id
   - Link to families via familia_id (UUID)
   - Track who received delivery, when, and from which batch

### Non-Functional Requirements

- OCR accuracy: Aim for 90%+ on well-scanned documents
- Performance: Process document within 5 seconds
- Reliability: Validate all data before saving (no partial saves)
- User Experience: Clear error messages for OCR failures
- Audit Trail: All deliveries linked to source batch document

---

## 2. Data Model

### New Tables

#### Table 1: `entregas_batch` (Document Header)

Captures document-level metadata from physical form header:

```sql
CREATE TABLE entregas_batch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_albaran VARCHAR(100) NOT NULL UNIQUE,  -- Número de Albarán
  numero_reparto VARCHAR(100) NOT NULL,          -- Número de Reparto
  numero_factura_carne VARCHAR(100),              -- Número de Factura de Carne
  total_personas_asistidas INTEGER NOT NULL,     -- Total de Personas Asistidas
  fecha_reparto DATE NOT NULL,                    -- Distribution date
  documento_imagen_url TEXT,                      -- S3 URL to uploaded document
  ocr_confidence DECIMAL(3, 2),                   -- Overall OCR confidence (0-1)
  estado ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_numero_albaran (numero_albaran),
  INDEX idx_numero_factura_carne (numero_factura_carne),
  INDEX idx_fecha_reparto (fecha_reparto)
);
```

#### Table 2: `entregas` (Individual Delivery Records)

Captures individual family delivery records extracted from document rows:

```sql
CREATE TABLE entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entregas_batch_id UUID NOT NULL REFERENCES entregas_batch(id) ON DELETE CASCADE,
  familia_id UUID NOT NULL REFERENCES families(id),
  fecha DATE NOT NULL,
  persona_recibio VARCHAR(255),
  frutas_hortalizas_cantidad DECIMAL(10, 2),
  frutas_hortalizas_unidad VARCHAR(50),
  carne_cantidad DECIMAL(10, 2),
  carne_unidad VARCHAR(50),
  notas TEXT,
  ocr_row_confidence DECIMAL(3, 2),              -- Confidence for this row (0-1)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_familia_id (familia_id),
  INDEX idx_fecha (fecha),
  INDEX idx_batch_id (entregas_batch_id),
  UNIQUE KEY unique_entrega (familia_id, fecha, entregas_batch_id)
);
```

**Rationale:**
- Batch table captures document-level metadata (albarán, reparto, total personas)
- Batch table tracks OCR processing state and document image URL
- Individual entregas linked to batch for audit trail and bulk operations
- UUID primary keys for consistency with system design
- familia_id foreign key ensures referential integrity
- Separate quantity + unit columns for structured data
- OCR confidence scores enable quality control and filtering
- Unique constraint prevents duplicate entries per batch
- Cascade delete ensures data consistency

---

## 3. Architecture

### 3.1 Backend Components

#### OCR Extraction Function
**File:** `server/ocrDeliveryExtraction.ts`

```typescript
interface ExtractedBatchHeader {
  numero_albaran: string;
  numero_reparto: string;
  numero_factura_carne: string;  // Meat invoice number
  total_personas_asistidas: number;
  fecha_reparto: string;  // YYYY-MM-DD
  confidence: number;     // 0-100
  warnings: string[];
}

interface ExtractedDeliveryRow {
  familia_id: string;           // UUID from first column
  fecha: string;                // Date (YYYY-MM-DD)
  persona_recibio: string;      // Person who received
  frutas_hortalizas_cantidad: number;
  frutas_hortalizas_unidad: string;
  carne_cantidad: number;
  carne_unidad: string;
  notas: string;
  confidence: number;           // 0-100 OCR confidence
  warnings: string[];           // Validation warnings
}

interface ExtractedDeliveryDocument {
  header: ExtractedBatchHeader;
  rows: ExtractedDeliveryRow[];
}

export async function extractDeliveriesFromOCR(
  imageUrl: string,
  ocrText: string
): Promise<ExtractedDeliveryDocument>
```

**Responsibilities:**
- Parse OCR text to extract header metadata
- Parse OCR text into structured delivery rows
- Validate familia_id format (UUID v4)
- Parse quantities with units
- Return confidence scores for header and each row
- Collect warnings for invalid data

#### Validation Function
**File:** `server/validateDeliveryRow.ts`

```typescript
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateBatchHeader(
  header: ExtractedBatchHeader
): Promise<ValidationResult>

export async function validateDeliveryRow(
  row: ExtractedDeliveryRow,
  db: Database
): Promise<ValidationResult>
```

**Validates:**
- Header: Albarán number unique, reparto number valid, total personas > 0, date valid
- Row: familia_id exists and is active, date is valid and not in future, quantities are positive, no duplicate entry for same familia_id + fecha, required fields present

#### tRPC Procedures
**File:** `server/routers/entregas.ts`

```typescript
// Upload and extract
uploadDeliveryDocument: publicProcedure
  .input(z.object({ file: z.instanceof(File), locationId: z.string() }))
  .mutation(async ({ input }) => {
    // 1. Call Manus OCR API
    // 2. Extract header and delivery rows
    // 3. Validate header and each row
    // 4. Return preview data with warnings
  })

// Save confirmed deliveries
saveDeliveries: protectedProcedure
  .input(z.object({
    header: BatchHeaderSchema,
    rows: z.array(DeliveryRowSchema)
  }))
  .mutation(async ({ input, ctx }) => {
    // 1. Re-validate header and all rows
    // 2. Check for duplicates
    // 3. Save batch header
    // 4. Save delivery rows linked to batch
    // 5. Return success count
  })
```

### 3.2 Frontend Components

#### DeliveryDocumentUpload.tsx
Main component managing the upload flow.

**States:**
- `idle`: Initial state, show upload zone
- `uploading`: Processing document
- `headerReview`: Show extracted header for review
- `preview`: Show extracted delivery data (read-only)
- `editing`: Allow user to edit cells
- `saving`: Confirming and saving
- `success`: Show success message

**Props:** None (uses tRPC and local state)

#### DocumentUploadZone.tsx
Drag-and-drop upload interface.

**Features:**
- Drag-and-drop support
- Click to select file
- File type validation (JPG, PNG, PDF)
- File size validation (max 10MB)
- Progress indicator during upload

#### BatchHeaderReview.tsx
Display extracted document header metadata.

**Features:**
- Show Número de Albarán, Número de Reparto, Total Personas, Fecha
- Show OCR confidence for header
- Display warnings if any
- "Next" button to proceed to delivery rows

#### DeliveryPreviewTable.tsx
Read-only preview of extracted delivery data.

**Features:**
- Display extracted rows in table format
- Show confidence score for each row
- Highlight warnings in yellow
- Show validation errors in red
- "Next" button to proceed to editing

#### DeliveryEditableTable.tsx
Editable table for user corrections.

**Features:**
- Click cells to edit
- Real-time validation feedback
- Quantity parsing helper (e.g., "3.5kg" → split into amount + unit)
- Add/remove rows
- "Confirm & Save" button

#### ValidationWarnings.tsx
Display OCR validation issues.

**Shows:**
- Invalid familia_id (with option to select from dropdown)
- Missing required fields
- OCR confidence warnings
- Duplicate entry warnings
- Header metadata warnings

---

## 4. Data Flow

### Upload → Extract → Review Header → Preview → Edit → Save

```
User uploads document
         ↓
Backend calls Manus OCR API
         ↓
Extract header metadata (Albarán, Reparto, Total Personas, Fecha)
         ↓
Extract table structure and rows
         ↓
Parse rows (familia_id, fecha, quantities, etc.)
         ↓
Validate header and each row
         ↓
Return to frontend with warnings
         ↓
Frontend displays header review
         ↓
User reviews header and clicks "Next"
         ↓
Frontend displays delivery rows preview (read-only)
         ↓
User reviews and clicks "Edit"
         ↓
Frontend shows editable table
         ↓
User corrects OCR errors (edit cells)
         ↓
User clicks "Confirm & Save"
         ↓
Backend re-validates header and all rows
         ↓
Save batch header to entregas_batch
         ↓
Save delivery rows to entregas (linked to batch)
         ↓
Show success: "✓ Batch ALB-2026-04-20-001: 12 entregas guardadas"
```

---

## 5. Error Handling

### OCR Failures
- **No table detected:** Show error "No se detectó tabla en el documento"
- **No header detected:** Show error "No se detectó encabezado del documento"
- **Poor image quality:** Show warning "Calidad de imagen baja, revise cuidadosamente"
- **Confidence < 70%:** Highlight affected rows/header, require user confirmation

### Validation Failures
- **Invalid Albarán:** Show error "Número de Albarán inválido o duplicado"
- **Invalid familia_id:** Show warning, allow user to select from dropdown
- **Missing date:** Highlight row, require user input
- **Duplicate entry:** Show warning "Esta familia ya tiene entrega en esta fecha"
- **Future date:** Show error "No se puede registrar entrega en fecha futura"

### Save Failures
- **Database error:** Show error message, allow retry
- **Duplicate constraint violation:** Show error, suggest reviewing dates
- **Partial save:** Rollback all changes, show which rows failed

---

## 6. Integration Points

### With Existing Features
- **Entregas Tab (FamiliaDetalle.tsx):** Add "Cargar Documento" button
- **Familias List:** Add bulk upload option
- **Dashboard:** Show delivery upload stats

### With External Services
- **Manus OCR API:** Already available, use for document processing
- **Database:** New entregas_batch and entregas tables, migrations

---

## 7. Testing Strategy

### Unit Tests
- Header extraction: Parse header from mock OCR text
- Row extraction: Extract rows from mock OCR text
- Header validation: Check Albarán uniqueness, date validity
- Row validation: Check UUID format, date validation, quantity parsing
- Quantity parsing: "3.5kg" → {amount: 3.5, unit: "kg"}

### Integration Tests
- Full flow: Upload → Extract → Validate → Save
- Error cases: Invalid UUID, duplicate entries, bad OCR, invalid header
- Edge cases: Special characters, handwritten notes, poor image quality

### Manual Testing
- Real document upload with various image qualities
- OCR accuracy on actual delivery documents
- User confirmation flow with edits
- Header metadata extraction accuracy

---

## 8. Success Criteria

- ✅ OCR extracts 90%+ of header metadata accurately
- ✅ OCR extracts 90%+ of delivery data accurately
- ✅ UUID matching prevents any data mismatches
- ✅ Header metadata captured and stored correctly
- ✅ User can correct OCR errors before saving
- ✅ All delivery records saved with correct familia_id and batch_id
- ✅ No duplicate entries created
- ✅ Clear error messages guide user on failures
- ✅ Audit trail: All deliveries linked to source batch

---

## 9. Future Enhancements

- Batch upload multiple documents
- Scheduled OCR processing for large batches
- OCR training on delivery document format
- Mobile app for on-site document capture
- Integration with delivery tracking system
- Batch statistics dashboard

---

## 10. Appendix: Physical Document Format

### Document Header (Top of Page)

The document header MUST include:
```
Número de Albarán: [number]        Número de Reparto: [number]
Número de Factura de Carne: [number]
Fecha: [YYYY-MM-DD]
Total de Personas Asistidas: [number]
```

**Example header:**
```
Número de Albarán: ALB-2026-04-20-001    Número de Reparto: REP-2026-04-001
Número de Factura de Carne: FAC-CARNE-2026-04-001
Fecha: 2026-04-20
Total de Personas Asistidas: 28
```

### Document Table (Body)

**Required columns (left to right):**
1. `familia_id` - UUID of family (e.g., d0000-0000-0000-0000-000000000001)
2. `fecha` - Delivery date (YYYY-MM-DD)
3. `persona_recibio` - Name of person who received
4. `frutas_hortalizas_cantidad` - Quantity (number)
5. `frutas_hortalizas_unidad` - Unit (kg, unidad, etc.)
6. `carne_cantidad` - Quantity (number)
7. `carne_unidad` - Unit (kg, unidad, etc.)
8. `notas` - Optional notes/comments

**Example row:**
```
d0000-0001 | 2026-04-20 | Maria Garcia | 3.5 | kg | 2 | kg | Entrega sin problemas
```

---

**Document Status:** ✅ Ready for Implementation
