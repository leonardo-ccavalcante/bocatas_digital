import { z } from 'zod';
// Permissive UUID validator — matches the pattern used across all other routers.
const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID format');
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
import { storagePut } from '../storage';
import { TRPCError } from '@trpc/server';

/**
 * Type definitions for the canonical `deliveries` table.
 */
export interface Entrega {
  id: string;
  family_id: string;
  grant_id: string | null;
  session_id: string | null;
  fecha_entrega: string;
  kg_frutas_hortalizas: number | null;
  kg_carne: number | null;
  kg_infantil: number | null;
  kg_otros: number | null;
  kg_total: number | null;
  unidades_no_alimenticias: number | null;
  recogido_por: string | null;
  es_autorizado: boolean | null;
  firma_url: string | null;
  recogido_por_documento_url: string | null;
  registrado_por: string | null;
  notas: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Entregas (delivery) router
 * All CRUD operations use the canonical `deliveries` table.
 * OCR/batch operations also insert into `deliveries` (with metadata JSONB for batch info).
 */
export const entregasRouter = router({
  /**
   * Extract delivery data from a photo of physical delivery document.
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
   * Extract deliveries from OCR text.
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
   * Save extracted delivery batch to database.
   * Inserts into the canonical `deliveries` table (via saveDeliveryBatch).
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
          input.header as ExtractedBatchHeader,
          input.rows as ExtractedDeliveryRow[],
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
   * Get deliveries from the canonical `deliveries` table.
   */
  getDeliveries: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().positive().default(50),
        offset: z.number().int().nonnegative().default(0),
        familiaId: uuidLike.optional(),
        fechaFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        fechaTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const db = createAdminClient();
        let query = (db as any)
          .from('deliveries')
          .select('*', { count: 'exact' })
          .is('deleted_at', null);
        if (input.familiaId) {
          query = query.eq('family_id', input.familiaId);
        }
        if (input.fechaFrom) {
          query = query.gte('fecha_entrega', input.fechaFrom);
        }
        if (input.fechaTo) {
          query = query.lte('fecha_entrega', input.fechaTo);
        }
        query = query
          .order('fecha_entrega', { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);
        const { data, error, count } = await query;
        if (error) {
          console.error('Error fetching deliveries:', error);
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error al obtener entregas' });
        }
        return {
          success: true,
          data: (data as Entrega[]) || [],
          total: count || 0,
          message: `${(data as Entrega[])?.length || 0} entregas encontradas`,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error instanceof Error ? error.message : 'Error desconocido' });
      }
    }),

  /**
   * Get single delivery by ID from the canonical `deliveries` table.
   */
  getDeliveryById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      try {
        const db = createAdminClient();
        const { data, error } = await (db as any)
          .from('deliveries')
          .select('*')
          .eq('id', input.id)
          .is('deleted_at', null)
          .single();
        if (error) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Entrega no encontrada' });
        }
        return {
          success: true,
          data: data as Entrega,
          message: 'Entrega obtenida exitosamente',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error instanceof Error ? error.message : 'Error desconocido' });
      }
    }),

  /**
   * Create a delivery record in the canonical `deliveries` table.
   */
  createDelivery: protectedProcedure
    .input(
      z.object({
        family_id: uuidLike,
        fecha_entrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        recogido_por: z.string().optional(),
        es_autorizado: z.boolean().optional(),
        kg_frutas_hortalizas: z.number().nonnegative().optional(),
        kg_carne: z.number().nonnegative().optional(),
        kg_infantil: z.number().nonnegative().optional(),
        kg_otros: z.number().nonnegative().optional(),
        notas: z.string().optional(),
        session_id: uuidLike.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const db = createAdminClient();
        const { data, error } = await (db as any)
          .from('deliveries')
          .insert([{
            family_id: input.family_id,
            fecha_entrega: input.fecha_entrega,
            recogido_por: input.recogido_por ?? null,
            es_autorizado: input.es_autorizado ?? false,
            kg_frutas_hortalizas: input.kg_frutas_hortalizas ?? null,
            kg_carne: input.kg_carne ?? null,
            kg_infantil: input.kg_infantil ?? null,
            kg_otros: input.kg_otros ?? null,
            notas: input.notas ?? null,
            session_id: input.session_id ?? null,
            registrado_por: ctx.user?.name ?? null,
          }])
          .select()
          .single();
        if (error) {
          console.error('Error creating delivery:', error);
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message || 'Error al crear entrega' });
        }
        return {
          success: true,
          data: data as Entrega,
          message: 'Entrega creada exitosamente',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error instanceof Error ? error.message : 'Error desconocido' });
      }
    }),

  /**
   * Update a delivery record in the canonical `deliveries` table.
   */
  updateDelivery: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        updates: z.object({
          recogido_por: z.string().optional(),
          es_autorizado: z.boolean().optional(),
          kg_frutas_hortalizas: z.number().nonnegative().optional(),
          kg_carne: z.number().nonnegative().optional(),
          kg_infantil: z.number().nonnegative().optional(),
          kg_otros: z.number().nonnegative().optional(),
          notas: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const db = createAdminClient();
        const { data, error } = await (db as any)
          .from('deliveries')
          .update({ ...input.updates, updated_at: new Date().toISOString() })
          .eq('id', input.id)
          .is('deleted_at', null)
          .select()
          .single();
        if (error) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message || 'Error al actualizar entrega' });
        }
        return { success: true, data: data as Entrega, message: 'Entrega actualizada exitosamente' };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error instanceof Error ? error.message : 'Error desconocido' });
      }
    }),

  /**
   * Soft-delete a delivery record in the canonical `deliveries` table.
   */
  deleteDelivery: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      try {
        const db = createAdminClient();
        const { error } = await (db as any)
          .from('deliveries')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', input.id);
        if (error) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message || 'Error al eliminar entrega' });
        }
        return { success: true, message: 'Entrega eliminada exitosamente' };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error instanceof Error ? error.message : 'Error desconocido' });
      }
    }),

  /**
   * Get delivery sessions (batches) for a family from `deliveries`.
   * Groups by session_id (replaces old entregas_batch_id grouping).
   */
  getBatchesByFamilia: protectedProcedure
    .input(
      z.object({
        familia_id: uuidLike,
        limit: z.number().int().positive().default(10),
        offset: z.number().int().nonnegative().default(0),
      })
    )
    .query(async ({ input }) => {
      try {
        const db = createAdminClient();
        const { data, error } = await (db as any)
          .from('deliveries')
          .select('session_id, fecha_entrega')
          .eq('family_id', input.familia_id)
          .is('deleted_at', null)
          .order('fecha_entrega', { ascending: false })
          .range(input.offset, input.offset + input.limit - 1);
        if (error) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error al obtener sesiones' });
        }
        // Group by session_id (null session_id = individual delivery)
        const sessions = new Map<string, number>();
        (data as any[])?.forEach((row) => {
          const key = row.session_id ?? `individual-${row.fecha_entrega}`;
          sessions.set(key, (sessions.get(key) || 0) + 1);
        });
        return {
          success: true,
          data: Array.from(sessions.entries()).map(([sessionId, count]) => ({
            session_id: sessionId,
            count,
          })),
          total: sessions.size,
          message: 'Sesiones obtenidas exitosamente',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error instanceof Error ? error.message : 'Error desconocido' });
      }
    }),

  /**
   * Get delivery details for a session from `deliveries`.
   */
  getBatchDetails: protectedProcedure
    .input(z.object({ batchId: z.string() }))
    .query(async ({ input }) => {
      try {
        const db = createAdminClient();
        const { data, error } = await (db as any)
          .from('deliveries')
          .select('*')
          .eq('session_id', input.batchId)
          .is('deleted_at', null)
          .order('fecha_entrega', { ascending: false });
        if (error) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error al obtener sesión' });
        }
        return {
          success: true,
          data: (data as Entrega[]) || [],
          message: 'Sesión obtenida exitosamente',
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error instanceof Error ? error.message : 'Error desconocido' });
      }
    }),

  /**
   * Download CSV template with sample data and guide.
   */
  downloadTemplate: publicProcedure.query(async () => {
    const { csvContent, guideContent, fileName } = generateEntregasCSVTemplate();
    return { csvContent, guideContent, fileName };
  }),

  /**
   * Upload photo to S3 storage and return URL.
   */
  uploadPhotoToStorage: protectedProcedure
    .input(
      z.object({
        photoData: z.string().min(1, 'Datos de foto requeridos'),
        rotation: z.number().int().min(0).max(359).default(0),
        fileName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const fileName = input.fileName || `photo-${timestamp}-${randomSuffix}.jpg`;
        const fileKey = `deliveries/photos/${ctx.user?.id || 'unknown'}/${fileName}`;
        const buffer = Buffer.from(input.photoData, 'base64');
        const { url, key } = await storagePut(fileKey, buffer, 'image/jpeg');
        return {
          success: true,
          photoUrl: url,
          photoKey: key,
          rotation: input.rotation,
          message: 'Foto subida exitosamente',
        };
      } catch (error) {
        console.error('Error uploading photo:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Error al subir foto',
        });
      }
    }),
});
