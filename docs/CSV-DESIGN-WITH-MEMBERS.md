# CSV Export/Import Design: Families + Members with UUIDs

## Overview

Comprehensive CSV structure that enables bulk management of families and their members with zero data mismatches through UUID-based matching.

## CSV Structure

### Header Row
```
familia_id,familia_numero,nombre_familia,contacto_principal,telefono,direccion,estado,fecha_creacion,miembros_count,docs_identidad,padron_recibido,justificante_recibido,consent_bocatas,consent_banco_alimentos,informe_social,informe_social_fecha,alta_en_guf,fecha_alta_guf,guf_verified_at,miembro_id,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento,miembro_estado
```

### Data Rows

**Family-only row (no members):**
```
d0000-0001,FAM-001,Maria Garcia Lopez,Juan Garcia,+34-123-456-789,Calle Principal 1,activo,2026-01-15,0,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10,,,,,
```

**Family with members (repeated family data for each member):**
```
d0000-0001,FAM-001,Maria Garcia Lopez,Juan Garcia,+34-123-456-789,Calle Principal 1,activo,2026-01-15,2,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10,m0001-0001,Maria Garcia Lopez,head_of_household,titular,1980-05-15,activo
d0000-0001,FAM-001,Maria Garcia Lopez,Juan Garcia,+34-123-456-789,Calle Principal 1,activo,2026-01-15,2,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10,m0001-0002,Juan Garcia Lopez,dependent,hijo,2010-03-20,activo
```

## Key Design Principles

### 1. UUID-First Matching
- **familia_id** (UUID) is the primary identifier for families
- **miembro_id** (UUID) is the primary identifier for members
- Both are in first position to enable reliable matching during import
- Falls back to familia_numero/miembro_nombre if UUIDs missing (backward compatible)

### 2. Family-Member Relationship
- Each member row includes the familia_id to link to its family
- During import, members are matched to families by familia_id
- Prevents member mismatches even if family names change

### 3. Data Integrity
- Duplicate familia_id detection prevents duplicate family imports
- Duplicate miembro_id detection prevents duplicate member imports
- UUID validation ensures format correctness before import

### 4. Backward Compatibility
- If familia_id missing: fall back to familia_numero matching
- If miembro_id missing: fall back to miembro_nombre matching
- Existing CSVs without UUIDs still work (less reliable)

## Export Modes

### 1. Update Mode (Full)
- All family fields
- All member fields
- Used for complete family data backup/transfer

### 2. Audit Mode (Key Fields)
- Family: numero, nombre, contacto, estado, fecha_creacion, miembros_count
- Member: id, nombre, rol, relacion, estado
- Used for audits and reporting

### 3. Verify Mode (Minimal)
- Family: id, numero, nombre, contacto, estado
- Member: id, nombre, rol, estado
- Used for quick verification

## Import Merge Strategies

### 1. Overwrite
- Replace existing family/member data completely
- Uses UUID for matching
- Overwrites all fields

### 2. Merge (Default)
- Update only empty fields
- Uses UUID for matching
- Preserves existing data if not empty

### 3. Skip
- Skip existing families/members
- Uses UUID for matching
- Only creates new records

## Validation Rules

### Family Validation
- familia_id: Valid UUID v4 format (if provided)
- familia_numero: Alphanumeric, hyphens, underscores
- nombre_familia: Required, non-empty
- contacto_principal: Required, non-empty
- estado: One of [activo, inactivo, suspendido]
- Dates: Valid ISO 8601 format
- Booleans: true/false, 1/0, yes/no

### Member Validation
- miembro_id: Valid UUID v4 format (if provided)
- miembro_nombre: Required, non-empty
- miembro_rol: One of [head_of_household, dependent, other]
- miembro_relacion: One of [parent, child, sibling, other]
- miembro_fecha_nacimiento: Valid ISO 8601 date (optional)
- miembro_estado: One of [activo, inactivo]

### Relationship Validation
- Each member must have a valid familia_id
- familia_id must exist in database or be created in same import
- Member count must match actual member rows

## Error Handling

### Critical Errors (Import Fails)
- Invalid UUID format
- Duplicate familia_id in CSV
- Duplicate miembro_id in CSV
- Missing required fields
- Invalid enum values

### Warnings (Import Continues)
- familia_id not found in database (creates new family)
- miembro_id not found in database (creates new member)
- Invalid date format
- Member count mismatch

## Example Workflow

### Export
```bash
User clicks "Exportar CSV" → Select mode (update/audit/verify)
→ System queries families + members
→ Generates CSV with familia_id and miembro_id
→ User downloads file
```

### Import
```bash
User selects CSV file → System validates structure
→ Validates all familia_id and miembro_id UUIDs
→ Shows validation errors/warnings
→ User selects merge strategy (overwrite/merge/skip)
→ System imports families and members
→ Updates familia_id and miembro_id in database
→ Shows success count and any errors
```

## Benefits

1. **Zero Data Mismatches**: UUIDs prevent matching wrong families/members
2. **Bulk Operations**: Import/export entire family structures at once
3. **Audit Trail**: UUIDs enable tracking of specific records across exports
4. **Backward Compatible**: Works with or without UUIDs
5. **Data Integrity**: Validation prevents corrupt data entry
6. **Flexible Merge**: Three strategies for different use cases
