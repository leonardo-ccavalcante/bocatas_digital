import { z } from "zod";

// ─── Enum Schemas — exact DB enum values (from pg_enum introspection) ─────────

export const GeneroSchema = z.enum([
  "masculino", "femenino", "no_binario", "prefiere_no_decir"
]);

export const IdiomaSchema = z.enum([
  "es", "ar", "fr", "bm", "en", "ro", "zh", "wo", "other"
]);

// consent_language DB enum — the languages a consent template can exist in.
// Subset of IdiomaSchema. Single source for the verbal-translation fallback
// rule: an idioma_principal outside this set has no template → show Spanish +
// verbal-translation banner. Mirrored by ConsentTemplateSchema.idioma.
export const CONSENT_TEMPLATE_LANGUAGES = ["es", "ar", "fr", "bm"] as const;

export const ConsentLanguageSchema = z.enum(CONSENT_TEMPLATE_LANGUAGES);
export type ConsentLanguage = z.infer<typeof ConsentLanguageSchema>;

export const ConsentTemplateIdiomaSchema = ConsentLanguageSchema;

export type ConsentTemplateIdioma = ConsentLanguage;

export function isConsentTemplateLanguage(
  value: string | null | undefined
): value is ConsentTemplateIdioma {
  return (
    typeof value === "string" &&
    (CONSENT_TEMPLATE_LANGUAGES as readonly string[]).includes(value)
  );
}

export function getConsentTemplateLanguage(
  value: string | null | undefined
): ConsentTemplateIdioma {
  return isConsentTemplateLanguage(value) ? value : "es";
}

// DB enum values (exact match required for Supabase insert)
export const TipoDocumentoSchema = z.enum([
  "DNI", "NIE", "Pasaporte", "Documento_Extranjero", "Sin_Documentacion"
]);

// OCR extraction uses lowercase (LLM output) — separate schema for OCR only
export const OcrTipoDocumentoSchema = z.enum([
  "dni", "nie", "pasaporte", "documento_extranjero", "otro"
]);

// ISO 3166-1 alpha-2 country codes for document origin
export const PaisDocumentoSchema = z.string().length(2).optional().nullable();

// situacion_legal is text in DB (not an enum)
export const SituacionLegalSchema = z.enum([
  "regular", "irregular", "solicitante_asilo", "en_tramite", "sin_papeles"
]);

export const TipoViviendaSchema = z.enum([
  "calle", "albergue", "piso_compartido_alquiler", "piso_propio_alquiler",
  "piso_propio_propiedad", "ocupacion_sin_titulo", "pension",
  "asentamiento", "centro_acogida", "otros"
]);

export const EstabilidadHabitacionalSchema = z.enum([
  "sin_hogar", "inestable", "temporal", "estable"
]);

export const NivelEstudiosSchema = z.enum([
  "sin_estudios", "primaria", "secundaria", "bachillerato",
  "formacion_profesional", "universitario", "postgrado"
]);

export const SituacionLaboralSchema = z.enum([
  "desempleado", "economia_informal", "empleo_temporal", "empleo_indefinido",
  "autonomo", "en_formacion", "jubilado", "incapacidad_permanente", "sin_permiso_trabajo"
]);

// Situación ante el empleo — FSE/IRPF vulnerability status. ORTHOGONAL to
// SituacionLaboralSchema (employment TYPE); this is the benefit/subsidy STATUS
// dimension the funder IRPF demographic report aggregates. See migration
// 20260708000001_add_situacion_ante_empleo_fse.sql.
export const SituacionAnteEmpleoSchema = z.enum([
  "inactiva",
  "desempleo_subsidio_larga_duracion",
  "agotada_prestacion_subsidio",
  "precariedad_laboral",
  "no_aplica",
]);

// RGPD Art. 9/10 special-category — ethnic origin / sexual orientation /
// criminal-offence. Multi-valued per person. Collection under explicit Art.
// 9(2)(a) consent; see migration 20260708000002_add_colectivos_special_category.sql.
export const ColectivoSchema = z.enum([
  "gitanos", "lgtbi", "sin_hogar", "reclusos_exreclusos",
]);
export type Colectivo = z.infer<typeof ColectivoSchema>;

export const NivelIngresosSchema = z.enum([
  "sin_ingresos", "menos_500", "entre_500_1000", "entre_1000_1500", "mas_1500"
]);

export const CanalLlegadaSchema = z.enum([
  "boca_a_boca", "cruz_roja", "servicios_sociales", "otra_ong",
  "internet", "presencial_directo", "whatsapp", "telefono",
  "email", "instagram", "retorno_bocatas", "otros"
]);

export const FaseItinerarioSchema = z.enum([
  "acogida", "estabilizacion", "formacion", "insercion_laboral", "autonomia"
]);

export const ConsentPurposeSchema = z.enum([
  "tratamiento_datos_bocatas",
  "tratamiento_datos_banco_alimentos",
  "compartir_datos_red",
  "comunicaciones_whatsapp",
  "fotografia",
]);

export type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;
