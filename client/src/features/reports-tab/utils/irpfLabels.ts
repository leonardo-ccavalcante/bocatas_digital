/**
 * irpfLabels.ts — Human-readable labels for the IRPF/FSE report dimension keys.
 *
 * Client-only, self-contained (F-B: reports-tab must not import from server/).
 * These map the aggregation's dimension KEYS (produced server-side as raw
 * strings) to Spanish labels for the funder report:
 *   - estudios: the 5 ROLLED-UP IRPF education buckets (not the 7 raw enum values)
 *   - laboral:  the FSE/IRPF "situación ante el empleo" categories
 *   - colectivo: the Art. 9/10 special-category tags
 */

export const IRPF_ESTUDIOS_LABELS: Record<string, string> = {
  sin_estudios: "Sin estudios",
  primaria: "Educación primaria",
  secundaria: "Educación secundaria",
  postsecundaria_no_superior: "Postsecundaria no superior",
  superior: "Educación superior",
  no_indicado: "No indicado",
};

export const IRPF_LABORAL_LABELS: Record<string, string> = {
  inactiva: "Personas inactivas",
  desempleo_subsidio_larga_duracion: "Desempleo con subsidio de larga duración",
  agotada_prestacion_subsidio: "Ha agotado la prestación / subsidio",
  precariedad_laboral: "Precariedad laboral",
  no_aplica: "No aplica",
  no_indicado: "No indicado",
};

export const IRPF_COLECTIVO_LABELS: Record<string, string> = {
  gitanos: "Población gitana",
  lgtbi: "LGTBI",
  sin_hogar: "Sin hogar",
  reclusos_exreclusos: "Reclusos / exreclusos",
};

export function irpfEstudiosLabel(key: string): string {
  return IRPF_ESTUDIOS_LABELS[key] ?? key;
}
export function irpfLaboralLabel(key: string): string {
  return IRPF_LABORAL_LABELS[key] ?? key;
}
export function irpfColectivoLabel(key: string): string {
  return IRPF_COLECTIVO_LABELS[key] ?? key;
}
