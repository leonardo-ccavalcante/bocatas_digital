import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { voluntarioProcedure, router } from "../../_core/trpc";
import { logCorrelatedErrorToStderr } from "../../_core/logging-middleware";
import {
  extractDeliveriesFromOCR,
  saveDeliveryBatch,
  ExtractedBatchHeader,
  ExtractedDeliveryRow,
} from "../../ocrDeliveryExtraction";
import { extractDeliveryDataFromImage } from "../../_core/delivery-ocr";
import { storageSignedUrl } from "../../storage";

/** Same private bucket entregas/photo.ts writes to. */
const DELIVERY_DOCS_BUCKET = "documentos-fisicos-entregas";

export const ocrRouter = router({
  /**
   * Extract delivery data from a photo of physical delivery document.
   */
  extractFromPhoto: voluntarioProcedure
    .input(
      z.object({
        // A storage PATH, not a URL. Taking a client-supplied absolute URL and
        // handing it to the vision model let the caller choose what the model
        // fetches; the server now signs its own stored object instead.
        photoPath: z
          .string()
          .min(1, "Ruta de foto requerida")
          .refine(p => !/^[a-z][a-z0-9+.-]*:/i.test(p), "Ruta de foto inválida")
          .refine(p => !p.includes(".."), "Ruta de foto inválida"),
        programaId: z.string().min(1, "ID de programa requerido"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const signedUrl = await storageSignedUrl(DELIVERY_DOCS_BUCKET, input.photoPath);
        if (!signedUrl) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No se pudo abrir la foto del documento",
          });
        }
        const result = await extractDeliveryDataFromImage(signedUrl, input.programaId);
        return {
          success: result.success,
          extractionConfidence: result.extractionConfidence,
          documentDate: result.documentDate,
          beneficiaries: result.beneficiaries,
          warnings: result.warnings,
          errors: result.errors,
          message: result.success
            ? `Extracción completada: ${result.beneficiaries.length} beneficiarios detectados`
            : `Error en extracción: ${result.errors?.join(", ") || "desconocido"}`,
        };
      } catch (error) {
        // Returned (200) payload — bypasses the errorFormatter. The raw error
        // can carry storage keys / URLs / DB text; never surface it. Return a
        // generic Spanish string and log the raw error PII-safely to stderr.
        logCorrelatedErrorToStderr({ correlationId: ctx.correlationId, path: "entregas.extractFromPhoto", type: "mutation", error });
        return {
          success: false,
          extractionConfidence: 0,
          beneficiaries: [],
          warnings: [],
          errors: ["No se pudo procesar la foto."],
          message: "No se pudo procesar la foto.",
        };
      }
    }),

  /**
   * Extract deliveries from OCR text.
   */
  extractFromOCR: voluntarioProcedure
    .input(
      z.object({
        imageUrl: z.string().url("URL de imagen inválida"),
        ocrText: z.string().min(10, "Texto OCR muy corto"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await extractDeliveriesFromOCR(input.imageUrl, input.ocrText);
        return {
          success: true,
          data: result,
          message: `Extracción completada: ${result.rows.length} entregas detectadas`,
        };
      } catch (error) {
        // Returned (200) payload — bypasses the errorFormatter. Never surface
        // the raw error; log it PII-safely to stderr.
        logCorrelatedErrorToStderr({ correlationId: ctx.correlationId, path: "entregas.extractFromOCR", type: "mutation", error });
        return {
          success: false,
          data: null,
          message: "No se pudo completar la extracción.",
        };
      }
    }),

  /**
   * Save extracted delivery batch to database.
   * Inserts into the canonical `deliveries` table (via saveDeliveryBatch).
   */
  saveBatch: voluntarioProcedure
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
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await saveDeliveryBatch(
          input.header as ExtractedBatchHeader,
          input.rows as ExtractedDeliveryRow[],
          input.documentImageUrl
        );
        if (result.errors.length > 0) {
          return {
            success: false,
            batchId: "",
            savedCount: 0,
            message: `Errores de validación: ${result.errors.join(", ")}`,
          };
        }
        return {
          success: true,
          batchId: result.batchId,
          savedCount: result.savedCount,
          message: `Lote guardado exitosamente: ${result.savedCount} entregas registradas`,
        };
      } catch (error) {
        // Returned (200) payload — bypasses the errorFormatter. The raw error
        // can carry DB text; never surface it. Log it PII-safely to stderr.
        logCorrelatedErrorToStderr({ correlationId: ctx.correlationId, path: "entregas.saveBatch", type: "mutation", error });
        return {
          success: false,
          batchId: "",
          savedCount: 0,
          message: "No se pudo guardar el lote.",
        };
      }
    }),
});
