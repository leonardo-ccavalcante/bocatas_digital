import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';
import {
  extractDeliveriesFromOCR,
  saveDeliveryBatch,
  ExtractedBatchHeader,
  ExtractedDeliveryRow,
} from '../ocrDeliveryExtraction';
import { generateEntregasCSVTemplate } from '../csvTemplateGenerator';

/**
 * Entregas (delivery) router
 * Handles OCR document upload, extraction, validation, and saving
 */
export const entregasRouter = router({
  /**
   * Extract deliveries from OCR text
   * Input: image URL and OCR text
   * Output: Extracted header and rows with confidence scores
   */
  extractFromOCR: protectedProcedure
    .input(
      z.object({
        imageUrl: z.string().url('URL de imagen inválida'),
        ocrText: z.string().min(10, 'Texto OCR muy corto'),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await extractDeliveriesFromOCR(input.imageUrl, input.ocrText);

        return {
          success: true,
          data: result,
          message: `Extracción completada: ${result.rows.length} entregas detectadas`,
        };
      } catch (error) {
        return {
          success: false,
          data: null,
          message: `Error en extracción: ${error instanceof Error ? error.message : 'desconocido'}`,
        };
      }
    }),

  /**
   * Save extracted delivery batch to database
   * Input: Extracted header, rows, and document image URL
   * Output: Batch ID and saved count
   */
  saveBatch: protectedProcedure
    .input(
      z.object({
        header: z.object({
          numero_albaran: z.string().min(1),
          numero_reparto: z.string().min(1),
          numero_factura_carne: z.string().nullable(),
          total_personas_asistidas: z.number().int().positive(),
          fecha_reparto: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          confidence: z.number().min(0).max(100),
          warnings: z.array(z.string()),
        }),
        rows: z.array(
          z.object({
            familia_id: z.string().uuid(),
            fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            persona_recibio: z.string(),
            frutas_hortalizas_cantidad: z.number().nonnegative(),
            frutas_hortalizas_unidad: z.string(),
            carne_cantidad: z.number().nonnegative(),
            carne_unidad: z.string(),
            notas: z.string(),
            confidence: z.number().min(0).max(100),
            warnings: z.array(z.string()),
          })
        ),
        documentImageUrl: z.string().url(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await saveDeliveryBatch(
          input.header,
          input.rows,
          input.documentImageUrl
        );

        if (result.errors.length > 0) {
          return {
            success: false,
            batchId: '',
            savedCount: 0,
            message: `Errores de validación: ${result.errors.join(', ')}`,
          };
        }

        return {
          success: true,
          batchId: result.batchId,
          savedCount: result.savedCount,
          message: `Lote guardado exitosamente: ${result.savedCount} entregas registradas`,
        };
      } catch (error) {
        return {
          success: false,
          batchId: '',
          savedCount: 0,
          message: `Error al guardar: ${error instanceof Error ? error.message : 'desconocido'}`,
        };
      }
    }),

  /**
   * Get delivery batches for a family
   * Input: familia_id
   * Output: List of batches with row counts
   */
  getBatchesByFamilia: protectedProcedure
    .input(
      z.object({
        familiaId: z.string().uuid(),
        limit: z.number().int().positive().default(10),
        offset: z.number().int().nonnegative().default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        // TODO: Implement database query
        // For now, return empty list
        return {
          success: true,
          data: [],
          total: 0,
          message: 'No hay entregas registradas',
        };
      } catch (error) {
        return {
          success: false,
          data: [],
          total: 0,
          message: `Error al obtener entregas: ${error instanceof Error ? error.message : 'desconocido'}`,
        };
      }
    }),

  /**
   * Get delivery batch details
   * Input: batch_id
   * Output: Batch header and all associated rows
   */
  getBatchDetails: protectedProcedure
    .input(
      z.object({
        batchId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      try {
        // TODO: Implement database query
        // For now, return null
        return {
          success: false,
          data: null,
          message: 'Lote no encontrado',
        };
      } catch (error) {
        return {
          success: false,
          data: null,
          message: `Error al obtener lote: ${error instanceof Error ? error.message : 'desconocido'}`,
        };
      }
    }),

  /**
   * Update delivery row (edit after extraction)
   * Input: row_id and updated fields
   * Output: Updated row
   */
  updateRow: protectedProcedure
    .input(
      z.object({
        rowId: z.string().uuid(),
        updates: z.object({
          persona_recibio: z.string().optional(),
          frutas_hortalizas_cantidad: z.number().nonnegative().optional(),
          frutas_hortalizas_unidad: z.string().optional(),
          carne_cantidad: z.number().nonnegative().optional(),
          carne_unidad: z.string().optional(),
          notas: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // TODO: Implement database update
        // For now, return error
        return {
          success: false,
          data: null,
          message: 'Actualización no implementada',
        };
      } catch (error) {
        return {
          success: false,
          data: null,
          message: `Error al actualizar: ${error instanceof Error ? error.message : 'desconocido'}`,
        };
      }
    }),

  /**
   * Download CSV template with sample data and guide
   * Output: CSV content, guide content, and filename
   */
  downloadTemplate: publicProcedure.query(async () => {
    const { csvContent, guideContent, fileName } = generateEntregasCSVTemplate();
    return {
      csvContent,
      guideContent,
      fileName,
    };
  }),
});
