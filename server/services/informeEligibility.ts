// informeEligibility — decides whether a family is READY to have its Informe de
// Valoración Social generated, or the ORDERED reason it must be skipped.
//
// Invariant (proven in the test): evaluateInformeReadiness(f) === READY  ⇔
// renderDocument("informe_social", …) would succeed for that family. The reasons
// mirror documentService.validateContext so bulk generation NEVER emits an
// incomplete/incorrect legal document.
//
// Order matters: the most fundamental legal defect is reported first.

import { isInformeStale } from "@shared/informeFreshness";

export type InformeSkipReason =
  | "SIN_TITULAR"
  | "TITULAR_DATOS_INCOMPLETOS"
  | "SIN_SEGUIMIENTO"
  | "SEGUIMIENTO_VENCIDO"
  | "SIN_DESCRIPCION_SITUACION"
  | "MIEMBRO_DATOS_INCOMPLETOS"
  // Policy skip (NOT a render-ability reason — evaluateInformeReadiness never
  // returns it): the family already has a valid informe (< 5 months), so the
  // bulk tool leaves it untouched. Applied by the bulk data layer.
  | "INFORME_AL_DIA";

/** Human-readable Spanish label for each skip reason (bulk report UI). */
export const INFORME_SKIP_REASON_LABEL: Record<InformeSkipReason, string> = {
  SIN_TITULAR: "Sin titular asignado",
  TITULAR_DATOS_INCOMPLETOS: "Datos del titular incompletos (nombre, apellidos o documento)",
  SIN_SEGUIMIENTO: "Sin seguimiento registrado",
  SEGUIMIENTO_VENCIDO: "Seguimiento vencido (más de 6 meses)",
  SIN_DESCRIPCION_SITUACION: "Sin descripción de la situación familiar (valoración)",
  MIEMBRO_DATOS_INCOMPLETOS: "Algún miembro tiene datos incompletos",
  INFORME_AL_DIA: "Informe al día (no requiere renovación todavía)",
};

export type InformeReadinessInput = {
  titular_id: string | null;
  titular: { nombre: string | null; apellidos: string | null; numero_documento: string | null } | null;
  /** families.situacion_familiar_texto — the edited valoración narrative. */
  situacion_familiar_texto: string | null;
  /** Most recent family_follow_ups.fecha (ISO YYYY-MM-DD), or null if none. */
  latest_follow_up_fecha: string | null;
  members: Array<{ nombre: string | null; apellidos: string | null; fecha_nacimiento: string | null }>;
};

export type InformeReadiness =
  | { ready: true }
  | { ready: false; reason: InformeSkipReason };

function blank(v: string | null | undefined): boolean {
  return v == null || v.trim() === "";
}

/**
 * Evaluate a family's readiness. First failing rule wins; READY only when every
 * legally-required datum is present and the seguimiento is fresh.
 */
export function evaluateInformeReadiness(f: InformeReadinessInput): InformeReadiness {
  if (f.titular_id == null || f.titular == null) return { ready: false, reason: "SIN_TITULAR" };

  if (blank(f.titular.nombre) || blank(f.titular.apellidos) || blank(f.titular.numero_documento)) {
    return { ready: false, reason: "TITULAR_DATOS_INCOMPLETOS" };
  }

  if (blank(f.latest_follow_up_fecha)) return { ready: false, reason: "SIN_SEGUIMIENTO" };
  if (isInformeStale(f.latest_follow_up_fecha as string)) {
    return { ready: false, reason: "SEGUIMIENTO_VENCIDO" };
  }

  if (blank(f.situacion_familiar_texto)) return { ready: false, reason: "SIN_DESCRIPCION_SITUACION" };

  const memberIncomplete = f.members.some(
    (m) => blank(m.nombre) || blank(m.apellidos) || blank(m.fecha_nacimiento),
  );
  if (memberIncomplete) return { ready: false, reason: "MIEMBRO_DATOS_INCOMPLETOS" };

  return { ready: true };
}
