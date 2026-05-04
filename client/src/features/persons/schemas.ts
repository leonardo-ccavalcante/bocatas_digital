import { z } from "zod";

// ─── Enum Schemas — exact DB enum values (from pg_enum introspection) ─────────

export const GeneroSchema = z.enum([
  "masculino", "femenino", "no_binario", "prefiere_no_decir"
]);

export const IdiomaSchema = z.enum([
  "es", "ar", "fr", "bm", "en", "ro", "zh", "wo", "other"
]);

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

// ─── Person Create Schema — aligned to DB column names ────────────────────────
// DB columns: nombre, apellidos, fecha_nacimiento, genero, pais_origen,
//   idioma_principal, idiomas (array), telefono, email, direccion, municipio,
//   barrio_zona, tipo_documento, numero_documento, situacion_legal (text!),
//   fecha_llegada_espana, tipo_vivienda, estabilidad_habitacional, empadronado,
//   nivel_estudios, situacion_laboral, nivel_ingresos, persona_referencia,
//   canal_llegada, entidad_derivadora, es_retorno, motivo_retorno,
//   recorrido_migratorio, necesidades_principales, observaciones, notas_privadas,
//   fase_itinerario, estado_empleo, empresa_empleo, alertas_activas,
//   foto_documento_url, foto_perfil_url, restricciones_alimentarias

export const PersonCreateSchema = z.object({
  // Step 0 — Canal de llegada
  canal_llegada: CanalLlegadaSchema,
  entidad_derivadora: z.string().max(200).optional().nullable(),
  persona_referencia: z.string().max(200).optional().nullable(),

  // Section 1 — Identidad
  nombre: z.string().min(1, "El nombre es obligatorio").max(100),
  apellidos: z.string().min(1, "Los apellidos son obligatorios").max(150),
  fecha_nacimiento: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: AAAA-MM-DD")
    .refine((val) => {
      const d = new Date(val);
      return !isNaN(d.getTime()) && d <= new Date();
    }, "La fecha no puede ser futura")
    .refine((val) => {
      const d = new Date(val);
      const minAge = new Date();
      minAge.setFullYear(minAge.getFullYear() - 5);
      return d <= minAge;
    }, "La persona debe tener al menos 5 años"),
  genero: GeneroSchema.optional().nullable(),
  pais_origen: z.string().length(2).optional().nullable(), // ISO 3166-1 alpha-2
  idioma_principal: IdiomaSchema,
  idiomas: z.array(IdiomaSchema).optional().nullable(), // DB column name: idiomas

  // Section 2 — Documento
  tipo_documento: TipoDocumentoSchema.optional().nullable(),
  numero_documento: z.string().max(30).optional().nullable(),
  pais_documento: PaisDocumentoSchema, // Country of document origin (ISO 3166-1 alpha-2)
  situacion_legal: SituacionLegalSchema.optional().nullable(), // stored as text in DB
  fecha_llegada_espana: z.string().transform(v => v === "" ? null : v).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()).optional().nullable(),

  // Section 3 — Contacto
  telefono: z.string().max(30).optional().nullable(),
  email: z.string().email("Email inválido").max(254).optional().nullable().or(z.literal("")),
  direccion: z.string().max(300).optional().nullable(),
  municipio: z.string().max(100).optional().nullable(),
  barrio_zona: z.string().max(100).optional().nullable(),

  // Section 4 — Situación
  tipo_vivienda: TipoViviendaSchema.optional().nullable(),
  estabilidad_habitacional: EstabilidadHabitacionalSchema.optional().nullable(),
  empadronado: z.boolean().optional().nullable(),
  nivel_estudios: NivelEstudiosSchema.optional().nullable(),
  situacion_laboral: SituacionLaboralSchema.optional().nullable(),
  nivel_ingresos: NivelIngresosSchema.optional().nullable(),

  // Section 5 — Info social
  recorrido_migratorio: z.string().max(2000).optional().nullable(),
  necesidades_principales: z.string().max(2000).optional().nullable(),
  restricciones_alimentarias: z.string().max(500).optional().nullable(),
  observaciones: z.string().max(2000).optional().nullable(),
  notas_privadas: z.string().max(2000).optional().nullable(),

  // Section 6 — Foto perfil (handled via upload)
  foto_perfil_url: z.string().url().optional().nullable(),
  foto_documento_url: z.string().url().optional().nullable(),

  // Metadata
  fase_itinerario: FaseItinerarioSchema.optional(), // has DB default "acogida"

  // Program enrollment IDs (UUIDs from programs table — not a DB column)
  // No default here — default is set in useForm defaultValues to keep input/output types consistent
  program_ids: z.array(z.string().uuid()),
});

export type PersonCreate = z.infer<typeof PersonCreateSchema>;
export type PersonCreateInput = PersonCreate; // alias

