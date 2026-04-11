import { z } from "zod";

export const MetodoCheckinSchema = z.enum(["qr", "manual", "nfc"]);

export const CheckinCreateSchema = z.object({
  person_id: z.string().uuid().nullable(),
  location_id: z.string().uuid(),
  programa: z.enum(["comedor", "familia", "formacion", "atencion_juridica", "voluntariado", "acompanamiento"]),
  metodo: MetodoCheckinSchema,
  notas: z.string().max(500).optional(),
  es_demo: z.boolean().default(false),
});

export type CheckinCreateInput = z.infer<typeof CheckinCreateSchema>;

export const CheckinResultSchema = z.object({
  id: z.string().uuid(),
  person_id: z.string().uuid().nullable(),
  location_id: z.string().uuid(),
  checked_in_at: z.string(),
  checked_in_date: z.string(),
  metodo: MetodoCheckinSchema,
  programa: z.string().nullable(),
});

export type CheckinResult = z.infer<typeof CheckinResultSchema>;
