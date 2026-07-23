import { z } from "zod";
import {
  ESTADOS_CATALOGO,
  ESTADOS_INSCRIPCION,
  TIPOS_PROGRAMA,
} from "@shared/programEstados";

// ─── Program ──────────────────────────────────────────────────────────────────

/** Tree fields (ADR-0013) shared by rows and forms. Optional so pre-migration
 * payloads still parse during rollout. */
const TreeFieldsSchema = z.object({
  parent_id: z.string().nullable().optional(),
  tipo: z.enum(TIPOS_PROGRAMA).optional(),
  inscribible: z.boolean().optional(),
  estados_habilitados: z.array(z.string()).optional(),
  plazas: z.number().nullable().optional(),
  etiquetas: z.array(z.string()).optional(),
});

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
  session_close_config: z.record(z.string(), z.unknown()).nullable().optional(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
}).merge(TreeFieldsSchema);

export type Program = z.infer<typeof ProgramSchema>;

// ─── ProgramWithCounts (from get_programs_with_counts RPC) ────────────────────
// The RPC returns `name` (not `nombre`) — the DB column was never renamed.
// Use ProgramSchema for table rows (e.g. from getAll),
// and ProgramWithCountsSchema for the counts RPC.
export const ProgramWithCountsSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  display_order: z.number(),
  is_active: z.boolean(),
  volunteer_can_access: z.boolean(),
  fecha_inicio: z.string().nullable().optional(),
  fecha_fin: z.string().nullable().optional(),
  responsable_id: z.string().nullable().optional(),
  active_enrollments: z.number(),
  total_enrollments: z.number(),
  new_this_month: z.number(),
  children_count: z.number().nullable().optional(),
  subtree_active_persons: z.number().nullable().optional(),
  subtree_total_persons: z.number().nullable().optional(),
}).merge(TreeFieldsSchema);

export type ProgramWithCounts = z.infer<typeof ProgramWithCountsSchema>;

// ─── Enrollment ───────────────────────────────────────────────────────────────

/** Full global catalog (incl. legacy completado/rechazado on old rows). */
export const EnrollmentEstadoSchema = z.enum(ESTADOS_CATALOGO);
export type EnrollmentEstado = z.infer<typeof EnrollmentEstadoSchema>;

/** Canonical states offered by state-change UIs (no legacy values). */
export const ESTADOS_UI = ESTADOS_INSCRIPCION;

export const EnrollmentSchema = z.object({
  id: z.string(),
  estado: EnrollmentEstadoSchema,
  fecha_inicio: z.string().nullable(),
  fecha_fin: z.string().nullable(),
  motivo_baja: z.string().nullable().optional(),
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
    .regex(/^[a-z0-9_]+$/, "Solo minúsculas, números y guiones bajos"),
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
  session_close_config: z.record(z.string(), z.unknown()).nullable().optional(),
  parent_id: z.string().nullable().optional(),
  tipo: z.enum(TIPOS_PROGRAMA).default("basico"),
  inscribible: z.boolean().default(true),
  estados_habilitados: z
    .array(z.enum(ESTADOS_CATALOGO))
    .default(["activo", "pausado", "baja", "terminado"]),
  plazas: z.number().int().min(1).nullable().optional(),
  etiquetas: z.array(z.string().regex(/^[a-z_]+$/)).default([]),
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
