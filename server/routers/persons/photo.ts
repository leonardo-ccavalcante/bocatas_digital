import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { voluntarioProcedure, router } from "../../_core/trpc";
import { storagePut } from "../../storage";

/**
 * Los tres buckets son PRIVADOS
 * (20260829100000_persons_photo_buckets.sql · 20260831100000_documentos_identidad_bucket.sql).
 * Guardan la cara de una persona beneficiaria, fotos de consentimientos
 * firmados a mano (prueba del Art. 7) y fotos de documentos de identidad, así
 * que las lecturas son URLs firmadas de vida corta emitidas en el servidor —
 * nunca una URL pública ni un enlace firmado persistido.
 *
 * `documentos-identidad` alimenta `persons.foto_documento_url`, que está en
 * HIGH_RISK_FIELDS: su LECTURA ya está restringida a admin/superadmin por
 * redactHighRiskFields.
 */
const BUCKETS = [
  "fotos-perfil",
  "documentos-consentimiento",
  "documentos-identidad",
] as const;

/**
 * Decoded-size ceiling per bucket. These MUST match `file_size_limit` on the
 * real buckets (verified in production 2026-08-29): a guard that is more
 * permissive than the bucket accepts a photo here and then fails in the storage
 * layer, so the volunteer takes the photo, the form accepts it, and the save
 * dies afterwards.
 *
 * Note the request-body cap binds first for the larger bucket: base64 inflates
 * ~33% and `/api/trpc/persons.uploadPhoto` is allow-listed at a 10 MB JSON body
 * (server/_core/index.ts), so ~7.5 MiB decoded is the effective ceiling there.
 */
const MAX_BYTES_BY_BUCKET: Record<(typeof BUCKETS)[number], number> = {
  "fotos-perfil": 5 * 1024 * 1024,
  "documentos-consentimiento": 10 * 1024 * 1024,
  // 10 MiB, igual que el bucket vivo en producción (verificado).
  "documentos-identidad": 10 * 1024 * 1024,
};

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
      const maxBytes = MAX_BYTES_BY_BUCKET[input.bucket];
      if (buffer.length > maxBytes) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `La foto supera el límite de ${Math.floor(maxBytes / (1024 * 1024))} MB`,
        });
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
