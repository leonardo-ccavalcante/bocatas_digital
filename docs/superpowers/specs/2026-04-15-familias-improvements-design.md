# Familias Program Improvements — Design Specification

**Date:** 2026-04-15  
**Author:** Manus AI  
**Status:** Design Review  
**Scope:** Batch import/export, member management, document upload validation, social reports, delivery management

---

## Executive Summary

The Familias program currently lacks critical bulk operations and data management features. This specification addresses five interconnected issues:

1. **Batch Import/Export** — No way to bulk-load or export family data
2. **Member Management** — Can't edit family members in detail view
3. **Document Upload Validation** — No enforcement that documents are uploaded when required
4. **Social Reports** — No interface to create or manage social reports
5. **Delivery Management** — Can't upload delivery photos or consents

This design proposes modular solutions that can be implemented incrementally, starting with member management (lowest complexity, high impact) and progressing to batch import/export (highest complexity, highest efficiency gain).

---

## Problem Statement

### Current State
- Families can only be viewed/edited one-at-a-time
- No bulk operations for data import/export
- Family members cannot be edited after creation
- Document uploads are optional toggles with no validation
- Social reports and delivery photos have no interface
- No audit trail for document uploads

### Impact
- **Inefficiency:** Manual data entry for each family
- **Data Quality:** No validation that required documents are uploaded
- **Compliance:** No audit trail for document management
- **Usability:** Incomplete workflows for social reports and deliveries

---

## Solution Architecture

### 1. Batch Import/Export System

#### 1.1 Export Functionality

**Three Export Modes:**

| Mode | Use Case | Fields | Scope |
|------|----------|--------|-------|
| **Update** | Sync complete family data | All fields (30+) | Full family record |
| **Audit** | Analysis and reporting | Key fields (15-20) | Family + members summary |
| **Verify** | Data spot-checking | Minimal fields (5-10) | ID + name + status |

**Export Flow:**
```
User clicks "Exportar Familias"
  → Modal opens with mode selection
  → Backend generates CSV template
  → User downloads file
  → File contains all families in selected mode
```

**CSV Structure (Update Mode Example):**
```
familia_id,nombre_familia,contacto_principal,telefono,direccion,miembros_count,estado,fecha_creacion,compliance_status,...
FAM-001,García López,Juan García,+34-123-456,Calle Principal 1,4,activo,2026-01-15,completo,...
FAM-002,Rodríguez Martín,María Rodríguez,+34-234-567,Calle Secundaria 2,3,activo,2026-02-20,incompleto,...
```

**Implementation:**
- `ExportFamiliesModal.tsx` — Mode selection and download
- `generateFamiliesCSV()` — Backend utility to generate CSV
- `exportFamilies` tRPC procedure — Handles export logic
- S3 storage for temporary CSV files

#### 1.2 Import Functionality

**Import Flow:**
```
User clicks "Importar Familias"
  → Modal opens with file upload
  → User selects CSV file
  → Backend validates structure and data
  → Shows validation report (errors, warnings, success count)
  → User confirms import
  → Backend performs batch upsert
  → Returns import summary
```

**Validation Rules:**
- CSV structure matches expected columns
- Required fields are present (familia_id, nombre_familia)
- Data types are correct (dates, numbers, enums)
- No duplicate familia_ids in import
- Familia_ids either don't exist (create) or exist (update)

**Conflict Resolution:**
- **Create mode:** If familia_id doesn't exist, create new family
- **Update mode:** If familia_id exists, merge data (user chooses merge strategy)
- **Merge strategies:**
  - Overwrite: Replace all fields
  - Merge: Keep existing values, fill gaps from import
  - Skip: Don't update, log as skipped

**Implementation:**
- `ImportFamiliesModal.tsx` — File upload and validation
- `importFamilies` tRPC procedure — Handles import logic
- CSV parsing utility with error collection
- Batch upsert with transaction support

#### 1.3 Data Models

