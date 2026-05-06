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
