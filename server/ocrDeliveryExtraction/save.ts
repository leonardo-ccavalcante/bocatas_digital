import { createAdminClient } from '../../client/src/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { validateBatchHeaderWithDB, validateDeliveryRowWithDB } from "./validation";
import type { ExtractedBatchHeader, ExtractedDeliveryRow } from "./types";

/**
 * Save delivery batch and rows to database
 */
export async function saveDeliveryBatch(
  header: ExtractedBatchHeader,
  rows: ExtractedDeliveryRow[],
  documentImageUrl: string
): Promise<{ batchId: string; savedCount: number; errors: string[] }> {
  // Validate header with DB checks
  const headerValidation = await validateBatchHeaderWithDB(header);
  if (!headerValidation.isValid) {
    return {
      batchId: '',
      savedCount: 0,
      errors: headerValidation.errors,
    };
  }

  // Validate all rows with DB checks. Use allSettled so a single transient DB error
  // (e.g. network blip on validateDeliveryRowWithDB) doesn't reject the entire batch
  // and discard the partial results — surface every problem to the operator at once.
  const rowSettlements = await Promise.allSettled(
    rows.map(r => validateDeliveryRowWithDB(r))
  );

  const rowValidations = rowSettlements.map((s, idx) =>
    s.status === "fulfilled"
      ? s.value
      : {
          isValid: false,
          errors: [
            `Row ${idx + 1}: validation threw — ${
              s.reason instanceof Error ? s.reason.message : String(s.reason)
            }`,
          ],
        }
  );

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
