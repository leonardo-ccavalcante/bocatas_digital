import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { voluntarioProcedure, router } from "../../_core/trpc";
import { storagePut } from "../../storage";

/**
 * Both buckets are PRIVATE and created by
 * supabase/migrations/20260829100000_persons_photo_buckets.sql. They hold a
 * beneficiary's face and photographs of wet-signed consent forms (RGPD Art. 7
 * evidence), so reads are short-lived signed URLs minted server-side — never a
 * public URL and never a persisted signed link.
 */
const BUCKETS = ["fotos-perfil", "documentos-consentimiento"] as const;

/** Matches the bucket file_size_limit (8 MiB decoded). */
const MAX_BYTES = 8 * 1024 * 1024;

export const photoRouter = router({
  /**
   * Upload a photo (profile or consent document) to Supabase Storage.
   * Returns the storage PATH; callers persist that and resolve it through a
   * signed URL at read time.
   */
  uploadPhoto: voluntarioProcedure
    .input(z.object({
      bucket: z.enum(BUCKETS),
      base64: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      if (buffer.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La foto está vacía" });
      }
      if (buffer.length > MAX_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La foto supera el límite de 8 MB" });
      }

      // Opaque object name. The wizard uploads before the person exists, and a
      // person id in a storage key would be PII in the key either way.
      const suffix = Math.random().toString(36).slice(2, 10);
      const { path } = await storagePut(
        input.bucket,
        `${Date.now()}-${suffix}.jpg`,
        buffer,
        "image/jpeg"
      );

      return { bucket: input.bucket, path };
    }),
});
