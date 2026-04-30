import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';
import {
  extractDeliveriesFromOCR,
  saveDeliveryBatch,
  ExtractedBatchHeader,
  ExtractedDeliveryRow,
} from '../ocrDeliveryExtraction';
import { generateEntregasCSVTemplate } from '../csvTemplateGenerator';
import { extractDeliveryDataFromImage } from '../_core/delivery-ocr';
import { createAdminClient } from '../../client/src/lib/supabase/server';
import { TRPCError } from '@trpc/server';

/**
 * Type definitions for entregas table (not in Supabase types)
 */
interface Entrega {
  id: string;
  entregas_batch_id: string;
  familia_id: string;
  fecha: string;
  persona_recibio: string;
  frutas_hortalizas_cantidad: number | null;
  frutas_hortalizas_unidad: string | null;
  carne_cantidad: number | null;
  carne_unidad: string | null;
  notas: string | null;
  ocr_row_confidence: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Entregas (delivery) router
 * Handles OCR document upload, extraction, validation, and saving
 * Uses .from() method to access entregas table (not in Supabase types)
 */
export const entregasRouter = router({
  /**
   * Extract delivery data from a photo of physical delivery document
   * Uses LLM-based table extraction to identify beneficiaries, dates, and quantities
   * Input: photo URL (S3), programa ID
   * Output: Extracted beneficiaries with deliveries and confidence scores
   */
  extractFromPhoto: protectedProcedure
    .input(
      z.object({
        photoUrl: z.string().url('URL de foto inválida').min(1),
        programaId: z.string().min(1, 'ID de programa requerido'),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const result = await extractDeliveryDataFromImage(input.photoUrl, input.programaId);

        return {
          success: result.success,
          extractionConfidence: result.extractionConfidence,
          documentDate: result.documentDate,
          beneficiaries: result.beneficiaries,
          warnings: result.warnings,
          errors: result.errors,
          message: result.success
            ? `Extracción completada: ${result.beneficiaries.length} beneficiarios detectados`
            : `Error en extracción: ${result.errors?.join(', ') || 'desconocido'}`,
        };
      } catch (error) {
        return {
          success: false,
          extractionConfidence: 0,
          beneficiaries: [],
          warnings: [],
          errors: [error instanceof Error ? error.message : 'Error desconocido'],
          message: `Error al procesar foto: ${error instanceof Error ? error.message : 'desconocido'}`,
        };
      }
    }),

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
   * Get deliveries for current user's programs
   * Uses .from() method to access entregas table
   * Respects RLS policies - only returns entregas for families in user's enrolled programs
   */
  getDeliveries: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().positive().default(50),
        offset: z.number().int().nonnegative().default(0),
        familiaId: z.string().uuid().optional(),
        fechaFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        fechaTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const db = createAdminClient();

        // Use .from() method with type casting for entregas table
        let query = (db as any).from('entregas').select('*');

        // Filter by familia if provided
        if (input.familiaId) {
          query = query.eq('familia_id', input.familiaId);
        }

        // Filter by date range if provided
        if (input.fechaFrom) {
          query = query.gte('fecha', input.fechaFrom);
        }
        if (input.fechaTo) {
          query = query.lte('fecha', input.fechaTo);
        }

        // Apply pagination
        query = query.range(input.offset, input.offset + input.limit - 1);
        query = query.order('createdAt', { ascending: false });

        const { data, error, count } = await query;

        if (error) {
          console.error('Error fetching deliveries:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Error al obtener entregas',
          });
        }

        return {
          success: true,
          data: (data as Entrega[]) || [],
          total: count || 0,
          message: `${(data as Entrega[])?.length || 0} entregas encontradas`,
        };
      } catch (error) {
        console.error('Error in getDeliveries:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }),

  /**
   * Get single delivery by ID
   */
  getDeliveryById: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      try {
        const db = createAdminClient();

        const { data, error } = await (db as any)
          .from('entregas')
          .select('*')
          .eq('id', input.id)
          .single();

        if (error || !data) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Entrega no encontrada',
          });
        }

