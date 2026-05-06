import { createAdminClient } from '../../client/src/lib/supabase/server';
import { isValidUUID } from "./parsers";
import type {
  ExtractedBatchHeader,
  ExtractedDeliveryRow,
  ValidationResult,
} from "./types";

/**
 * Validate batch header (without database checks for testability)
 */
export async function validateBatchHeader(header: ExtractedBatchHeader): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!header.numero_albaran) {
    errors.push('Número de Albarán es requerido');
  }

  if (!header.numero_reparto) {
    errors.push('Número de Reparto es requerido');
  }

  if (header.total_personas_asistidas <= 0) {
    errors.push('Total de Personas Asistidas debe ser mayor a 0');
  }

  if (!header.fecha_reparto) {
    errors.push('Fecha es requerida');
  }

  // Check date is not in future
  if (header.fecha_reparto) {
    const date = new Date(header.fecha_reparto);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (date > today) {
      errors.push('No se puede registrar entrega en fecha futura');
    }
  }

  // Warn if meat invoice missing
  if (!header.numero_factura_carne) {
    warnings.push('Número de Factura de Carne no proporcionado');
  }

  // Warn if confidence is low
  if (header.confidence < 70) {
    warnings.push(`Confianza baja en extracción de encabezado: ${header.confidence}%`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: [...header.warnings, ...warnings],
  };
}

/**
 * Validate batch header with database checks (for use in tRPC procedures)
 */
export async function validateBatchHeaderWithDB(
  header: ExtractedBatchHeader
): Promise<ValidationResult> {
  const baseValidation = await validateBatchHeader(header);

  if (!baseValidation.isValid) {
    return baseValidation;
  }

  // Check for duplicate albarán via deliveries metadata (JSONB filter)
  if (header.numero_albaran) {
    const adminDb = createAdminClient();
    const { data: existingBatch } = await adminDb
      .from('deliveries')
      .select('id')
      .filter('metadata->>numero_albaran', 'eq', header.numero_albaran)
      .limit(1);

    if (existingBatch && existingBatch.length > 0) {
      return {
        isValid: false,
        errors: [`Número de Albarán duplicado: ${header.numero_albaran}`],
        warnings: baseValidation.warnings,
      };
    }
  }

  return baseValidation;
}

/**
 * Validate delivery row (without database checks for testability)
 */
export async function validateDeliveryRow(row: ExtractedDeliveryRow): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate familia_id format
  if (!isValidUUID(row.familia_id)) {
    errors.push(`Formato UUID inválido: ${row.familia_id}`);
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.fecha)) {
    errors.push(`Formato de fecha inválido: ${row.fecha}`);
  } else {
    // Check date is not in future
    const date = new Date(row.fecha);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (date > today) {
      errors.push('No se puede registrar entrega en fecha futura');
    }
  }

  // Validate quantities
  if (row.frutas_hortalizas_cantidad < 0) {
    errors.push('Cantidad de frutas/hortalizas no puede ser negativa');
  }

  if (row.carne_cantidad < 0) {
    errors.push('Cantidad de carne no puede ser negativa');
  }

  // Warn if confidence is low
  if (row.confidence < 70) {
    warnings.push(`Confianza baja en extracción de fila: ${row.confidence}%`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: [...row.warnings, ...warnings],
  };
}

/**
 * Validate delivery row with database checks
 */
export async function validateDeliveryRowWithDB(
  row: ExtractedDeliveryRow
): Promise<ValidationResult> {
  const baseValidation = await validateDeliveryRow(row);

  if (!baseValidation.isValid) {
    return baseValidation;
  }

  // Check if familia exists via Supabase
  if (isValidUUID(row.familia_id)) {
    const adminDb = createAdminClient();
    const { data: familia, error: familiaError } = await adminDb
      .from('families')
      .select('id')
      .eq('id', row.familia_id)
      .is('deleted_at', null)
      .limit(1);

    if (familiaError || !familia || familia.length === 0) {
      return {
        isValid: false,
        errors: [`Familia no encontrada: ${row.familia_id}`],
        warnings: baseValidation.warnings,
      };
    }
  }

  return baseValidation;
}
