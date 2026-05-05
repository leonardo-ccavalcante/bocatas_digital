import { z } from "zod";
import {
  CanalLlegadaSchema,
  GeneroSchema,
  IdiomaSchema,
  TipoDocumentoSchema,
  PaisDocumentoSchema,
  SituacionLegalSchema,
  TipoViviendaSchema,
  EstabilidadHabitacionalSchema,
  NivelEstudiosSchema,
  SituacionLaboralSchema,
  NivelIngresosSchema,
  FaseItinerarioSchema,
} from "./enums";

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
