import type {
  ExtractedBatchHeader,
  ExtractedDeliveryDocument,
  ExtractedDeliveryRow,
  ParsedQuantity,
} from "./types";

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
