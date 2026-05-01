/**
 * CSV Validation Helper for Announcements
 * Validates CSV rows before bulk import
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: Record<string, any>;
}

const VALID_ANNOUNCEMENT_TYPES = ["informativo", "urgente", "evento"];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a single announcement row from CSV
 */
export function validateAnnouncementRow(
  row: Record<string, any>
): ValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!row.titulo || String(row.titulo).trim() === "") {
    errors.push("titulo is required");
  }

  if (!row.contenido || String(row.contenido).trim() === "") {
    errors.push("contenido is required");
  }

  // Validate tipo (enum)
  if (row.tipo && !VALID_ANNOUNCEMENT_TYPES.includes(String(row.tipo).toLowerCase())) {
    errors.push(`tipo must be one of: ${VALID_ANNOUNCEMENT_TYPES.join(", ")}`);
  }

  // Validate boolean fields
  if (row.es_urgente !== undefined && row.es_urgente !== "") {
    const value = String(row.es_urgente).toLowerCase();
    if (!["true", "false", "1", "0", "yes", "no"].includes(value)) {
      errors.push("es_urgente must be a boolean value (true/false)");
    }
  }

  if (row.fijado !== undefined && row.fijado !== "") {
    const value = String(row.fijado).toLowerCase();
    if (!["true", "false", "1", "0", "yes", "no"].includes(value)) {
      errors.push("fijado must be a boolean value (true/false)");
    }
  }

  // Validate dates
  if (row.fecha_inicio && !DATE_REGEX.test(String(row.fecha_inicio))) {
    errors.push("fecha_inicio must be in YYYY-MM-DD format");
  }

  if (row.fecha_fin && !DATE_REGEX.test(String(row.fecha_fin))) {
    errors.push("fecha_fin must be in YYYY-MM-DD format");
  }

  // Validate date range
  if (row.fecha_inicio && row.fecha_fin) {
    const startDate = new Date(String(row.fecha_inicio));
    const endDate = new Date(String(row.fecha_fin));
    if (startDate > endDate) {
      errors.push("fecha_fin must be after or equal to fecha_inicio");
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Parse and normalize data
  const data = {
    titulo: String(row.titulo).trim(),
    contenido: String(row.contenido).trim(),
    tipo: String(row.tipo || "informativo").toLowerCase(),
    es_urgente: parseBoolean(row.es_urgente),
    fecha_inicio: row.fecha_inicio ? new Date(String(row.fecha_inicio)) : null,
    fecha_fin: row.fecha_fin ? new Date(String(row.fecha_fin)) : null,
    fijado: parseBoolean(row.fijado),
    audiencias: row.audiencias ? String(row.audiencias).trim() : "all",
  };

  return { valid: true, errors: [], data };
}

/**
 * Parse boolean value from CSV string
 */
function parseBoolean(value: any): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const str = String(value).toLowerCase().trim();
  return ["true", "1", "yes", "on"].includes(str);
}

/**
 * Validate multiple rows and return summary
 */
export function validateAnnouncementRows(
  rows: Record<string, any>[]
): {
  valid: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: Array<{ rowIndex: number; errors: string[] }>;
  data?: Record<string, any>[];
} {
  const results = rows.map((row, index) => ({
    index,
    result: validateAnnouncementRow(row),
  }));

  const validResults = results.filter((r) => r.result.valid);
  const invalidResults = results.filter((r) => !r.result.valid);

  return {
    valid: invalidResults.length === 0,
    totalRows: rows.length,
    validRows: validResults.length,
    invalidRows: invalidResults.length,
    errors: invalidResults.map((r) => ({
      rowIndex: r.index + 1, // 1-indexed for user display
      errors: r.result.errors,
    })),
    data: validResults.map((r) => r.result.data).filter((d) => d !== undefined) as Record<string, any>[],
  };
}
