import { z } from "zod";

// ─── Enums (mirror database ENUMs) ────────────────────────────────────────────

export const GeneroSchema = z.enum(["hombre", "mujer", "no_binario", "prefiero_no_decir"]);
export const IdiomaSchema = z.enum(["es", "ar", "fr", "bm", "pt", "wo"]);
export const TipoDocumentoSchema = z.enum(["dni", "nie", "pasaporte", "sin_documento", "otro"]);
export const SituacionLegalSchema = z.enum([
  "regular", "irregular", "solicitante_asilo", "en_tramite", "sin_papeles",
]);
export const TipoViviendaSchema = z.enum([
  "calle", "albergue", "habitacion", "ocupa", "piso", "hostal", "centro_menores", "otro",
]);
export const EstabilidadHabitacionalSchema = z.enum(["estable", "precaria", "sin_vivienda"]);
export const NivelEstudiosSchema = z.enum([
  "sin_estudios", "primaria", "secundaria", "fp", "universitario", "otro",
]);
export const SituacionLaboralSchema = z.enum([
  "sin_empleo", "trabajo_informal", "trabajo_formal",
]);
export const NivelIngresosSchema = z.enum(["sin_ingresos", "menos_400", "400_900", "mas_900"]);
export const CanalLlegadaSchema = z.enum([
  "derivacion_entidad", "boca_a_boca", "llegada_directa", "contacto_digital",
]);
export const FaseItinerarioSchema = z.enum([
  "acogida", "orientacion", "acompanamiento", "autonomia", "cierre",
]);

// ─── Main person schema (48+ fields) ─────────────────────────────────────────

export const PersonCreateSchema = z.object({
  // IDENTIDAD
  nombre: z.string().min(1, "Nombre requerido").max(100),
  apellidos: z.string().min(1, "Apellidos requeridos").max(150),
  fecha_nacimiento: z.string().date("Fecha inválida"),
  genero: GeneroSchema.optional(),
  pais_origen: z.string().max(100).optional(),
  idioma_principal: IdiomaSchema,
  idiomas: z.array(z.string()).optional(),

  // CONTACTO
  telefono: z.string().regex(/^\+?[0-9\s\-]{7,20}$/, "Teléfono inválido").optional(),
  email: z.string().email("Email inválido").optional(),
  direccion: z.string().max(200).optional(),
  municipio: z.string().max(100).optional(),
  barrio_zona: z.string().max(100).optional(),

  // DOCUMENTACIÓN
  tipo_documento: TipoDocumentoSchema.optional(),
  numero_documento: z.string().max(30).optional(),
  situacion_legal: SituacionLegalSchema.optional(),
  fecha_llegada_espana: z.string().date().optional(),

  // SITUACIÓN HABITACIONAL
  tipo_vivienda: TipoViviendaSchema.optional(),
  estabilidad_habitacional: EstabilidadHabitacionalSchema.optional(),
  empadronado: z.boolean().optional(),

  // SOCIOECONÓMICO
  nivel_estudios: NivelEstudiosSchema.optional(),
  situacion_laboral: SituacionLaboralSchema.optional(),
  nivel_ingresos: NivelIngresosSchema.optional(),

  // RED RELACIONAL
  canal_llegada: CanalLlegadaSchema.optional(),
  persona_referencia: z.string().max(200).optional(),
  entidad_derivadora: z.string().max(200).optional(),

  // INFO SOCIAL (texto libre — HIGH RISK: no exponer en persons_safe)
  recorrido_migratorio: z.string().max(2000).optional(),
  necesidades_principales: z.string().max(1000).optional(),
  restricciones_alimentarias: z.string().max(300).optional(),
  observaciones: z.string().max(2000).optional(),
  notas_privadas: z.string().max(2000).optional(),

  // RETORNO
  es_retorno: z.boolean().optional(),
  motivo_retorno: z.string().max(500).optional(),

  // ITINERARIO
  fase_itinerario: FaseItinerarioSchema.optional(),
  alertas_activas: z.array(z.string()).optional(),

  // EMPLEO
  estado_empleo: z.string().max(100).optional(),
  empresa_empleo: z.string().max(200).optional(),

  // FOTOS / DOCUMENTOS
  foto_perfil_url: z.string().url().optional(),
  foto_documento_url: z.string().url().optional(),

  // PROGRAMAS (al alta) — UUIDs de programs.id
  program_ids: z.array(z.string().uuid()).default([]),
});

export type PersonCreateInput = z.infer<typeof PersonCreateSchema>;

export const PersonUpdateSchema = PersonCreateSchema.partial().extend({
  id: z.string().uuid(),
});

export type PersonUpdateInput = z.infer<typeof PersonUpdateSchema>;

// OCR extracted data (subset — public fields only)
export const OcrExtractedSchema = z.object({
  nombre: z.string().nullable(),
  apellidos: z.string().nullable(),
  fecha_nacimiento: z.string().nullable(),
  numero_documento: z.string().nullable(),
  tipo_documento: z.enum(["dni", "nie", "pasaporte", "otro"]).nullable(),
  pais_emision: z.string().nullable(),
  fecha_caducidad: z.string().nullable(),
});

export type OcrExtracted = z.infer<typeof OcrExtractedSchema>;
