// client/src/features/families/schemas/signatureCapture.ts
import { z } from "zod";

/**
 * RecordSignatureInputSchema — input for the entregas.recordSignature mutation.
 *
 * signatureDataUrl: must be a PNG or JPEG data URL.
 *   We validate the prefix so garbage strings are rejected before any upload.
 *
 * signerPersonId: UUID of the beneficiary who signed (persons.id FK).
 *   NOT ctx.user.id — that is the staff member recording the delivery.
 *   ctx.user.id is a numeric MySQL int; signerPersonId is a Postgres UUID.
 *
 * deliveryId: UUID of the delivery being signed (deliveries.id FK).
 */
export const RecordSignatureInputSchema = z.object({
  deliveryId: z.string().uuid("deliveryId must be a valid UUID"),
  signerPersonId: z
    .string()
    .uuid("signerPersonId must be a valid UUID (persons.id)"),
  signatureDataUrl: z
    .string()
    .min(1, "La firma no puede estar vacía")
    .refine(
      (v) =>
        v.startsWith("data:image/png;base64,") ||
        v.startsWith("data:image/jpeg;base64,"),
      {
        message: "La firma debe ser una imagen PNG o JPEG en formato data URL",
      }
    ),
});

export type RecordSignatureInput = z.infer<typeof RecordSignatureInputSchema>;

/**
 * RecordSignatureOutputSchema — shape returned by the mutation.
 * Mirrors the delivery_signature_audit Row shape for the fields we return.
 */
export const RecordSignatureOutputSchema = z.object({
  id: z.string().uuid(),
  delivery_id: z.string().uuid(),
  signer_person_id: z.string().uuid(),
  signed_at: z.string(),
});

export type RecordSignatureOutput = z.infer<typeof RecordSignatureOutputSchema>;
