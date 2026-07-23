import { z } from "zod";

/**
 * Single source of truth for Reparto (delivery cycle) validation.
 *
 * Mirrors delivery_rounds / delivery_round_slots / delivery_round_assignments.
 * Imported by BOTH the tRPC router (server/routers/families/rounds-*.ts) and the
 * client feature (client/src/features/familias-reparto/*). Never re-declare these
 * in a component or router — import from here.
 *
 * The scheduling unit is a SLOT = (slot_date, turno). Delivery days are chosen
 * explicitly (≤10 days/month, not consecutive); each day carries 1-2 turnos.
 */

export const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID format");

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)");

// ─── Turno / estado enums ───────────────────────────────────────────────────
export const TurnoSchema = z.enum(["manana", "tarde"]);
export type Turno = z.infer<typeof TurnoSchema>;

export const EstadoRepartoSchema = z.enum(["borrador", "activa", "cerrada"]);
export type EstadoReparto = z.infer<typeof EstadoRepartoSchema>;

export const EstadoSlotSchema = z.enum(["abierto", "cerrado"]);
export type EstadoSlot = z.infer<typeof EstadoSlotSchema>;

// ─── Slot input (the day×turno matrix the operator picks) ───────────────────
export const SlotInputSchema = z.object({
  slot_date: isoDate,
  turno: TurnoSchema,
  cap: z.number().int().positive().nullable().optional(), // cupo POR TURNO
  es_fuera_madrid: z.boolean().optional(), // dedicated slot for fuera-de-Madrid
});
export type SlotInput = z.infer<typeof SlotInputSchema>;

// ─── Crear reparto ──────────────────────────────────────────────────────────
// fecha_inicio is NOT an input — the server derives it from min(slot_date).
export const CrearRepartoSchema = z
  .object({
    program_id: uuidLike,
    nombre: z.string().min(1, "Nombre requerido").max(120),
    slots: z.array(SlotInputSchema).min(1, "Selecciona al menos un turno"),
    kg_total_alimentos: z.number().nonnegative().nullable().optional(),
    kg_total_carne: z.number().nonnegative().nullable().optional(),
    num_albaran_ba: z.array(z.string().max(120)).max(4, "Máximo 4 albaranes").optional(),
    num_factura_carne: z.array(z.string().max(120)).max(4, "Máximo 4 facturas").optional(),
    logos: z.array(z.string()).max(4, "Máximo 4 logos").default([]),
    notas: z.string().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    const dates = new Set(val.slots.map((s) => s.slot_date));
    if (dates.size > 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Máximo 10 días de reparto en el mes",
        path: ["slots"],
      });
    }
    // The product model is "days within a single month" — enforce it server-side
    // too (the UI month-picker already constrains it, but the RPC must not trust that).
    const months = new Set(val.slots.map((s) => s.slot_date.slice(0, 7)));
    if (months.size > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Todos los días deben ser del mismo mes",
        path: ["slots"],
      });
    }
    const seen = new Set<string>();
    for (const s of val.slots) {
      const k = `${s.slot_date}#${s.turno}`;
      if (seen.has(k)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Turno duplicado: ${s.slot_date} ${s.turno}`,
          path: ["slots"],
        });
      }
      seen.add(k);
    }
  });
export type CrearReparto = z.infer<typeof CrearRepartoSchema>;

// ─── Contact / attendance ───────────────────────────────────────────────────
// 'renuncia' = the family declined the whole round during contact (early opt-out).
// 'no_contesta' already covers "no responde" — reused, not renamed.
export const EstadoContactoSchema = z.enum([
  "pendiente",
  "confirmada",
  "no_contesta",
  "reprogramada",
  "renuncia",
]);
export type EstadoContacto = z.infer<typeof EstadoContactoSchema>;

// ─── Assignment row (committed batch) — carries turno ───────────────────────
export const AssignmentRowSchema = z.object({
  family_id: uuidLike,
  assigned_day: isoDate,
  turno: TurnoSchema,
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

// ─── Close-out ──────────────────────────────────────────────────────────────
export const MarkAttendanceSchema = z.object({ assignment_id: uuidLike, attended: z.boolean() });
export const UndoAttendanceSchema = z.object({ assignment_id: uuidLike });

// Re-assign a family to another (open) slot: moves day AND turno.
export const RescheduleSchema = z.object({
  assignment_id: uuidLike,
  new_day: isoDate,
  new_turno: TurnoSchema,
  motivo: z.string().max(300).optional(),
});

export const SetContactEstadoSchema = z.object({
  assignment_id: uuidLike,
  estado_contacto: EstadoContactoSchema,
});

// Close a single turno (slot). The round completes only when all slots close.
export const CerrarTurnoSchema = z.object({ slot_id: uuidLike });

// ─── Reparto v2 — flexible suggested day, carry-over, activation, signature ──
// (Additive: these are consumed by the redesigned rounds-activation / -closeout /
// -signature routers. The legacy AssignmentRow/CommitAssignments schemas above are
// removed in PR-2 once their callers are gone.)

// Server-authoritative activation: the operator picks nothing — the server derives
// ALL active families and computes the suggested distribution. Only the round id.
export const ActivateRoundSchema = z.object({ round_id: uuidLike });
export const PreviewAssignmentsSchema = z.object({ round_id: uuidLike });

// Close the whole round (last day): marks never-attended families as ausente.
export const CloseRoundSchema = z.object({
  round_id: uuidLike,
  notas: z.string().max(500).optional(),
});

// Roster for one day's close-out: the slot in view + ALL still-pending families of
// the round (carry-over), ordered smallest family first.
export const GetSlotRosterSchema = z.object({ round_id: uuidLike, slot_id: uuidLike });

// Mark attendance now carries the ACTUAL slot the family showed up at (may differ
// from the suggested day). Kept separate from the legacy MarkAttendanceSchema until
// its caller migrates.
export const MarkAttendanceAtSlotSchema = z.object({
  assignment_id: uuidLike,
  slot_id: uuidLike,
  attended: z.boolean(),
});

export const BulkMarkAttendanceSchema = z.object({
  round_id: uuidLike,
  slot_id: uuidLike,
  assignment_ids: z.array(uuidLike).min(1, "Lista vacía"),
  attended: z.boolean(),
});

// Contact outcome: record up to 2 days the family said it can attend, or an early
// renuncia. Admin-only (contact is admin work). preferred_slot_ids are slot UUIDs.
export const SetContactoFamiliaSchema = z
  .object({
    assignment_id: uuidLike,
    estado_contacto: EstadoContactoSchema,
    preferred_slot_ids: z.array(uuidLike).max(2, "Máximo 2 días preferidos").optional(),
    renuncia: z.boolean().optional(),
  })
  .refine((v) => !(v.renuncia && (v.preferred_slot_ids?.length ?? 0) > 0), {
    message: "Una renuncia no lleva días preferidos",
    path: ["preferred_slot_ids"],
  });

// On-screen signature capture at pickup. Static-bitmap PNG/JPEG data URL only (no
// stroke dynamics — keeps it out of RGPD Art. 9). Size-capped to bound the payload.
const MAX_SIGNATURE_DATA_URL = 500_000; // ~360 KB decoded
export const RecordRepartoFirmaSchema = z.object({
  assignment_id: uuidLike,
  slot_id: uuidLike,
  signer_person_id: uuidLike,
  signature_data_url: z
    .string()
    .min(1, "Firma vacía")
    .max(MAX_SIGNATURE_DATA_URL, "Firma demasiado grande")
    .regex(/^data:image\/(png|jpe?g);base64,/, "Formato de firma inválido"),
});
