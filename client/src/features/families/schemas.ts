import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const MotivoBajaSchema = z.enum([
  "solicitud_propia",
  "cambio_domicilio",
  "mejora_economica",
  "fallecimiento",
  "incumplimiento_normas",
  "otros",
]);
export type MotivoBaja = z.infer<typeof MotivoBajaSchema>;

export const EstadoFamiliaSchema = z.enum(["activa", "baja", "suspendida"]);
export type EstadoFamilia = z.infer<typeof EstadoFamiliaSchema>;

// ─── Member (linked to persons registry) ─────────────────────────────────────
export const FamilyMemberSchema = z.object({
  person_id: z.string().uuid().optional().nullable(),
  nombre: z.string().min(1, "Nombre obligatorio"),
  apellidos: z.string().min(1, "Apellidos obligatorios"),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  tipo_documento: z.string().optional().nullable(),
  numero_documento: z.string().optional().nullable(),
  parentesco: z.string().min(1, "Parentesco obligatorio"),
  es_menor: z.boolean().optional().default(false),
});
export type FamilyMember = z.infer<typeof FamilyMemberSchema>;

// ─── Intake Wizard Steps ──────────────────────────────────────────────────────
/** Step 1: Titular (pre-loaded from persons registry) + Programa */
const SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";
export const IntakeStep1Schema = z.object({
  titular_id: z.string().uuid("Debe seleccionar un titular del registro"),
  program_id: z
    .string()
    .uuid("Debe seleccionar un programa")
    .refine((v) => v !== SENTINEL_UUID, {
      message: "Programa requerido: seleccione un programa válido",
    }),
});

/** Step 2: Family members */
export const IntakeStep2Schema = z.object({
  num_adultos: z.number().int().min(1),
  num_menores_18: z.number().int().min(0),
  miembros: z.array(FamilyMemberSchema).min(0),
});

/** Step 3: Documentation checklist */
export const IntakeStep3Schema = z.object({
  docs_identidad: z.boolean().default(false),
  padron_recibido: z.boolean().default(false),
  justificante_recibido: z.boolean().default(false),
  informe_social: z.boolean().default(false),
  informe_social_fecha: z.string().optional().nullable(),
  consent_bocatas: z.boolean().default(false),
  consent_banco_alimentos: z.boolean().default(false),
});

/** Step 4: GUF registration */
export const IntakeStep4Schema = z.object({
  alta_en_guf: z.boolean().default(false),
  fecha_alta_guf: z.string().optional().nullable(),
  guf_cutoff_day: z.number().int().min(1).max(31).optional().nullable(),
});

/** Step 5: Authorized person */
export const IntakeStep5Schema = z.object({
  autorizado: z.boolean().default(false),
  persona_recoge: z.string().optional().nullable(),
  autorizado_documento_url: z.string().optional().nullable(),
});

/** Full intake form */
export const FamilyIntakeSchema = IntakeStep1Schema
  .merge(IntakeStep2Schema)
  .merge(IntakeStep3Schema)
  .merge(IntakeStep4Schema)
  .merge(IntakeStep5Schema);
export type FamilyIntake = z.infer<typeof FamilyIntakeSchema>;

// ─── Delivery ─────────────────────────────────────────────────────────────────
export const DeliveryCreateSchema = z.object({
  family_id: z.string().uuid(),
  fecha_entrega: z.string(),
  kg_frutas_hortalizas: z.number().min(0),
  kg_carne: z.number().min(0),
  kg_infantil: z.number().min(0).default(0),
  kg_otros: z.number().min(0).default(0),
  recogido_por: z.string().min(1),
  es_autorizado: z.boolean().default(false),
  firma_url: z.string().optional(),
  recogido_por_documento_url: z.string().optional(),
  session_id: z.string().uuid().optional(),
  notas: z.string().optional(),
});
export type DeliveryCreate = z.infer<typeof DeliveryCreateSchema>;

// ─── GUF ──────────────────────────────────────────────────────────────────────
export const GufUpdateSchema = z.object({
  id: z.string().uuid(),
  alta_en_guf: z.boolean(),
  fecha_alta_guf: z.string().optional(),
  guf_cutoff_day: z.number().int().min(1).max(31).optional(),
});

// ─── Compliance ───────────────────────────────────────────────────────────────
export const ComplianceFilterSchema = z.object({
  program_id: z.string().uuid().optional(),
  estado: EstadoFamiliaSchema.optional(),
  guf_only: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(100).default(20),
});

// ─── Session Close ────────────────────────────────────────────────────────────
export const SessionCloseSchema = z.object({
  program_id: z.string().uuid(),
  fecha: z.string(),
  location_id: z.string().uuid().optional(),
  session_data: z.record(z.string(), z.unknown()),
});
