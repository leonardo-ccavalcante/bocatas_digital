/**
 * constants.ts — Single source of truth for check-in enumerations.
 * Imported by both the XState machine (client) and the tRPC router (server).
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
