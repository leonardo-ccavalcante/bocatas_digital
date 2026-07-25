/**
 * sessionSchemas.ts — Zod schemas for program session lifecycle (cierre de sesión).
 *
 * Single source of truth for:
 * - Session states (planificada, abierta, cerrada, cancelada)
 * - Schedule configuration (programacion) stored in programs.config
 * - Session close configuration per program type
 * - Field types and presets for close-out forms
 */

import { z } from "zod";

// ============================================================================
// SESSION STATES
// ============================================================================

export const SESSION_ESTADOS = [
  "planificada",
  "abierta",
  "cerrada",
  "cancelada",
] as const;

export type SessionEstado = (typeof SESSION_ESTADOS)[number];

export const SESSION_ESTADO_LABELS: Record<SessionEstado, string> = {
  planificada: "Planificada",
  abierta: "Abierta",
  cerrada: "Cerrada",
  cancelada: "Cancelada",
};

export const SessionEstadoSchema = z.enum(SESSION_ESTADOS);

// ============================================================================
// TIME VALIDATION HELPERS
// ============================================================================

/** HH:MM format regex (24h). */
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Validates HH:MM string. */
export const TimeStringSchema = z.string().regex(TIME_REGEX, {
  message: "Formato de hora inválido. Usar HH:MM (ej: 09:30)",
});

/** Parses HH:MM into minutes since midnight for comparison. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// ============================================================================
// PROGRAMACION (SCHEDULE) SCHEMA
// ============================================================================

/**
 * A single scheduled slot: day of week + start/end time.
 * Lives in programs.config.programacion as an array.
 */
export const ProgramacionSlotSchema = z
  .object({
    dia_semana: z.number().int().min(0).max(6), // 0=Sunday, 6=Saturday
    hora_inicio: TimeStringSchema,
    hora_fin: TimeStringSchema,
  })
  .refine((slot) => timeToMinutes(slot.hora_fin) > timeToMinutes(slot.hora_inicio), {
    message: "hora_fin debe ser posterior a hora_inicio",
    path: ["hora_fin"],
  });

export type ProgramacionSlot = z.infer<typeof ProgramacionSlotSchema>;

export const ProgramacionSchema = z.array(ProgramacionSlotSchema);

export type Programacion = z.infer<typeof ProgramacionSchema>;

/** Day names in Spanish (index = JS getDay()). */
export const DIA_SEMANA_LABELS: readonly string[] = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

// ============================================================================
// CLOSE FIELD TYPES
// ============================================================================

export const CLOSE_FIELD_TIPOS = [
  "numero",
  "kg",
  "contagem_personas",
  "texto",
  "lista_voluntarios",
] as const;

export type CloseFieldTipo = (typeof CLOSE_FIELD_TIPOS)[number];

export const CLOSE_FIELD_TIPO_LABELS: Record<CloseFieldTipo, string> = {
  numero: "Número",
  kg: "Kilogramos",
  contagem_personas: "Conteo de personas",
  texto: "Texto libre",
  lista_voluntarios: "Lista de voluntarios",
};

// ============================================================================
// SESSION CLOSE CONFIG SCHEMA
// ============================================================================

/**
 * A single field in the close-out form.
 */
export const CloseFieldSchema = z.object({
  slug: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  tipo: z.enum(CLOSE_FIELD_TIPOS),
  obligatorio: z.boolean(),
});

export type CloseField = z.infer<typeof CloseFieldSchema>;

/**
 * A required/optional document upload in the close-out form. `slug` references
 * a program_document_types row with scope='sesion'; label + obligatorio drive
 * the UI ("Plan de la clase (obligatorio)"). Richer than a bare slug so the
 * config can express whether an upload blocks the close.
 */
export const CloseUploadSchema = z.object({
  slug: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  obligatorio: z.boolean(),
});

export type CloseUpload = z.infer<typeof CloseUploadSchema>;

