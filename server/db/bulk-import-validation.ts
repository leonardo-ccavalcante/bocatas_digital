import { z } from "zod";

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  data?: Record<string, any>;
}

// Define announcement schema
const AnnouncementSchema = z.object({
  titulo: z.string().min(1, "Título es requerido").max(255),
  contenido: z.string().min(1, "Contenido es requerido"),
  tipo: z.enum(["info", "warning", "alert", "success"]),
  es_urgente: z.boolean(),
  fecha_inicio: z.string().refine((date) => {
    const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoRegex.test(date)) return false;
    const d = new Date(date);
    return d instanceof Date && !isNaN(d.getTime());
  }, "Fecha de inicio debe ser formato YYYY-MM-DD"),
  fecha_fin: z.string().refine((date) => {
    const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoRegex.test(date)) return false;
    const d = new Date(date);
    return d instanceof Date && !isNaN(d.getTime());
  }, "Fecha de fin debe ser formato YYYY-MM-DD"),
  fijado: z.boolean(),
  audiencias: z.string().min(1, "Audiencias requeridas"),
});

/**
 * Validate a single announcement row from CSV
 */
export function validateAnnouncementRow(
  row: unknown
): ValidationResult {
  const errors: ValidationError[] = [];

  // Parse and validate with Zod
  const result = AnnouncementSchema.safeParse(row);

  if (!result.success) {
    // Convert Zod errors to our format
    for (const error of result.error.issues) {
      errors.push({
        field: String(error.path[0] || "unknown"),
        message: error.message,
        value: (row as Record<string, any>)?.[String(error.path[0])],
      });
    }
  }

  // Additional validation: fecha_fin must be after fecha_inicio
  if (result.success) {
    const data = result.data;
    const startDate = new Date(data.fecha_inicio);
    const endDate = new Date(data.fecha_fin);

    if (endDate < startDate) {
      errors.push({
        field: "fecha_fin",
        message: "Fecha de fin debe ser después de fecha de inicio",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: result.success ? result.data : undefined,
  };
}

/**
 * Validate multiple announcement rows
 */
export function validateAnnouncementRows(
  rows: unknown[]
): { valid: boolean; errors: Map<number, ValidationError[]> } {
  const errors = new Map<number, ValidationError[]>();

  for (let i = 0; i < rows.length; i++) {
    const result = validateAnnouncementRow(rows[i]);
    if (!result.valid) {
      errors.set(i, result.errors);
    }
  }

  return {
    valid: errors.size === 0,
    errors,
  };
}
