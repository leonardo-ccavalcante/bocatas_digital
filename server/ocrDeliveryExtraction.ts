import { createAdminClient } from '../client/src/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

/**
 * Extracted batch header metadata from physical document
 */
export interface ExtractedBatchHeader {
  numero_albaran: string;
  numero_reparto: string;
  numero_factura_carne: string | null;
  total_personas_asistidas: number;
  fecha_reparto: string; // YYYY-MM-DD
  confidence: number; // 0-100
  warnings: string[];
}

/**
 * Extracted individual delivery row
 */
export interface ExtractedDeliveryRow {
  familia_id: string; // UUID
  fecha: string; // YYYY-MM-DD
  persona_recibio: string;
  frutas_hortalizas_cantidad: number;
  frutas_hortalizas_unidad: string;
  carne_cantidad: number;
  carne_unidad: string;
  notas: string;
  confidence: number; // 0-100
  warnings: string[];
}

/**
 * Complete extracted document with header and rows
 */
export interface ExtractedDeliveryDocument {
  header: ExtractedBatchHeader;
  rows: ExtractedDeliveryRow[];
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Parsed quantity with unit
 */
export interface ParsedQuantity {
  amount: number;
  unit: string;
}

/**
 * Parse quantity string with unit (e.g., "3.5kg" -> {amount: 3.5, unit: "kg"})
 */
export function parseQuantityWithUnit(quantityStr: string): ParsedQuantity | null {
  if (!quantityStr || typeof quantityStr !== 'string') {
    return null;
  }

  // Remove spaces
  const normalized = quantityStr.trim();

  // Match number (integer or decimal) followed by optional unit
  const match = normalized.match(/^([\d.]+)\s*([a-zA-Z]*)$/);

  if (!match) {
    return null;
  }

  const amount = parseFloat(match[1]);
  const unit = match[2] || '';

  if (isNaN(amount)) {
    return null;
  }

  return { amount, unit };
}

/**
 * Validate UUID v4 format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Extract header metadata from OCR text
 */
function extractHeaderFromOCR(ocrText: string): ExtractedBatchHeader {
  const warnings: string[] = [];
  let numero_albaran = '';
  let numero_reparto = '';
  let numero_factura_carne: string | null = null;
  let total_personas_asistidas = 0;
  let fecha_reparto = '';
  let confidence = 100;

  // Extract Número de Albarán
  const albaranMatch = ocrText.match(/Número de Albarán[:\s]+([^\n]+)/i);
  if (albaranMatch) {
    numero_albaran = albaranMatch[1].trim();
  } else {
    warnings.push('Número de Albarán no encontrado');
    confidence -= 10;
  }

  // Extract Número de Reparto
  const repartoMatch = ocrText.match(/Número de Reparto[:\s]+([^\n]+)/i);
  if (repartoMatch) {
    numero_reparto = repartoMatch[1].trim();
  } else {
    warnings.push('Número de Reparto no encontrado');
    confidence -= 10;
  }

  // Extract Número de Factura de Carne
  const facturaCarneMatch = ocrText.match(/Número de Factura de Carne[:\s]+([^\n]+)/i);
  if (facturaCarneMatch) {
    numero_factura_carne = facturaCarneMatch[1].trim();
  } else {
    warnings.push('Número de Factura de Carne no encontrado');
  }

  // Extract Fecha
  const fechaMatch = ocrText.match(/Fecha[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (fechaMatch) {
    fecha_reparto = fechaMatch[1].trim();
  } else {
    warnings.push('Fecha no encontrada');
    confidence -= 10;
  }

  // Extract Total de Personas Asistidas
  const personasMatch = ocrText.match(/Total de Personas Asistidas[:\s]+(\d+)/i);
  if (personasMatch) {
    total_personas_asistidas = parseInt(personasMatch[1], 10);
  } else {
    warnings.push('Total de Personas Asistidas no encontrado');
    confidence -= 10;
  }

  return {
    numero_albaran,
    numero_reparto,
    numero_factura_carne,
    total_personas_asistidas,
    fecha_reparto,
    confidence: Math.max(0, confidence),
    warnings,
  };
}

/**
 * Extract delivery rows from OCR text
 */
function extractRowsFromOCR(ocrText: string): ExtractedDeliveryRow[] {
  const rows: ExtractedDeliveryRow[] = [];

  // Split by lines and find table rows
  const lines = ocrText.split('\n');
  let inTable = false;

  for (const line of lines) {
    // Skip header lines
    if (line.includes('familia_id') || line.includes('Número de Albarán')) {
      inTable = true;
      continue;
    }

    if (!inTable || !line.trim()) {
      continue;
    }

    // Parse table row (pipe-separated or tab-separated)
    const parts = line.split(/[|,\t]/).map(p => p.trim()).filter(p => p);

    if (parts.length < 7) {
      continue; // Skip invalid rows
    }

    const [
      familia_id,
      fecha,
      persona_recibio,
      fh_cantidad_str,
      fh_unidad,
      carne_cantidad_str,
      carne_unidad,
      ...notesParts
    ] = parts;

    // Parse quantities
    const fh_cantidad = parseFloat(fh_cantidad_str) || 0;
    const carne_cantidad = parseFloat(carne_cantidad_str) || 0;
    const notas = notesParts.join(' ');

    const warnings: string[] = [];
    let confidence = 90;

    // Validate familia_id format
    if (!isValidUUID(familia_id)) {
      warnings.push(`UUID inválido: ${familia_id}`);
      confidence -= 20;
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      warnings.push(`Fecha inválida: ${fecha}`);
      confidence -= 15;
    }

    rows.push({
      familia_id,
      fecha,
      persona_recibio,
      frutas_hortalizas_cantidad: fh_cantidad,
      frutas_hortalizas_unidad: fh_unidad,
      carne_cantidad,
      carne_unidad,
      notas,
      confidence: Math.max(0, confidence),
      warnings,
    });
  }

  return rows;
}

/**
 * Extract deliveries from OCR text
 */
export async function extractDeliveriesFromOCR(
  imageUrl: string,
  ocrText: string
): Promise<ExtractedDeliveryDocument> {
  const header = extractHeaderFromOCR(ocrText);
  const rows = extractRowsFromOCR(ocrText);

  return {
    header,
    rows,
  };
}

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
    const { data: existingBatch } = await (adminDb as any)
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
    const { data: familia, error: familiaError } = await (adminDb as any)
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

/**
 * Save delivery batch and rows to database
 */
export async function saveDeliveryBatch(
  header: ExtractedBatchHeader,
  rows: ExtractedDeliveryRow[],
  documentImageUrl: string
): Promise<{ batchId: string; savedCount: number; errors: string[] }> {
  const errors: string[] = [];

  // Validate header with DB checks
  const headerValidation = await validateBatchHeaderWithDB(header);
  if (!headerValidation.isValid) {
    return {
      batchId: '',
      savedCount: 0,
      errors: headerValidation.errors,
    };
  }

  // Validate all rows with DB checks
  const rowValidations = await Promise.all(rows.map(r => validateDeliveryRowWithDB(r)));
  const invalidRows = rowValidations.filter(v => !v.isValid);

  if (invalidRows.length > 0) {
    return {
      batchId: '',
      savedCount: 0,
      errors: invalidRows.flatMap(v => v.errors),
    };
  }

  // Insert delivery rows directly into the canonical `deliveries` table.
  // Batch metadata (albarán info) is stored in the JSONB `metadata` column.
  // session_id groups all rows from the same batch.
  const sessionId = uuidv4();
  const batchId = sessionId;
  const adminDb = createAdminClient();

  const deliveriesToInsert = rows.map(row => ({
    family_id: row.familia_id,
    fecha_entrega: row.fecha,
    recogido_por: row.persona_recibio || null,
    kg_frutas_hortalizas: row.frutas_hortalizas_cantidad || null,
    kg_carne: row.carne_cantidad || null,
    notas: row.notas || null,
    session_id: sessionId,
    metadata: {
      numero_albaran: header.numero_albaran,
      numero_reparto: header.numero_reparto,
      numero_factura_carne: header.numero_factura_carne,
      total_personas_asistidas: header.total_personas_asistidas,
      fecha_reparto: header.fecha_reparto,
      documento_imagen_url: documentImageUrl,
      ocr_confidence: header.confidence,
      ocr_row_confidence: row.confidence,
      frutas_hortalizas_unidad: row.frutas_hortalizas_unidad,
      carne_unidad: row.carne_unidad,
    },
  }));

  try {
    const { error } = await (adminDb as any).from('deliveries').insert(deliveriesToInsert);
    if (error) throw new Error(error.message);
  } catch (error) {
    return {
      batchId,
      savedCount: 0,
      errors: [`Error al guardar entregas: ${error instanceof Error ? error.message : 'desconocido'}`],
    };
  }

  return {
    batchId,
    savedCount: rows.length,
    errors: [],
  };
}