**Database Schema (additions):**
```sql
-- Import/export history tracking
CREATE TABLE familia_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by INT NOT NULL REFERENCES users(id),
  import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  file_name TEXT,
  record_count INT,
  success_count INT,
  error_count INT,
  status TEXT, -- 'pending', 'completed', 'failed'
  error_log JSONB
);

CREATE TABLE familia_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exported_by INT NOT NULL REFERENCES users(id),
  export_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  mode TEXT, -- 'update', 'audit', 'verify'
  record_count INT,
  file_url TEXT
);
```

---

### 2. Member Management

#### 2.1 Member CRUD Interface

**Current State:** Members can only be viewed, not edited

**New Workflow:**
```
User opens family detail
  → Clicks "Editar miembros"
  → Modal opens showing all members
  → User can:
    - Add new member (form)
    - Edit existing member (inline or form)
    - Remove member (confirmation dialog)
    - Change member roles/relationships
  → Changes saved to backend
  → Family record updated
```

#### 2.2 Components

**MemberManagementModal.tsx:**
- List of current members
- Add member button
- Edit/delete actions per member
- Member form (name, role, relationship, status)
- Save/cancel buttons

**Member Form Fields:**
- Nombre (required)
- Rol (head_of_household, dependent, other)
- Relación (parent, child, sibling, other)
- Estado (activo, inactivo)
- Fecha de nacimiento (optional)
- Documentación (optional)

#### 2.3 Data Model

**Database Schema (additions):**
```sql
-- If not already exists
CREATE TABLE familia_miembros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES familias(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL, -- 'head_of_household', 'dependent', 'other'
  relacion TEXT, -- 'parent', 'child', 'sibling', 'other'
  estado TEXT DEFAULT 'activo', -- 'activo', 'inactivo'
  fecha_nacimiento DATE,
  documentacion_id UUID REFERENCES documentos(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 2.4 tRPC Procedures

```typescript
// Get family members
getFamiliaMembers: publicProcedure
  .input(z.object({ familiaId: z.string().uuid() }))
  .query(async ({ input }) => { /* ... */ })

// Add member
addFamiliaMember: protectedProcedure
  .input(MemberSchema)
  .mutation(async ({ input, ctx }) => { /* ... */ })

// Update member
updateFamiliaMember: protectedProcedure
  .input(z.object({ id: z.string().uuid(), ...MemberSchema }))
  .mutation(async ({ input, ctx }) => { /* ... */ })

// Delete member
deleteFamiliaMember: protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => { /* ... */ })
```

---

### 3. Document Upload Management with Audit Trail

#### 3.1 Document Status Workflow

**Status Rules:**
- **Person created** → Document field = "required" (disabled, red badge)
- **Document uploaded** → Field = "uploaded" (enabled, green badge)
- **Document missing** → Field = "missing" (disabled, yellow badge)

**User Interaction:**
```
User sees document field with status badge
  → Clicks badge/button
  → Modal opens with:
    - Current document (if exists)
    - Upload area
    - Upload history log
  → User uploads file
  → File stored in S3
  → History logged (user, timestamp, file size)
  → Status updated to "uploaded"
```

#### 3.2 Components

**DocumentUploadModal.tsx:**
- Document preview (if exists)
- Upload area (drag-drop or file picker)
- Upload history table:
  - Uploaded by (user name)
  - Upload date/time
  - File size
  - File type
  - Action (download, delete)
- Current status badge

**Document Status Badge:**
- "Requerido" (red) — Document required, not uploaded
- "Subido" (green) — Document uploaded
- "Faltante" (yellow) — Document was required but missing

#### 3.3 Data Model

**Database Schema (additions):**
```sql
CREATE TABLE documento_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  documento_tipo TEXT NOT NULL, -- 'dni', 'pasaporte', 'otro'
  file_url TEXT NOT NULL,
  file_key TEXT NOT NULL, -- S3 key
  file_size INT,
  file_type TEXT, -- MIME type
  uploaded_by INT NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_current BOOLEAN DEFAULT TRUE
);

