/**
 * constants.ts — Single source of truth for check-in enums
 *
 * These constants are used across:
 * - XState machine (checkinMachine.ts)
 * - tRPC router (server/routers/checkin.ts)
 * - UI components (ProgramSelector, etc.)
 */

export const PROGRAMA_VALUES = [
  "comedor",
  "familia",
  "formacion",
  "atencion_juridica",
  "voluntariado",
  "acompanamiento",
] as const;

export type CheckinPrograma = (typeof PROGRAMA_VALUES)[number];

export const METODO_VALUES = [
  "qr_scan",
  "manual_busqueda",
  "conteo_anonimo",
] as const;

export type CheckinMetodo = (typeof METODO_VALUES)[number];

/**
 * Human-readable labels for UI display
 */
export const PROGRAMA_LABELS: Record<CheckinPrograma, string> = {
  comedor: "Comedor",
  familia: "Familia",
  formacion: "Formación",
  atencion_juridica: "Atención Jurídica",
  voluntariado: "Voluntariado",
  acompanamiento: "Acompañamiento",
};

export const METODO_LABELS: Record<CheckinMetodo, string> = {
  qr_scan: "Escaneo QR",
  manual_busqueda: "Búsqueda Manual",
  conteo_anonimo: "Conteo Anónimo",
};
