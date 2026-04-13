import { z } from "zod";

// ─── Program ──────────────────────────────────────────────────────────────────

export const ProgramSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  is_default: z.boolean(),
  is_active: z.boolean(),
  display_order: z.number(),
  volunteer_can_access: z.boolean(),
  requires_consents: z.array(z.string()),
  fecha_inicio: z.string().nullable(),
  fecha_fin: z.string().nullable(),
  config: z.record(z.string(), z.unknown()),
  responsable_id: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type Program = z.infer<typeof ProgramSchema>;

export const ProgramWithCountsSchema = ProgramSchema.extend({
  active_enrollments: z.number(),
  total_enrollments: z.number(),
  new_this_month: z.number(),
});

export type ProgramWithCounts = z.infer<typeof ProgramWithCountsSchema>;

// ─── Enrollment ───────────────────────────────────────────────────────────────

export const EnrollmentEstadoSchema = z.enum(["activo", "completado", "rechazado"]);
export type EnrollmentEstado = z.infer<typeof EnrollmentEstadoSchema>;

export const EnrollmentSchema = z.object({
  id: z.string(),
  estado: EnrollmentEstadoSchema,
  fecha_inicio: z.string().nullable(),
  fecha_fin: z.string().nullable(),
  notas: z.string().nullable(),
  created_at: z.string().nullable(),
  persons: z.object({
    id: z.string(),
    nombre: z.string(),
    apellidos: z.string(),
    foto_perfil_url: z.string().nullable(),
    restricciones_alimentarias: z.string().nullable(),
  }),
});

export type Enrollment = z.infer<typeof EnrollmentSchema>;

// ─── Form input ───────────────────────────────────────────────────────────────

export const ProgramFormSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z_]+$/, "Solo letras minúsculas y guiones bajos"),
  name: z.string().min(2, "El nombre es obligatorio").max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(10).default("🏠"),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  display_order: z.number().int().min(1).max(99).default(99),
  volunteer_can_access: z.boolean().default(true),
  volunteer_can_write: z.boolean().default(true),
  volunteer_visible_fields: z.array(z.string()).default([]),
  requires_consents: z.array(z.string()).default([]),
  fecha_inicio: z.string().nullable().optional(),
  fecha_fin: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  responsable_id: z.string().nullable().optional(),
});

export type ProgramFormValues = z.infer<typeof ProgramFormSchema>;

// ─── Consent purposes ─────────────────────────────────────────────────────────

export const CONSENT_PURPOSES = [
  { value: "tratamiento_datos_bocatas", label: "Tratamiento de datos (Bocatas)" },
  { value: "tratamiento_datos_banco_alimentos", label: "Tratamiento de datos (Banco Alimentos)" },
  { value: "compartir_datos_red", label: "Compartir datos en red" },
  { value: "comunicaciones_whatsapp", label: "Comunicaciones WhatsApp" },
  { value: "fotografia", label: "Fotografía y vídeo" },
] as const;

export type ConsentPurpose = typeof CONSENT_PURPOSES[number]["value"];
