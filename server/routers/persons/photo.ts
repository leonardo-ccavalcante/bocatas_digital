import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { storagePut } from "../../storage";

export const photoRouter = router({
  /**
   * Upload a photo (profile or consent document) to Manus CDN storage.
   * Accepts base64-encoded JPEG, returns a public CDN URL.
   */
  uploadPhoto: protectedProcedure
    .input(z.object({
      bucket: z.enum(["fotos-perfil", "documentos-consentimiento"]),
      base64: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const randomSuffix = Math.random().toString(36).slice(2, 10);
      const key = `${input.bucket}/${Date.now()}-${randomSuffix}.jpg`;
      const { url } = await storagePut(key, buffer, "image/jpeg");
      return { url, key };
    }),
});