// PersonCreateSchema contains .refine() calls on fecha_nacimiento, so we cannot use .extend().
// Instead we compose a new schema that merges the partial fields with the required id.
export const PersonUpdateSchema = z.object({
  id: z.string().uuid(),
}).and(PersonCreateSchema.partial());
export type PersonUpdateInput = z.infer<typeof PersonUpdateSchema>;

// ─── Section-level schemas for step-by-step validation ───────────────────────

export const Step0Schema = PersonCreateSchema.pick({
  canal_llegada: true,
  entidad_derivadora: true,
  persona_referencia: true,
});

export const Section1Schema = PersonCreateSchema.pick({
  nombre: true,
  apellidos: true,
  fecha_nacimiento: true,
  genero: true,
  pais_origen: true,
  idioma_principal: true,
});

export const Section2Schema = PersonCreateSchema.pick({
  tipo_documento: true,
  numero_documento: true,
  situacion_legal: true,
  fecha_llegada_espana: true,
});

export const Section3Schema = PersonCreateSchema.pick({
  telefono: true,
  email: true,
  direccion: true,
  municipio: true,
  barrio_zona: true,
});

export const Section4Schema = PersonCreateSchema.pick({
  tipo_vivienda: true,
  estabilidad_habitacional: true,
  nivel_estudios: true,
  situacion_laboral: true,
  nivel_ingresos: true,
});

export const Section5Schema = PersonCreateSchema.pick({
  recorrido_migratorio: true,
  necesidades_principales: true,
  restricciones_alimentarias: true,
  observaciones: true,
  program_ids: true,
});

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

// ─── Label maps for UI ────────────────────────────────────────────────────────

export const CANAL_LLEGADA_LABELS: Record<string, string> = {
  boca_a_boca: "Boca a boca",
  cruz_roja: "Cruz Roja",
  servicios_sociales: "Servicios Sociales",
  otra_ong: "Otra ONG",
  internet: "Internet",
  presencial_directo: "Llegada directa",
  whatsapp: "WhatsApp",
  telefono: "Teléfono",
  email: "Email",
  instagram: "Instagram",
  retorno_bocatas: "Retorno Bocatas",
  otros: "Otros",
};

export const TIPO_VIVIENDA_LABELS: Record<string, { label: string; icon: string }> = {
  calle: { label: "Calle / Sin techo", icon: "⛺" },
  albergue: { label: "Albergue", icon: "🏕️" },
  piso_compartido_alquiler: { label: "Piso compartido (alquiler)", icon: "🏠" },
  piso_propio_alquiler: { label: "Piso propio (alquiler)", icon: "🏠" },
  piso_propio_propiedad: { label: "Piso propio (propiedad)", icon: "🏡" },
  ocupacion_sin_titulo: { label: "Ocupación sin título", icon: "🔑" },
  pension: { label: "Pensión", icon: "🏨" },
  asentamiento: { label: "Asentamiento", icon: "⛺" },
  centro_acogida: { label: "Centro de acogida", icon: "🏢" },
  otros: { label: "Otros", icon: "❓" },
};

export const GENERO_LABELS: Record<string, string> = {
  masculino: "Masculino",
  femenino: "Femenino",
  no_binario: "No binario",
  prefiere_no_decir: "Prefiere no decir",
};

export const IDIOMA_LABELS: Record<string, string> = {
  es: "Español",
  ar: "Árabe",
  fr: "Francés",
  bm: "Bambara",
  en: "Inglés",
  ro: "Rumano",
  zh: "Chino",
  wo: "Wolof",
  other: "Otro",
};

export const TIPO_DOCUMENTO_LABELS: Record<string, string> = {
  DNI: "DNI",
  NIE: "NIE",
  Pasaporte: "Pasaporte",
  Documento_Extranjero: "Documento Extranjero",
  Sin_Documentacion: "Sin documentación",
};

export const SITUACION_LEGAL_LABELS: Record<string, string> = {
  regular: "Regular",
  irregular: "Irregular",
  solicitante_asilo: "Solicitante de asilo",
  en_tramite: "En trámite",
  sin_papeles: "Sin papeles",
};

export const NIVEL_ESTUDIOS_LABELS: Record<string, string> = {
  sin_estudios: "Sin estudios",
  primaria: "Primaria",
  secundaria: "Secundaria",
  bachillerato: "Bachillerato",
  formacion_profesional: "Formación Profesional",
  universitario: "Universitario",
  postgrado: "Postgrado",
};

export const SITUACION_LABORAL_LABELS: Record<string, string> = {
  desempleado: "Desempleado/a",
  economia_informal: "Economía informal",
  empleo_temporal: "Empleo temporal",
  empleo_indefinido: "Empleo indefinido",
  autonomo: "Autónomo/a",
  en_formacion: "En formación",
  jubilado: "Jubilado/a",
  incapacidad_permanente: "Incapacidad permanente",
  sin_permiso_trabajo: "Sin permiso de trabajo",
};

export const NIVEL_INGRESOS_LABELS: Record<string, string> = {
  sin_ingresos: "Sin ingresos",
  menos_500: "Menos de 500€",
  entre_500_1000: "500 – 1.000€",
  entre_1000_1500: "1.000 – 1.500€",
  mas_1500: "Más de 1.500€",
};

