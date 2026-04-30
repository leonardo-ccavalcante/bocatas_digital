/**
 * Constants for the Familia Program module.
 * Centralises document config, delivery fields, deactivation labels,
 * and session-close presets so they can be reused across components.
 */

// ─── Document checklist config ────────────────────────────────────────────────
// Single source of truth for the Bocatas families program document set.
// 4 family-level docs (perMember omitted / false) + 3 per-member docs (perMember=true, minAge=14).
// Titular is member #0 — no separate dni_titular entry needed.
// Consumed by: Documentación tab checklist, upload buttons, tRPC router enum, DB unique key.
export interface DocConfig {
  key: string;
  label: string;
  required: boolean;
  perMember?: boolean;
  minAge?: number;
}

export const FAMILIA_DOCS_CONFIG: DocConfig[] = [
  // Family-level documents
  { key: "padron_municipal", label: "Padrón municipal", required: true },
  { key: "justificante_situacion", label: "Justificante de situación", required: false },
  { key: "informe_social", label: "Informe social vigente", required: true },
  { key: "autorizacion_recogida", label: "Autorización persona recoge", required: false },
  // Per-member documents (applies to members aged ≥14, including titular as member #0)
  { key: "documento_identidad", label: "DNI / NIE / Pasaporte", required: true, perMember: true, minAge: 14 },
  { key: "consent_bocatas", label: "Consentimiento Bocatas (RGPD)", required: true, perMember: true, minAge: 14 },
  { key: "consent_banco_alimentos", label: "Consentimiento Banco de Alimentos / GUF", required: true, perMember: true, minAge: 14 },
];

// ─── Delivery fields ──────────────────────────────────────────────────────────
export interface DeliveryField {
  key: string;
  label: string;
  type: "number" | "boolean" | "text";
  unit?: string;
}

export const FAMILIA_DELIVERY_FIELDS: DeliveryField[] = [
  { key: "kg_total", label: "Kg totales entregados", type: "number", unit: "kg" },
  { key: "num_bolsas", label: "Número de bolsas", type: "number" },
  { key: "incluye_frescos", label: "Incluye frescos", type: "boolean" },
  { key: "incluye_higiene", label: "Incluye higiene", type: "boolean" },
  { key: "observaciones", label: "Observaciones", type: "text" },
];

// ─── Motivo baja labels ───────────────────────────────────────────────────────
export const MOTIVO_BAJA_LABELS: Record<string, string> = {
  superacion_economica: "Superación económica",
  traslado: "Traslado a otra localidad",
  voluntaria: "Baja voluntaria",
  fallecimiento: "Fallecimiento del titular",
  incumplimiento: "Incumplimiento de normas",
  duplicado: "Registro duplicado",
  otro: "Otro motivo",
};

// ─── Session close preset ─────────────────────────────────────────────────────
export interface SessionCloseField {
  key: string;
  label: string;
  type: "number" | "boolean" | "text";
  required: boolean;
  unit?: string;
}

export const FAMILIA_SESSION_CLOSE_PRESET: SessionCloseField[] = [
  { key: "familias_atendidas", label: "Familias atendidas", type: "number", required: true },
  { key: "kg_total_distribuidos", label: "Kg totales distribuidos", type: "number", required: true, unit: "kg" },
  { key: "incidencias", label: "Incidencias / observaciones", type: "text", required: false },
  { key: "voluntarios_presentes", label: "Voluntarios presentes", type: "number", required: false },
];

// ─── GUF status labels ────────────────────────────────────────────────────────
export const GUF_STATUS_LABELS = {
  ok: "GUF al día",
  warning: "GUF próximo a vencer",
  expired: "GUF vencido",
  none: "Sin alta en GUF",
} as const;

export type GufStatus = keyof typeof GUF_STATUS_LABELS;
