/**
 * CSV Export/Import for Families with Members
 * 
 * Format: Each row represents a family member, grouped by familia_numero
 * familia_numero,estado,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento
 */

export type MergeStrategy = 'overwrite' | 'merge' | 'skip';

export interface FamilyWithMembersRow {
  familia_id: string;
  familia_numero: number;
  estado: string;
  miembro_nombre: string;
  miembro_rol: string;
  miembro_relacion: string | null;
  miembro_fecha_nacimiento: string;
}

export interface FamilyWithMembers {
  familia_numero: number;
  estado?: string;
  miembros: Array<{
    nombre: string;
    rol: string;
    relacion?: string | null;
    fecha_nacimiento: string;
  }>;
  mergeStrategy?: MergeStrategy;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  recordCount: number;
}

/**
 * Escape CSV field value according to RFC 4180
 */
function escapeCSVField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  const needsQuotes = str.includes(',') || str.includes('"') || str.includes('\n');

  if (needsQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generate CSV from families with members data
 */
export function generateFamiliesWithMembersCSV(data: FamilyWithMembersRow[]): string {
  const header = 'familia_numero,estado,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento\n';

  const rows = data.map(row => {
    return [
      escapeCSVField(row.familia_numero),
      escapeCSVField(row.estado),
      escapeCSVField(row.miembro_nombre),
      escapeCSVField(row.miembro_rol),
      escapeCSVField(row.miembro_relacion),
      escapeCSVField(row.miembro_fecha_nacimiento),
    ].join(',');
  });

  return header + rows.join('\n') + '\n';
}

/**
 * Parse CSV line (handle quoted fields)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Validate CSV format and data
 */
export function validateFamiliesWithMembersCSV(csv: string): ValidationResult {
  const errors: string[] = [];
  const lines = csv.trim().split('\n');

  if (lines.length < 2) {
    return {
      isValid: false,
      errors: ['CSV must have header and at least one data row'],
      recordCount: 0,
    };
  }

  const header = parseCSVLine(lines[0]);
  const expectedHeaders = ['familia_numero', 'estado', 'miembro_nombre', 'miembro_rol', 'miembro_relacion', 'miembro_fecha_nacimiento'];

  // Validate header
  if (header.length !== expectedHeaders.length || !header.every((h, i) => h === expectedHeaders[i])) {
    return {
      isValid: false,
      errors: [`Invalid header. Expected: ${expectedHeaders.join(',')}`],
      recordCount: 0,
    };
  }

  const seenMembers = new Set<string>();

  // Validate data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const fields = parseCSVLine(line);

    if (fields.length !== expectedHeaders.length) {
      errors.push(`Line ${i + 1}: Expected ${expectedHeaders.length} fields, got ${fields.length}`);
      continue;
    }

    const [familiaNumeroStr, estado, miembroNombre, miembroRol, miembroRelacion, miembroFechaNacimiento] = fields;

    // Validate familia_numero is a number
    const familiaNumero = Number(familiaNumeroStr);
    if (isNaN(familiaNumero) || !Number.isInteger(familiaNumero)) {
      errors.push(`Line ${i + 1}: familia_numero must be a number, got "${familiaNumeroStr}"`);
    }

    // Validate required fields
    if (!miembroNombre?.trim()) {
      errors.push(`Line ${i + 1}: miembro_nombre is required`);
    }

    if (!miembroRol?.trim()) {
      errors.push(`Line ${i + 1}: miembro_rol is required`);
    }

    // Validate fecha_nacimiento format (ISO 8601: YYYY-MM-DD)
    if (miembroFechaNacimiento?.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(miembroFechaNacimiento)) {
        errors.push(`Line ${i + 1}: miembro_fecha_nacimiento must be in ISO 8601 format (YYYY-MM-DD), got "${miembroFechaNacimiento}"`);
      } else {
        // Validate it's a valid date
        const date = new Date(miembroFechaNacimiento);
        if (isNaN(date.getTime())) {
          errors.push(`Line ${i + 1}: miembro_fecha_nacimiento is not a valid date: "${miembroFechaNacimiento}"`);
        }
      }
    }

    // Detect duplicates (same familia + nombre + rol)
    const memberKey = `${familiaNumero}|${miembroNombre?.trim()}|${miembroRol?.trim()}`;
    if (seenMembers.has(memberKey)) {
      errors.push(`Line ${i + 1}: Duplicate member in family ${familiaNumero}: ${miembroNombre} (${miembroRol})`);
    }
    seenMembers.add(memberKey);
  }

  return {
    isValid: errors.length === 0,
    errors,
    recordCount: lines.length - 1, // Exclude header
  };
}

/**
 * Parse CSV and group members by family
 */
export function parseFamiliesWithMembersCSV(csv: string, mergeStrategy: MergeStrategy = 'merge'): FamilyWithMembers[] {
  const lines = csv.trim().split('\n');
  const familiesMap = new Map<number, FamilyWithMembers>();

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    const [familiaNumeroStr, estado, miembroNombre, miembroRol, miembroRelacion, miembroFechaNacimiento] = fields;

    const familiaNumero = Number(familiaNumeroStr);

    if (!familiesMap.has(familiaNumero)) {
      familiesMap.set(familiaNumero, {
        familia_numero: familiaNumero,
        estado: estado?.trim() || undefined,
        miembros: [],
        mergeStrategy,
      });
    }

    const family = familiesMap.get(familiaNumero)!;

    family.miembros.push({
      nombre: miembroNombre,
      rol: miembroRol,
      relacion: miembroRelacion?.trim() || null,
      fecha_nacimiento: miembroFechaNacimiento,
    });
  }

  return Array.from(familiesMap.values());
}
