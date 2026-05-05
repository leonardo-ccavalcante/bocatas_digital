import { z } from "zod";

// ─── Input schemas (mirrors PersonCreateSchema from client) ───────────────────
// We re-define here to keep server code independent of client Vite aliases.

export const TipoDocumentoEnum = z.enum(["DNI", "NIE", "Pasaporte", "Documento_Extranjero", "Sin_Documentacion"]);
export const GeneroEnum = z.enum(["masculino", "femenino", "no_binario", "prefiere_no_decir"]);
export const IdiomaEnum = z.enum(["es", "ar", "fr", "bm", "en", "ro", "zh", "wo", "other"]);
export const SituacionLegalEnum = z.enum(["regular", "irregular", "solicitante_asilo", "en_tramite", "sin_papeles"]);
export const TipoViviendaEnum = z.enum(["calle", "albergue", "piso_compartido_alquiler", "piso_propio_alquiler", "piso_propio_propiedad", "ocupacion_sin_titulo", "pension", "asentamiento", "centro_acogida", "otros"]);
export const EstabilidadHabitacionalEnum = z.enum(["sin_hogar", "inestable", "temporal", "estable"]);
export const NivelEstudiosEnum = z.enum(["sin_estudios", "primaria", "secundaria", "bachillerato", "formacion_profesional", "universitario", "postgrado"]);
export const SituacionLaboralEnum = z.enum(["desempleado", "economia_informal", "empleo_temporal", "empleo_indefinido", "autonomo", "en_formacion", "jubilado", "incapacidad_permanente", "sin_permiso_trabajo"]);
export const NivelIngresosEnum = z.enum(["sin_ingresos", "menos_500", "entre_500_1000", "entre_1000_1500", "mas_1500"]);
export const CanalLlegadaEnum = z.enum(["boca_a_boca", "cruz_roja", "servicios_sociales", "otra_ong", "internet", "presencial_directo", "whatsapp", "telefono", "email", "instagram", "retorno_bocatas", "otros"]);
export const FaseItinerarioEnum = z.enum(["acogida", "estabilizacion", "formacion", "insercion_laboral", "autonomia"]);

// Extended return type to include validation warnings
export interface PersonCreateResult {
  id: string;
  nombre: string;
  apellidos: string;
  validation_warnings?: string[];
}

export const PersonCreateInput = z.object({
  canal_llegada: CanalLlegadaEnum,
  entidad_derivadora: z.string().max(200).optional().nullable(),
  persona_referencia: z.string().max(200).optional().nullable(),
  nombre: z.string().min(1).max(100),
  apellidos: z.string().min(1).max(150),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  genero: GeneroEnum.optional().nullable(),
  pais_origen: z.string().length(2).optional().nullable(), // ISO 3166-1 alpha-2
  idioma_principal: IdiomaEnum,
  idiomas: z.array(IdiomaEnum).optional().nullable(),
  tipo_documento: TipoDocumentoEnum.optional().nullable(),
  numero_documento: z.string().max(30).optional().nullable(),
  pais_documento: z.string().length(2).optional().nullable(), // Country of document origin (ISO 3166-1 alpha-2)
  situacion_legal: SituacionLegalEnum.optional().nullable(),
  fecha_llegada_espana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  telefono: z.string().max(30).optional().nullable(),
  email: z.string().email().max(254).optional().nullable().or(z.literal("")),
  direccion: z.string().max(300).optional().nullable(),
  municipio: z.string().max(100).optional().nullable(),
  barrio_zona: z.string().max(100).optional().nullable(),
  tipo_vivienda: TipoViviendaEnum.optional().nullable(),
  estabilidad_habitacional: EstabilidadHabitacionalEnum.optional().nullable(),
  empadronado: z.boolean().optional().nullable(),
  nivel_estudios: NivelEstudiosEnum.optional().nullable(),
  situacion_laboral: SituacionLaboralEnum.optional().nullable(),
  nivel_ingresos: NivelIngresosEnum.optional().nullable(),
  recorrido_migratorio: z.string().max(2000).optional().nullable(),
  necesidades_principales: z.string().max(2000).optional().nullable(),
  restricciones_alimentarias: z.string().max(500).optional().nullable(),
  observaciones: z.string().max(2000).optional().nullable(),
  notas_privadas: z.string().max(2000).optional().nullable(),
  foto_perfil_url: z.string().url().optional().nullable(),
  foto_documento_url: z.string().url().optional().nullable(),
  fase_itinerario: FaseItinerarioEnum.optional(),
  program_ids: z.array(z.string().uuid()),
});

export const uuidLike = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID format"
);