/**
 * Session close configuration for a program.
 * Lives in programs.session_close_config.
 */
export const SessionCloseConfigSchema = z.object({
  enabled: z.boolean(),
  fields: z.array(CloseFieldSchema),
  uploads: z.array(CloseUploadSchema),
  tema_obligatorio: z.boolean().optional().default(false),
});

export type SessionCloseConfig = z.infer<typeof SessionCloseConfigSchema>;

// ============================================================================
// CLOSE CONFIG PRESETS BY PROGRAM TYPE
// ============================================================================

/**
 * Default close configurations per program type.
 * Applied when creating a program of that type.
 */
export const CLOSE_CONFIG_PRESETS: Record<string, SessionCloseConfig> = {
  edicion: {
    enabled: true,
    fields: [],
    uploads: [
      { slug: "plan_clase", label: "Plan de la clase", obligatorio: true },
    ],
    tema_obligatorio: true,
  },
  actividad: {
    enabled: true,
    fields: [
      { slug: "asistentes", label: "Número de asistentes", tipo: "contagem_personas", obligatorio: true },
      { slug: "incidencias", label: "Incidencias", tipo: "texto", obligatorio: false },
    ],
    uploads: [],
    tema_obligatorio: false,
  },
  continuo: {
    enabled: true,
    fields: [
      { slug: "raciones", label: "Raciones servidas", tipo: "numero", obligatorio: true },
    ],
    uploads: [],
    tema_obligatorio: false,
  },
  curso: {
    enabled: false,
    fields: [],
    uploads: [],
    tema_obligatorio: false,
  },
  contenedor: {
    enabled: false,
    fields: [],
    uploads: [],
    tema_obligatorio: false,
  },
  basico: {
    enabled: false,
    fields: [],
    uploads: [],
    tema_obligatorio: false,
  },
};

// ============================================================================
// SESSION DATA SCHEMA (session_data JSONB)
// ============================================================================

/**
 * Schema for the session_data JSONB field on program_sessions.
 * Stores the close-out field values.
 */
export const SessionDataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.array(z.string()), z.null()])
);

export type SessionData = z.infer<typeof SessionDataSchema>;

// ============================================================================
// SESSION SCHEMA (matches program_sessions table)
// ============================================================================

export const ProgramSessionSchema = z.object({
  id: z.string().uuid(),
  program_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // DATE as ISO string
  location_id: z.string().uuid().nullable(),
  estado: SessionEstadoSchema,
  hora_inicio: z.string().nullable(), // TIME as string
  hora_fin: z.string().nullable(),
  responsable_nombre: z.string().nullable(),
  responsable_person_id: z.string().uuid().nullable(),
  motivo_cancelacion: z.string().nullable(),
  en_nombre_de: z.string().nullable(),
  enlace_token_hash: z.string().nullable(),
  enlace_expira: z.string().datetime().nullable(),
  opened_by: z.string().uuid().nullable(),
  closed_by: z.string().uuid().nullable(),
  closed_at: z.string().datetime().nullable(),
  session_data: SessionDataSchema.nullable(),
  created_at: z.string().datetime(),
});

export type ProgramSession = z.infer<typeof ProgramSessionSchema>;

// ============================================================================
// SESSION DOCUMENT SCHEMA (matches session_documents table)
// ============================================================================

export const SessionDocumentSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  tipo_slug: z.string().min(1),
  url: z.string().min(1),
  version: z.number().int().positive(),
  subido_por: z.string().min(1),
  en_nombre_de: z.string().nullable(),
  created_at: z.string().datetime(),
});

export type SessionDocument = z.infer<typeof SessionDocumentSchema>;

export const SessionDocumentInsertSchema = SessionDocumentSchema.omit({
  id: true,
  created_at: true,
}).extend({
  version: z.number().int().positive().optional().default(1),
});

export type SessionDocumentInsert = z.infer<typeof SessionDocumentInsertSchema>;