export const FASE_ITINERARIO_CONFIG: Record<string, { label: string; color: string }> = {
  acogida: { label: "Acogida", color: "bg-gray-200 text-gray-700" },
  estabilizacion: { label: "Estabilización", color: "bg-blue-100 text-blue-700" },
  formacion: { label: "Formación", color: "bg-yellow-100 text-yellow-700" },
  insercion_laboral: { label: "Inserción laboral", color: "bg-orange-100 text-orange-700" },
  autonomia: { label: "Autonomía", color: "bg-green-100 text-green-700" },
};

// Fallback programs if DB is unreachable
export const PROGRAMS_SEED_FALLBACK: Program[] = [
  { id: "00000000-0000-0000-0000-000000000001", slug: "comedor-social", name: "Comedor Social", icon: "🍽️", is_default: true, is_active: true, display_order: 1 },
  { id: "00000000-0000-0000-0000-000000000002", slug: "programa-familias", name: "Programa Familias", icon: "📦", is_default: false, is_active: true, display_order: 2 },
  { id: "00000000-0000-0000-0000-000000000003", slug: "formacion", name: "Formación", icon: "📚", is_default: false, is_active: true, display_order: 3 },
  { id: "00000000-0000-0000-0000-000000000004", slug: "atencion-juridica", name: "Atención Jurídica", icon: "⚖️", is_default: false, is_active: true, display_order: 4 },
  { id: "00000000-0000-0000-0000-000000000005", slug: "voluntariado", name: "Voluntariado", icon: "🤝", is_default: false, is_active: true, display_order: 5 },
  { id: "00000000-0000-0000-0000-000000000006", slug: "acompanamiento", name: "Acompañamiento", icon: "🫂", is_default: false, is_active: true, display_order: 6 },
];

// ─── Country labels: ISO 3166-1 alpha-2 → display name (Spanish) ─────────────
// Ordered by frequency in Bocatas Digital user base
export const PAIS_LABELS: Record<string, string> = {
  ES: "España",
  MA: "Marruecos",
  SN: "Senegal",
  ML: "Mali",
  GN: "Guinea",
  GW: "Guinea-Bisáu",
  GM: "Gambia",
  NG: "Nigeria",
  GH: "Ghana",
  CM: "Camerún",
  CI: "Costa de Marfil",
  BF: "Burkina Faso",
  NE: "Níger",
  TG: "Togo",
  BJ: "Benín",
  CD: "Congo (RDC)",
  CG: "Congo",
  GA: "Gabón",
  MR: "Mauritania",
  DZ: "Argelia",
  TN: "Túnez",
  LY: "Libia",
  EG: "Egipto",
  SD: "Sudán",
  ET: "Etiopía",
  SO: "Somalia",
  ER: "Eritrea",
  PK: "Pakistán",
  BD: "Bangladés",
  IN: "India",
  CN: "China",
  PH: "Filipinas",
  RO: "Rumanía",
  UA: "Ucrania",
  RU: "Rusia",
  SY: "Siria",
  IQ: "Irak",
  AF: "Afganistán",
  CO: "Colombia",
  VE: "Venezuela",
  EC: "Ecuador",
  PE: "Perú",
  BO: "Bolivia",
  HN: "Honduras",
  GT: "Guatemala",
  SV: "El Salvador",
  DO: "República Dominicana",
  CU: "Cuba",
  BR: "Brasil",
  MX: "México",
  PT: "Portugal",
  FR: "Francia",
  IT: "Italia",
  DE: "Alemania",
  GB: "Reino Unido",
};

// ISO 3166-1 alpha-2 country codes for document origin
export const PAIS_DOCUMENTO_LABELS: Record<string, string> = {
  ES: "Espana",
  FR: "Francia",
  DE: "Alemania",
  IT: "Italia",
  PT: "Portugal",
  RO: "Rumania",
  BG: "Bulgaria",
  PL: "Polonia",
  UA: "Ucrania",
  MA: "Marruecos",
  SN: "Senegal",
  ML: "Mali",
  GH: "Ghana",
  NG: "Nigeria",
  CD: "Republica Democratica del Congo",
  CI: "Costa de Marfil",
  CM: "Camerun",
  GB: "Reino Unido",
  NL: "Paises Bajos",
  BE: "Belgica",
  CH: "Suiza",
  AT: "Austria",
  CZ: "Republica Checa",
  HU: "Hungria",
  GR: "Grecia",
  TR: "Turquia",
  SY: "Siria",
  AF: "Afganistan",
  PK: "Pakistan",
  IN: "India",
  BD: "Bangladesh",
  VN: "Vietnam",
  CN: "China",
  MX: "Mexico",
  CO: "Colombia",
  PE: "Peru",
  BO: "Bolivia",
  EC: "Ecuador",
  AR: "Argentina",
  CL: "Chile",
  PY: "Paraguay",
  UY: "Uruguay",
};