-- Track upload history
CREATE TABLE documento_upload_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id UUID NOT NULL REFERENCES documento_uploads(id) ON DELETE CASCADE,
  uploaded_by INT NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action TEXT, -- 'upload', 'delete', 'replace'
  notes TEXT
);
```

#### 3.4 tRPC Procedures

```typescript
// Get document status
getDocumentoStatus: publicProcedure
  .input(z.object({ personaId: z.string().uuid() }))
  .query(async ({ input }) => { /* ... */ })

// Upload document
uploadDocumento: protectedProcedure
  .input(z.object({ 
    personaId: z.string().uuid(),
    file: z.instanceof(File),
    documentoTipo: z.enum(['dni', 'pasaporte', 'otro'])
  }))
  .mutation(async ({ input, ctx }) => { /* ... */ })

// Get upload history
getDocumentoHistory: publicProcedure
  .input(z.object({ personaId: z.string().uuid() }))
  .query(async ({ input }) => { /* ... */ })

// Delete document
deleteDocumento: protectedProcedure
  .input(z.object({ documentoId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => { /* ... */ })
```

---

### 4. Social Reports Management

#### 4.1 Social Report Workflow

**Current State:** No interface to create or manage social reports

**New Workflow:**
```
User navigates to "Informes Sociales"
  → Sees list of existing reports (if any)
  → Can:
    - Create new report (form)
    - Edit existing report
    - View report details
    - Delete report
  → Report contains:
    - Family info (auto-populated)
    - Social assessment text
    - Observations
    - Recommendations
    - Created/updated dates
    - Created by user info
```

#### 4.2 Components

**SocialReportPanel.tsx:**
- List of reports for family
- Create report button
- Report form with:
  - Assessment text (rich text editor)
  - Observations
  - Recommendations
  - Status (draft, completed, archived)
- Report history (created/updated by whom, when)

#### 4.3 Data Model

**Database Schema (additions):**
```sql
CREATE TABLE familia_informes_sociales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES familias(id) ON DELETE CASCADE,
  assessment_text TEXT,
  observations TEXT,
  recommendations TEXT,
  status TEXT DEFAULT 'draft', -- 'draft', 'completed', 'archived'
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 4.4 tRPC Procedures

```typescript
// Get reports for family
getFamiliaReports: publicProcedure
  .input(z.object({ familiaId: z.string().uuid() }))
  .query(async ({ input }) => { /* ... */ })

// Create report
createFamiliaReport: protectedProcedure
  .input(SocialReportSchema)
  .mutation(async ({ input, ctx }) => { /* ... */ })

// Update report
updateFamiliaReport: protectedProcedure
  .input(z.object({ id: z.string().uuid(), ...SocialReportSchema }))
  .mutation(async ({ input, ctx }) => { /* ... */ })

// Delete report
deleteFamiliaReport: protectedProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => { /* ... */ })
```

---

### 5. Delivery Management

#### 5.1 Delivery Workflow

**Current State:** No interface to upload delivery photos or consents

**New Workflow:**
```
User navigates to "Entregas"
  → Sees list of deliveries for family
  → Can:
    - Create new delivery (date, type)
    - Upload delivery photos
    - Upload consent forms
    - View delivery history
    - Mark as completed
  → Each delivery tracks:
    - Date
    - Type (food, supplies, other)
    - Photos (multiple)
    - Consents (multiple)
    - Status (pending, completed, archived)
    - Created by user info
```

#### 5.2 Components

**DeliveryPhotosPanel.tsx:**
- List of deliveries
- Create delivery button
- Delivery form with:
  - Date (required)
  - Type (dropdown)
  - Status
- Photo upload area (multiple files)
- Consent upload area (multiple files)
- File list with:
  - File name
  - Upload date
  - Uploaded by
  - Actions (download, delete)

#### 5.3 Data Model

**Database Schema (additions):**
```sql
CREATE TABLE familia_entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES familias(id) ON DELETE CASCADE,
  fecha_entrega DATE NOT NULL,
  tipo TEXT NOT NULL, -- 'alimentos', 'suministros', 'otro'
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'archived'
  notas TEXT,
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE entrega_archivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id UUID NOT NULL REFERENCES familia_entregas(id) ON DELETE CASCADE,
  archivo_tipo TEXT NOT NULL, -- 'foto', 'consentimiento'
  file_url TEXT NOT NULL,
  file_key TEXT NOT NULL, -- S3 key
  file_name TEXT,
  uploaded_by INT NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 5.4 tRPC Procedures

```typescript
// Get deliveries for family
getFamiliaEntregas: publicProcedure
  .input(z.object({ familiaId: z.string().uuid() }))
  .query(async ({ input }) => { /* ... */ })

// Create delivery
createEntrega: protectedProcedure
  .input(EntregaSchema)
  .mutation(async ({ input, ctx }) => { /* ... */ })

// Upload delivery file (photo or consent)
uploadEntregaArchivo: protectedProcedure
  .input(z.object({
    entregaId: z.string().uuid(),
    file: z.instanceof(File),
    archivoTipo: z.enum(['foto', 'consentimiento'])
  }))
  .mutation(async ({ input, ctx }) => { /* ... */ })

// Delete delivery file
deleteEntregaArchivo: protectedProcedure
  .input(z.object({ archivoId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => { /* ... */ })
```

---

## Implementation Strategy

### Phase 1: Member Management (Week 1)
- Lowest complexity, high impact
- Unblocks family detail editing
- No external dependencies

### Phase 2: Document Upload Modal (Week 1-2)
- Medium complexity, high compliance value
- Integrates with S3 storage
- Adds audit trail

### Phase 3: Batch Import/Export (Week 2-3)
- Highest complexity, highest efficiency gain
- CSV parsing and validation
- Conflict resolution

### Phase 4: Social Reports (Week 3)
- Medium complexity, independent workflow
- Rich text editor integration
- User tracking

### Phase 5: Delivery Management (Week 3-4)
- Medium complexity, independent workflow
- Photo/file management
- Status tracking

---

## Testing Strategy

### Unit Tests
- CSV parsing and validation
- Member CRUD operations
- Document upload validation
- Report creation/update
- Delivery management

### Integration Tests
- End-to-end import/export workflow
- Member editing with family updates
- Document upload with audit trail
- Report creation and retrieval
- Delivery photo/consent upload

### E2E Tests
- Full user workflows for each feature
- Error handling and edge cases
- Batch operations with large datasets
- Concurrent uploads

---

## Success Criteria

1. **Batch Import/Export**
   - ✅ Export all three modes (Update, Audit, Verify)
   - ✅ Import with validation and error reporting
   - ✅ Conflict resolution working
   - ✅ Import history tracked

2. **Member Management**
   - ✅ Add/edit/delete members
   - ✅ Member roles and relationships
   - ✅ Changes reflected in family record

3. **Document Upload**
   - ✅ Required documents enforced
   - ✅ Upload modal with history
   - ✅ Audit trail complete
   - ✅ Status badges accurate

4. **Social Reports**
   - ✅ Create/edit/delete reports
   - ✅ Rich text editor working
   - ✅ User tracking accurate

5. **Delivery Management**
   - ✅ Create deliveries
   - ✅ Upload photos and consents
   - ✅ File management working
   - ✅ Status tracking accurate

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| CSV parsing errors on large files | Implement chunked processing, clear error reporting |
| Concurrent member edits | Use optimistic locking or conflict detection |
| S3 upload failures | Retry logic, fallback to local storage temporarily |
| Audit trail performance | Index upload_at, created_by columns |
| Data loss during import | Transaction support, rollback on error |

---

## Notes

- All timestamps stored as UTC
- All file uploads go to S3 with random suffixes
- Audit trail immutable (no deletes, only inserts)
- User info (name, email) denormalized in audit tables for historical accuracy
- All tRPC procedures require authentication (except public queries)
- Admin-only operations use `adminProcedure`

