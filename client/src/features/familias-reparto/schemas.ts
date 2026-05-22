import { z } from "zod";

// Single source of truth for Reparto (delivery cycle) validation. Mirrors the
// delivery_rounds / delivery_round_assignments tables. UI never re-declares these.

export const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID format");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");

// ─── Reparto (round) ──────────────────────────────────────────────────────────
export const CapModeSchema = z.enum(["people", "families"]);
export type CapMode = z.infer<typeof CapModeSchema>;

export const EstadoRepartoSchema = z.enum(["borrador", "activa", "cerrada"]);
export type EstadoReparto = z.infer<typeof EstadoRepartoSchema>;

export const CrearRepartoSchema = z.object({
  program_id: uuidLike,
  nombre: z.string().min(1, "Nombre requerido").max(120),
  fecha_inicio: isoDate,
  dias_reparto: z.number().int().min(1).max(31),
  cap_mode: CapModeSchema.default("people"),
  cap_per_day: z.number().int().positive().nullable().optional(),
  kg_total_alimentos: z.number().nonnegative().nullable().optional(),
  kg_total_carne: z.number().nonnegative().nullable().optional(),
  num_albaran_ba: z.string().max(120).optional(),
  num_factura_carne: z.string().max(120).optional(),
  logos: z.array(z.string()).max(4, "Máximo 4 logos").default([]),
  notas: z.string().max(500).optional(),
});
export type CrearReparto = z.infer<typeof CrearRepartoSchema>;

// ─── Contact / attendance enums ─────────────────────────────────────────────
export const EstadoContactoSchema = z.enum([
  "pendiente",
  "confirmada",
  "no_contesta",
  "reprogramada",
]);
export type EstadoContacto = z.infer<typeof EstadoContactoSchema>;

// ─── Assignment row (committed batch) ────────────────────────────────────────
export const AssignmentRowSchema = z.object({
  family_id: uuidLike,
  assigned_day: isoDate,
  day_slot: z.number().int().min(1),
  preferred_day: isoDate.nullable().optional(),
  expediente: z.string().nullable(),
  total_miembros: z.number().int().min(1),
  kg_alimentos: z.number().nullable().optional(),
  kg_carne: z.number().nullable().optional(),
});
export type AssignmentRow = z.infer<typeof AssignmentRowSchema>;

export const CommitAssignmentsSchema = z.object({
  round_id: uuidLike,
  assignments: z.array(AssignmentRowSchema),
});

// ─── Close-out ────────────────────────────────────────────────────────────────
export const MarkAttendanceSchema = z.object({
  assignment_id: uuidLike,
  attended: z.boolean(),
});

export const UndoAttendanceSchema = z.object({ assignment_id: uuidLike });

export const RescheduleSchema = z.object({
  assignment_id: uuidLike,
  new_day: isoDate,
  motivo: z.string().max(300).optional(),
});

export const SetContactEstadoSchema = z.object({
  assignment_id: uuidLike,
  estado_contacto: EstadoContactoSchema,
});
