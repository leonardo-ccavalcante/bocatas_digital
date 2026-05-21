import { z } from "zod";

export const DOCUMENT_SLUGS = ["informe_social", "nota_entrega", "derivacion"] as const;
export type DocumentSlug = (typeof DOCUMENT_SLUGS)[number];

const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "UUID inválido");

export const FollowUpCreateSchema = z.object({
  family_id: uuidLike,
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  notas: z.string().max(2000).optional(),
});
export type FollowUpCreate = z.infer<typeof FollowUpCreateSchema>;

export const GenerateDocumentInputSchema = z.object({
  family_id: uuidLike,
  slug: z.enum(DOCUMENT_SLUGS),
  // Required for nota_entrega; ignored for informe_social / derivacion.
  session_id: uuidLike.optional(),
});
export type GenerateDocumentInput = z.infer<typeof GenerateDocumentInputSchema>;

export const TemplatePublishSchema = z.object({
  slug: z.enum(DOCUMENT_SLUGS),
  nombre: z.string().min(1).max(120),
  storage_path: z.string().min(1),
  logos: z.array(z.string()).default([]),
  static_blocks: z.record(z.string(), z.string()).default({}),
  // placeholders is derived from the uploaded DOCX by the server —
  // not supplied by the client to avoid drift.
});
export type TemplatePublish = z.infer<typeof TemplatePublishSchema>;
