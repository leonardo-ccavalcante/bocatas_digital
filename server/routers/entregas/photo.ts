import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../../_core/trpc";
import { storagePut } from "../../storage";

export const photoRouter = router({
  /**
   * Upload photo to S3 storage and return URL.
   */
  uploadPhotoToStorage: protectedProcedure
    .input(
      z.object({
        photoData: z.string().min(1, "Datos de foto requeridos"),
        rotation: z.number().int().min(0).max(359).default(0),
        fileName: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const fileName = input.fileName || `photo-${timestamp}-${randomSuffix}.jpg`;
        const fileKey = `deliveries/photos/${ctx.user?.id || "unknown"}/${fileName}`;
        const buffer = Buffer.from(input.photoData, "base64");
        const { url, key } = await storagePut(fileKey, buffer, "image/jpeg");
        return {
          success: true,
          photoUrl: url,
          photoKey: key,
          rotation: input.rotation,
          message: "Foto subida exitosamente",
        };
      } catch (error) {
        console.error("Error uploading photo:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Error al subir foto",
        });
      }
    }),
});
