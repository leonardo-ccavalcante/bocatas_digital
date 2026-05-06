import { z } from "zod";
import {
  CanalLlegadaSchema,
  ConsentPurposeSchema,
  EstabilidadHabitacionalSchema,
  FaseItinerarioSchema,
  GeneroSchema,
  IdiomaSchema,
  NivelEstudiosSchema,
  NivelIngresosSchema,
  OcrTipoDocumentoSchema,
  SituacionLaboralSchema,
  TipoDocumentoSchema,
  TipoViviendaSchema,
} from "./enums";

// ─── OCR Result Schema ────────────────────────────────────────────────────────

export const OCRResultSchema = z.object({
  success: z.boolean(),
  data: z.object({
    nombre: z.string().max(100).optional(),
    apellidos: z.string().max(150).optional(),
    fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    // OCR returns lowercase values from LLM — use OcrTipoDocumentoSchema
    tipo_documento: OcrTipoDocumentoSchema.optional(),
    numero_documento: z.string().max(30).optional(),
    pais_origen: z.string().optional(), // OCR may return full name — mapped to ISO-2 before insert
    pais_documento: z.string().length(2).optional(), // ISO 3166-1 alpha-2 country code of document origin
  }),
});

export type OCRResult = z.infer<typeof OCRResultSchema>;
export const OcrExtractedSchema = OCRResultSchema.shape.data;
export type OcrExtracted = z.infer<typeof OcrExtractedSchema>;

// ─── Consent Template Schema ──────────────────────────────────────────────────

export const ConsentTemplateSchema = z.object({
  id: z.string().uuid(),
  purpose: ConsentPurposeSchema,
  idioma: z.enum(["es", "ar", "fr", "bm"]), // consent_language enum
  version: z.string(),
  text_content: z.string().min(10),
  is_active: z.boolean(),
  updated_at: z.string().optional().nullable(),
});

export type ConsentTemplate = z.infer<typeof ConsentTemplateSchema>;

// ─── Program Schema ───────────────────────────────────────────────────────────

export const ProgramSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().max(50),
  name: z.string().max(100),
  description: z.string().optional().nullable(),
  icon: z.string().max(50).default("📋"),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  display_order: z.number().int().default(99),
});

export type Program = z.infer<typeof ProgramSchema>;

// ─── Duplicate Candidate Schema ───────────────────────────────────────────────

export const DuplicateCandidateSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  apellidos: z.string().nullable(),
  fecha_nacimiento: z.string().optional().nullable(),
  foto_perfil_url: z.string().optional().nullable(),
  similarity: z.number().min(0).max(1),
});

export type DuplicateCandidate = z.infer<typeof DuplicateCandidateSchema>;

// ─── Person (read) Schema ─────────────────────────────────────────────────────

export const PersonSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string(),
  apellidos: z.string().nullable(),
  fecha_nacimiento: z.string().optional().nullable(),
  genero: GeneroSchema.optional().nullable(),
  pais_origen: z.string().optional().nullable(),
  idioma_principal: IdiomaSchema.optional().nullable(),
  idiomas: z.array(IdiomaSchema).optional().nullable(),
  telefono: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  direccion: z.string().optional().nullable(),
  municipio: z.string().optional().nullable(),
  barrio_zona: z.string().optional().nullable(),
  tipo_documento: TipoDocumentoSchema.optional().nullable(),
  numero_documento: z.string().optional().nullable(),
  foto_documento_url: z.string().optional().nullable(),
  foto_perfil_url: z.string().optional().nullable(),
  situacion_legal: z.string().optional().nullable(),
  fecha_llegada_espana: z.string().optional().nullable(),
  tipo_vivienda: TipoViviendaSchema.optional().nullable(),
  estabilidad_habitacional: EstabilidadHabitacionalSchema.optional().nullable(),
  empadronado: z.boolean().optional().nullable(),
  nivel_estudios: NivelEstudiosSchema.optional().nullable(),
  situacion_laboral: SituacionLaboralSchema.optional().nullable(),
  nivel_ingresos: NivelIngresosSchema.optional().nullable(),
  canal_llegada: CanalLlegadaSchema.optional().nullable(),
  entidad_derivadora: z.string().optional().nullable(),
  persona_referencia: z.string().optional().nullable(),
  recorrido_migratorio: z.string().optional().nullable(),
  necesidades_principales: z.string().optional().nullable(),
  restricciones_alimentarias: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  notas_privadas: z.string().optional().nullable(),
  fase_itinerario: FaseItinerarioSchema.optional().nullable(),
  created_at: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
});

export type Person = z.infer<typeof PersonSchema>;

// ─── Consent Row Schema ───────────────────────────────────────────────────────

export const ConsentRowSchema = z.object({
  person_id: z.string().uuid(),
  purpose: ConsentPurposeSchema,
  idioma: z.enum(["es", "ar", "fr", "bm"]),
  granted: z.boolean(),
  granted_at: z.string().optional().nullable(),
  consent_text: z.string(),
  consent_version: z.string(),
  documento_foto_url: z.string().url().optional().nullable(),
  numero_serie: z.string().max(50).optional().nullable(),
});

export type ConsentRow = z.infer<typeof ConsentRowSchema>;
