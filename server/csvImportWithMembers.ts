export interface ImportValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recordCount: number;
  familyCount: number;
  memberCount: number;
}

interface ParsedRow {
  [key: string]: unknown;
}

// Required fields for CSV import
const REQUIRED_FAMILY_FIELDS = ['familia_numero', 'nombre_familia', 'contacto_principal'];
const REQUIRED_MEMBER_FIELDS = ['miembro_nombre', 'miembro_rol'];

// Valid enum values
const VALID_ESTADOS = ['activo', 'inactivo', 'suspendido'];
const VALID_MIEMBRO_ROLES = ['head_of_household', 'dependent', 'other'];
const VALID_MIEMBRO_RELACIONES = ['parent', 'child', 'sibling', 'spouse', 'other'];

/**
 * Parse CSV string into rows
 * Handles escaped quotes and commas within quoted fields
 */
function parseCSVRows(csv: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      }
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      currentField += char;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Validate UUID v4 format
 */
function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Validate CSV structure and data for families + members
 */
export function validateFamiliesWithMembersCSV(csv: string): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!csv || !csv.trim()) {
    return {
      isValid: false,
      errors: ['CSV file is empty'],
      warnings: [],
      recordCount: 0,
      familyCount: 0,
      memberCount: 0,
    };
  }

  const rows = parseCSVRows(csv);

  if (rows.length === 0) {
    return {
      isValid: false,
      errors: ['No data found in CSV'],
      warnings: [],
      recordCount: 0,
      familyCount: 0,
      memberCount: 0,
    };
  }

  // Parse header
  const headers = rows[0];
  const headerMap = new Map(headers.map((h, i) => [h.toLowerCase(), i]));

  // Validate required headers
  for (const required of REQUIRED_FAMILY_FIELDS) {
    if (!headerMap.has(required.toLowerCase())) {
      errors.push(`Missing required header: ${required}`);
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings,
      recordCount: 0,
      familyCount: 0,
      memberCount: 0,
    };
  }

  if (rows.length === 1) {
    return {
      isValid: false,
      errors: ['CSV contains only header, no data rows'],
      warnings,
      recordCount: 0,
      familyCount: 0,
      memberCount: 0,
    };
  }

  // Validate data rows
  const seenFamiliaIds = new Set<string>();
  const seenMiembroIds = new Set<string>();
  let recordCount = 0;
  let familyCount = 0;
  let memberCount = 0;
  let lastFamiliaId = '';

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const record: ParsedRow = {};

    // Map row values to headers
    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
      const header = headers[colIndex];
      const value = row[colIndex] || '';
      record[header] = value;
    }

    // Check required family fields
    for (const required of REQUIRED_FAMILY_FIELDS) {
      const value = record[required];
      if (!value || String(value).trim() === '') {
        errors.push(`Row ${rowIndex + 1}: Missing required field "${required}"`);
      }
    }

    // Validate familia_id (UUID) if provided
    const familiaId = String(record.familia_id || '').trim();
    if (familiaId) {
      if (!isValidUUID(familiaId)) {
        errors.push(`Row ${rowIndex + 1}: Invalid familia_id format "${familiaId}" (must be valid UUID v4)`);
      }
      if (seenFamiliaIds.has(familiaId)) {
        errors.push(`Row ${rowIndex + 1}: Duplicate familia_id "${familiaId}"`);
      } else {
        seenFamiliaIds.add(familiaId);
        if (familiaId !== lastFamiliaId) {
          familyCount++;
          lastFamiliaId = familiaId;
        }
      }
    }

    // Validate miembro_id (UUID) if provided
    const miembroId = String(record.miembro_id || '').trim();
    if (miembroId) {
      if (!isValidUUID(miembroId)) {
        errors.push(`Row ${rowIndex + 1}: Invalid miembro_id format "${miembroId}" (must be valid UUID v4)`);
      }
      if (seenMiembroIds.has(miembroId)) {
        errors.push(`Row ${rowIndex + 1}: Duplicate miembro_id "${miembroId}"`);
      } else {
        seenMiembroIds.add(miembroId);
        memberCount++;
      }
    }

    // Validate miembro_rol if provided
    if (record.miembro_rol) {
      const rol = String(record.miembro_rol).toLowerCase();
      if (!VALID_MIEMBRO_ROLES.includes(rol)) {
        warnings.push(`Row ${rowIndex + 1}: Invalid miembro_rol "${record.miembro_rol}" (should be one of: ${VALID_MIEMBRO_ROLES.join(', ')})`);
      }
    }

    // Validate miembro_relacion if provided
    if (record.miembro_relacion) {
      const relacion = String(record.miembro_relacion).toLowerCase();
      if (!VALID_MIEMBRO_RELACIONES.includes(relacion)) {
        warnings.push(`Row ${rowIndex + 1}: Invalid miembro_relacion "${record.miembro_relacion}" (should be one of: ${VALID_MIEMBRO_RELACIONES.join(', ')})`);
      }
    }

    // Validate estado if provided
    if (record.estado) {
      const estado = String(record.estado).toLowerCase();
      if (!VALID_ESTADOS.includes(estado)) {
        warnings.push(`Row ${rowIndex + 1}: Invalid estado "${record.estado}" (should be one of: ${VALID_ESTADOS.join(', ')})`);
      }
    }

    // Validate miembro_estado if provided
    if (record.miembro_estado) {
      const miembroEstado = String(record.miembro_estado).toLowerCase();
      if (!['activo', 'inactivo'].includes(miembroEstado)) {
        warnings.push(`Row ${rowIndex + 1}: Invalid miembro_estado "${record.miembro_estado}" (should be activo or inactivo)`);
      }
    }

    // Validate date fields
    const dateFields = ['fecha_creacion', 'informe_social_fecha', 'fecha_alta_guf', 'guf_verified_at', 'miembro_fecha_nacimiento'];
    for (const field of dateFields) {
      if (record[field] && String(record[field]).trim()) {
        const dateStr = String(record[field]);
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          warnings.push(`Row ${rowIndex + 1}: Invalid date format for ${field} "${dateStr}"`);
        }
      }
    }

    recordCount++;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    recordCount,
    familyCount,
    memberCount,
  };
}

/**
 * Parse CSV string into family and member objects
 * Returns array of rows with both family and member data
 */
export function parseFamiliesWithMembersCSV(csv: string): ParsedRow[] {
  const rows = parseCSVRows(csv);

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0];
  const records: ParsedRow[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const record: ParsedRow = {};

    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
      const header = headers[colIndex];
      const value = row[colIndex] || '';

      // Convert string values to appropriate types
      if (value === '' || value === 'null' || value === 'undefined') {
        record[header] = null;
      } else if (value.toLowerCase() === 'true') {
        record[header] = true;
      } else if (value.toLowerCase() === 'false') {
        record[header] = false;
      } else if (!isNaN(Number(value)) && value !== '') {
        record[header] = Number(value);
      } else {
        record[header] = value;
      }
    }

    records.push(record);
  }

  return records;
}
