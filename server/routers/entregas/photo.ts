import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { voluntarioProcedure, router } from "../../_core/trpc";
import { storagePut } from "../../storage";

/**
 * Private bucket for photographed physical delivery sheets. Created by
 * supabase/migrations/20260413121828_20260501101100_create_storage_buckets.sql
 * and documented in docs/dev-setup.md as "Delivery signatures / physical docs".
 *
 * The photo is retained deliberately: server/ocrDeliveryExtraction/save.ts
 * persists it as `metadata.documento_imagen_url`, the evidence pointer behind
 * the Banco de Alimentos subsidy (CONTEXT.md "Delivery / entrega"). Do not
 * replace this upload with a transient base64 hand-off to the model.
 */
const DELIVERY_DOCS_BUCKET = "documentos-fisicos-entregas";

/** Bucket cap is 5 MiB; reject oversize before the storage layer does. */
const MAX_BYTES = 5 * 1024 * 1024;

export const photoRouter = router({
  /**
   * Upload a photographed delivery sheet. Returns the storage PATH — never a
   * URL: the path is persisted as subsidy evidence, and a signed URL would be a
   * replayable link to it.
   */
  uploadPhotoToStorage: voluntarioProcedure
    .input(
      z.object({
        photoData: z.string().min(1, "Datos de foto requeridos"),
        rotation: z.number().int().min(0).max(359).default(0),
        fileName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.photoData, "base64");
      if (buffer.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La foto está vacía" });
      }
      if (buffer.length > MAX_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La foto supera el límite de 5 MB" });
      }

      // Opaque object name: no beneficiary identifier ever goes in a storage key.
      const suffix = Math.random().toString(36).slice(2, 10);
      const objectPath = `photos/${ctx.user?.id ?? "unknown"}/${Date.now()}-${suffix}.jpg`;

      const { path } = await storagePut(
        DELIVERY_DOCS_BUCKET,
        objectPath,
        buffer,
        "image/jpeg"
      );

      return {
        success: true,
        photoPath: path,
        rotation: input.rotation,
        message: "Foto subida exitosamente",
      };
    }),
});
