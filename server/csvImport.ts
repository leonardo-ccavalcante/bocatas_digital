export interface ImportValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recordCount: number;
}

interface ParsedFamily {
  [key: string]: unknown;
}

// Required fields for CSV import
const REQUIRED_FIELDS = ['familia_numero', 'nombre_familia', 'contacto_principal'];

// Valid enum values
const VALID_ESTADOS = ['activo', 'inactivo', 'suspendido'];

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
        // Escaped quote
        currentField += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // End of field
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      // End of row
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      }
      // Skip \r\n
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      currentField += char;
    }
  }

  // Add last field and row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Validate CSV structure and data
 */
export function validateFamiliesCSV(csv: string): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if CSV is empty
  if (!csv || !csv.trim()) {
    return {
      isValid: false,
      errors: ['CSV file is empty'],
      warnings: [],
      recordCount: 0,
    };
  }

  const rows = parseCSVRows(csv);

  if (rows.length === 0) {
    return {
      isValid: false,
      errors: ['No data found in CSV'],
      warnings: [],
      recordCount: 0,
    };
  }

  // Parse header
  const headers = rows[0];
  const headerMap = new Map(headers.map((h, i) => [h.toLowerCase(), i]));

  // Validate required headers
  for (const required of REQUIRED_FIELDS) {
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
    };
  }

  // Validate data rows
  const seenFamiliaIds = new Set<string>();
  let recordCount = 0;

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const familia: ParsedFamily = {};

    // Map row values to headers
    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
      const header = headers[colIndex];
      const value = row[colIndex] || '';
      familia[header] = value;
    }

    // Check required fields
    for (const required of REQUIRED_FIELDS) {
      const value = familia[required];
      if (!value || String(value).trim() === '') {
        errors.push(`Row ${rowIndex + 1}: Missing required field "${required}"`);
      }
    }

    // Check for duplicates
    const familiaNumero = String(familia.familia_numero || '').trim();
    if (familiaNumero) {
      if (seenFamiliaIds.has(familiaNumero)) {
        errors.push(`Row ${rowIndex + 1}: Duplicate familia_numero "${familiaNumero}"`);
      } else {
        seenFamiliaIds.add(familiaNumero);
      }
    }

    // Validate data types and values
    if (familia.miembros_count) {
      const count = Number(familia.miembros_count);
      if (isNaN(count) || count < 0) {
        warnings.push(`Row ${rowIndex + 1}: Invalid miembros_count "${familia.miembros_count}" (should be a positive number)`);
      }
    }

    if (familia.estado) {
      const estado = String(familia.estado).toLowerCase();
      if (!VALID_ESTADOS.includes(estado)) {
        warnings.push(`Row ${rowIndex + 1}: Invalid estado "${familia.estado}" (should be one of: ${VALID_ESTADOS.join(', ')})`);
      }
    }

    // Validate boolean fields
    const booleanFields = ['docs_identidad', 'padron_recibido', 'justificante_recibido', 'consent_bocatas', 'consent_banco_alimentos', 'informe_social', 'alta_en_guf'];
    for (const field of booleanFields) {
      if (familia[field]) {
        const value = String(familia[field]).toLowerCase();
        if (!['true', 'false', '1', '0', 'yes', 'no'].includes(value)) {
          warnings.push(`Row ${rowIndex + 1}: Invalid ${field} "${familia[field]}" (should be true/false)`);
        }
      }
    }

    // Validate date fields
    const dateFields = ['fecha_creacion', 'informe_social_fecha', 'fecha_alta_guf', 'guf_verified_at'];
    for (const field of dateFields) {
      if (familia[field] && String(familia[field]).trim()) {
        const dateStr = String(familia[field]);
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
  };
}

/**
 * Parse CSV string into family objects
 */
export function parseFamiliesCSV(csv: string): ParsedFamily[] {
  const rows = parseCSVRows(csv);

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0];
  const families: ParsedFamily[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const familia: ParsedFamily = {};

    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
      const header = headers[colIndex];
      const value = row[colIndex] || '';

      // Convert string values to appropriate types
      if (value === '' || value === 'null' || value === 'undefined') {
        familia[header] = null;
      } else if (value.toLowerCase() === 'true') {
        familia[header] = true;
      } else if (value.toLowerCase() === 'false') {
        familia[header] = false;
      } else if (!isNaN(Number(value)) && value !== '') {
        familia[header] = Number(value);
      } else {
        familia[header] = value;
      }
    }

    families.push(familia);
  }

  return families;
}