        return {
          success: true,
          data: data as Entrega,
          message: 'Entrega obtenida exitosamente',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }),

  /**
   * Create a new delivery record
   */
  createDelivery: protectedProcedure
    .input(
      z.object({
        entregas_batch_id: z.string().uuid(),
        familia_id: z.string().uuid(),
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        persona_recibio: z.string().min(1),
        frutas_hortalizas_cantidad: z.number().nonnegative().optional(),
        frutas_hortalizas_unidad: z.string().optional(),
        carne_cantidad: z.number().nonnegative().optional(),
        carne_unidad: z.string().optional(),
        notas: z.string().optional(),
        ocr_row_confidence: z.number().min(0).max(100).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const db = createAdminClient();
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        const { data, error } = await (db as any)
          .from('entregas')
          .insert([
            {
              id,
              entregas_batch_id: input.entregas_batch_id,
              familia_id: input.familia_id,
              fecha: input.fecha,
              persona_recibio: input.persona_recibio,
              frutas_hortalizas_cantidad: input.frutas_hortalizas_cantidad || null,
              frutas_hortalizas_unidad: input.frutas_hortalizas_unidad || null,
              carne_cantidad: input.carne_cantidad || null,
              carne_unidad: input.carne_unidad || null,
              notas: input.notas || null,
              ocr_row_confidence: input.ocr_row_confidence || null,
              createdAt: now,
              updatedAt: now,
            },
          ])
          .select()
          .single();

        if (error) {
          console.error('Error creating delivery:', error);
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message || 'Error al crear entrega',
          });
        }

        return {
          success: true,
          data: data as Entrega,
          message: 'Entrega creada exitosamente',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }),

  /**
   * Update an existing delivery record
   */
  updateDelivery: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
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
        const db = createAdminClient();
        const now = new Date().toISOString();

        // Build update object
        const updateData: any = {
          updatedAt: now,
        };

        if (input.updates.persona_recibio !== undefined) {
          updateData.persona_recibio = input.updates.persona_recibio;
        }
        if (input.updates.frutas_hortalizas_cantidad !== undefined) {
          updateData.frutas_hortalizas_cantidad = input.updates.frutas_hortalizas_cantidad;
        }
        if (input.updates.frutas_hortalizas_unidad !== undefined) {
          updateData.frutas_hortalizas_unidad = input.updates.frutas_hortalizas_unidad;
        }
        if (input.updates.carne_cantidad !== undefined) {
          updateData.carne_cantidad = input.updates.carne_cantidad;
        }
        if (input.updates.carne_unidad !== undefined) {
          updateData.carne_unidad = input.updates.carne_unidad;
        }
        if (input.updates.notas !== undefined) {
          updateData.notas = input.updates.notas;
        }

        const { data, error } = await (db as any)
          .from('entregas')
          .update(updateData)
          .eq('id', input.id)
          .select()
          .single();

        if (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message || 'Error al actualizar entrega',
          });
        }

        return {
          success: true,
          data: data as Entrega,
          message: 'Entrega actualizada exitosamente',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }),

  /**
   * Delete a delivery record
   */
  deleteDelivery: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const db = createAdminClient();

        const { error } = await (db as any)
          .from('entregas')
          .delete()
          .eq('id', input.id);

        if (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message || 'Error al eliminar entrega',
          });
        }

        return {
          success: true,
          message: 'Entrega eliminada exitosamente',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Error desconocido',
        });
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
        const db = createAdminClient();

        const { data, error } = await (db as any)
          .from('entregas')
          .select('entregas_batch_id')
          .eq('familia_id', input.familiaId)
          .range(input.offset, input.offset + input.limit - 1)
          .order('createdAt', { ascending: false });

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Error al obtener lotes',
          });
        }

        // Group by batch_id
        const batches = new Map<string, number>();
        (data as any[])?.forEach((row) => {
          const batchId = row.entregas_batch_id;
          batches.set(batchId, (batches.get(batchId) || 0) + 1);
        });

        return {
          success: true,
          data: Array.from(batches.entries()).map(([batchId, count]) => ({
            entregas_batch_id: batchId,
            count,
          })),
          total: batches.size,
          message: 'Lotes obtenidos exitosamente',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Error desconocido',
        });
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
        const db = createAdminClient();

        const { data, error } = await (db as any)
          .from('entregas')
          .select('*')
          .eq('entregas_batch_id', input.batchId)
          .order('createdAt', { ascending: false });

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Error al obtener lote',
          });
        }

        return {
          success: true,
          data: (data as Entrega[]) || [],
          message: 'Lote obtenido exitosamente',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Error desconocido',
        });
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
