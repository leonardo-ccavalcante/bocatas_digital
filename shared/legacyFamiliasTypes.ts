import { z } from "zod";

// Single source of truth for the legacy FAMILIAS CSV importer.
// Mirrors the Supabase enums verbatim (see client/src/lib/database.types.ts).
//
// Three layers:
//   1. LegacyRow      — raw row as parsed from CSV (all strings, all optional)
//   2. CleanRow       — after mapping (typed, enum-valid, may carry warnings)
//   3. FamilyGroup /
//      Preview / Confirm response — server contract

// ─── DB enum mirrors ────────────────────────────────────────────────────────

export const generoEnum = z.enum([
  "masculino",
  "femenino",
  "no_binario",
  "prefiere_no_decir",
]);

export const tipoDocumentoEnum = z.enum([
  "DNI",
  "NIE",
  "Pasaporte",
  "Sin_Documentacion",
  "Documento_Extranjero",
]);

export const nivelEstudiosEnum = z.enum([
  "sin_estudios",
  "primaria",
  "secundaria",
  "bachillerato",
  "formacion_profesional",
  "universitario",
  "postgrado",
]);

export const situacionLaboralEnum = z.enum([
  "desempleado",
  "economia_informal",
  "empleo_temporal",
  "empleo_indefinido",
  "autonomo",
  "en_formacion",
  "jubilado",
  "incapacidad_permanente",
  "sin_permiso_trabajo",
]);

export const relacionEnum = z.enum([
  "parent",
  "child",
  "sibling",
  "other",
  "esposo_a",
  "hijo_a",
  "madre",
  "padre",
  "suegro_a",
  "hermano_a",
  "abuelo_a",
  "otro",
]);

// ─── Layer 1: raw CSV row ───────────────────────────────────────────────────

export const LegacyRowSchema = z.object({
  numero_orden: z.string().optional(),
  numero_familia: z.string().optional(),
  fecha_alta: z.string().optional(),
  nombre: z.string().optional(),
  apellidos: z.string().optional(),
  sexo: z.string().optional(),
  telefono: z.string().optional(),
  documento: z.string().optional(),
  cabeza_familia: z.string().optional(),
  estado: z.string().optional(),
  pais: z.string().optional(),
  fecha_nacimiento: z.string().optional(),
  email: z.string().optional(),
  direccion: z.string().optional(),
  codigo_postal: z.string().optional(),
  localidad: z.string().optional(),
  notas_informe_social: z.string().optional(),
  nivel_estudios: z.string().optional(),
  situacion_laboral: z.string().optional(),
  otras_caracteristicas: z.string().optional(),
});
export type LegacyRow = z.infer<typeof LegacyRowSchema>;

// ─── Mapping warnings ──────────────────────────────────────────────────────

export const warningCodeEnum = z.enum([
  "parentesco_coerced",
  "estudios_unknown",
  "laboral_unknown",
  "country_unknown",
  "date_ambiguous",
  "date_invalid",
  "dni_unparseable",
  "sexo_unknown",
  "colectivo_unknown",
  "estado_unknown",
  "cp_invalid",
]);

export const RowWarningSchema = z.object({
  field: z.string(),
  code: warningCodeEnum,
  message: z.string(),
});
export type RowWarning = z.infer<typeof RowWarningSchema>;

// ─── Layer 2: clean (typed) row ────────────────────────────────────────────

export const CleanPersonSchema = z.object({
  nombre: z.string().min(1).max(100),
  apellidos: z.string().min(1).max(200),
  fecha_nacimiento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  genero: generoEnum.nullable(),
  pais_origen: z.string().length(2).nullable(),
  telefono: z.string().nullable(),
  email: z.string().email().nullable(),
  direccion: z.string().nullable(),
  municipio: z.string().nullable(),
  tipo_documento: tipoDocumentoEnum.nullable(),
  numero_documento: z.string().nullable(),
  nivel_estudios: nivelEstudiosEnum.nullable(),
  situacion_laboral: situacionLaboralEnum.nullable(),
  observaciones: z.string().nullable(),
  // Validated 5-digit CP (parseCodigoPostal). Mirrors persons.codigo_postal
  // CHECK ^\d{5}$; distrito is trigger-derived from it. The raw cell still
  // lives in metadata.codigo_postal for provenance.
  codigo_postal: z
    .string()
    .regex(/^\d{5}$/)
    .nullable(),
  metadata: z
    .object({
      colectivos: z.array(z.string()).default([]),
      codigo_postal: z.string().optional(),
      legacy_orden: z.string().optional(),
      legacy_row: z.number(),
      parentesco_original: z.string().optional(),
    })
    .passthrough(),
});
export type CleanPerson = z.infer<typeof CleanPersonSchema>;

export const CleanRowSchema = z.object({
  row_number: z.number().int().positive(),
  legacy_numero_familia: z.string().min(1),
  legacy_numero_orden: z.string().optional(),
  is_titular: z.boolean(),
  parentesco_original: z.string().nullable(),
  fecha_alta: z.string().nullable(),
  // ACTIVA/BAJA — row-level; the titular row's estado drives families.estado.
  estado: z.enum(["activa", "baja"]).nullable(),
  person: CleanPersonSchema,
  relacion_db: relacionEnum,
  warnings: z.array(RowWarningSchema),
});
export type CleanRow = z.infer<typeof CleanRowSchema>;

// ─── Row-level error (parse failure) ───────────────────────────────────────

export const RowErrorSchema = z.object({
  row_number: z.number().int().positive(),
  field: z.string(),
  message: z.string(),
});
export type RowError = z.infer<typeof RowErrorSchema>;

// ─── Group-level (per-family) ──────────────────────────────────────────────

// Dedup hit returned to the client / stashed in bulk_import_previews.
// Intentionally NOT including any document fragment (was: existing_documento_last4)
// — last-4 of a national ID combined with name + country re-identifies a
// specific beneficiary, which is unnecessary for the operator's job
// (recognising "this person already exists") and increases PII exposure
// inside admin-readable preview rows.
export const PersonDedupHitSchema = z.object({
  row_index: z.number().int().nonnegative(),
  existing_person_id: z.string().uuid(),
  existing_pais_origen: z.string().nullable(),
});
export type PersonDedupHit = z.infer<typeof PersonDedupHitSchema>;

export const GroupErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
});
export type GroupError = z.infer<typeof GroupErrorSchema>;

export const FamilyGroupSchema = z.object({
  legacy_numero_familia: z.string(),
  rows: z.array(CleanRowSchema),
  titular_index: z.number().int().nonnegative(),
  family_already_imported: z.boolean(),
  errors: z.array(GroupErrorSchema),
  person_dedup_hits: z.array(PersonDedupHitSchema),
});
export type FamilyGroup = z.infer<typeof FamilyGroupSchema>;

// ─── Server contracts (Preview + Confirm) ──────────────────────────────────

export const PreviewResponseSchema = z.object({
  preview_token: z.string().uuid(),
  total_rows: z.number().int().nonnegative(),
  total_families: z.number().int().nonnegative(),
  valid_families: z.number().int().nonnegative(),
  warning_families: z.number().int().nonnegative(),
  error_families: z.number().int().nonnegative(),
  duplicate_families: z.number().int().nonnegative(),
  groups: z.array(FamilyGroupSchema),
  parse_errors: z.array(RowErrorSchema),
});
export type PreviewResponse = z.infer<typeof PreviewResponseSchema>;

export const ConfirmErrorSchema = z.object({
  legacy_numero_familia: z.string(),
  message: z.string(),
});

export const ConfirmResponseSchema = z.object({
  created_count: z.number().int().nonnegative(),
  skipped_count: z.number().int().nonnegative(),
  error_count: z.number().int().nonnegative(),
  // The SQL function returns this as 'error_details' (array of per-family errors)
  error_details: z.array(ConfirmErrorSchema).default([]),
});
export type ConfirmResponse = z.infer<typeof ConfirmResponseSchema>;

// ─── Stash payload (what we put in bulk_import_previews.parsed_rows) ───────
//
// The DB-side function reads `groups[]` only; the parse-error list is for the
// client preview UI and isn't needed by the RPC. We persist groups only.

export const StashPayloadSchema = z.object({
  groups: z.array(FamilyGroupSchema),
  src_filename: z.string().nullable(),
});
export type StashPayload = z.infer<typeof StashPayloadSchema>;

// ─── INFORMES SOCIALES enrich contract (wide sheet → enrich existing families) ─
//
// INFORMES is 1 row per family (wide): titular + narrative (situación familiar +
// necesidades) + denormalized member slots 2..14. It ENRICHES families the
// roster already created (joined by legacy_numero), backfill-only.

export const InformesMemberSchema = z.object({
  slot: z.number().int().min(2).max(14),
  nombre: z.string(),
  apellidos: z.string().nullable(),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  relacion_db: relacionEnum,
  parentesco_original: z.string().nullable(),
  tipo_documento: tipoDocumentoEnum.nullable(),
  numero_documento: z.string().nullable(),
  warnings: z.array(RowWarningSchema),
});
export type InformesMember = z.infer<typeof InformesMemberSchema>;

export const InformesTitularSchema = z.object({
  nombre: z.string().nullable(),
  apellidos: z.string().nullable(),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  pais_origen: z.string().length(2).nullable(),
  telefono: z.string().nullable(),
  direccion: z.string().nullable(),
  municipio: z.string().nullable(),
  codigo_postal: z.string().regex(/^\d{5}$/).nullable(),
  tipo_documento: tipoDocumentoEnum.nullable(),
  numero_documento: z.string().nullable(),
  warnings: z.array(RowWarningSchema),
});
export type InformesTitular = z.infer<typeof InformesTitularSchema>;

// Family-scoped member match (2b). Maps an INFORMES member slot to an existing
// familia_miembros row; "ambiguous"/"none" ⇒ NOT written (refuse-on-ambiguity).
export const memberMatchTierEnum = z.enum([
  "documento",
  "probe_key",
  "name_first_apellido",
  "none",
  "ambiguous",
]);
export const MemberMatchSchema = z.object({
  slot: z.number().int(),
  matched_member_id: z.string().uuid().nullable(),
  matched_person_id: z.string().uuid().nullable(),
  match_tier: memberMatchTierEnum,
});
export type MemberMatch = z.infer<typeof MemberMatchSchema>;

export const InformesFamilySchema = z.object({
  legacy_numero_familia: z.string().min(1),
  titular: InformesTitularSchema,
  members: z.array(InformesMemberSchema),
  situacion_familiar_texto: z.string().nullable(),
  necesidades_texto: z.string().nullable(),
  // Resolved against the roster at preview time:
  family_id: z.string().uuid().nullable(), // null ⇒ family_missing (no enrich)
  titular_id: z.string().uuid().nullable(),
  member_matches: z.array(MemberMatchSchema), // 2b — family-scoped member alignment
  members_truncated: z.boolean(), // INFORMES caps at 14 slots
  warnings: z.array(RowWarningSchema),
});
export type InformesFamily = z.infer<typeof InformesFamilySchema>;

export const InformesStashPayloadSchema = z.object({
  kind: z.literal("informes_enrich_v1"),
  families: z.array(InformesFamilySchema),
  src_filename: z.string().nullable(),
});
export type InformesStashPayload = z.infer<typeof InformesStashPayloadSchema>;

export const InformesPreviewResponseSchema = z.object({
  preview_token: z.string().uuid(),
  total_rows: z.number().int().nonnegative(),
  total_families: z.number().int().nonnegative(),
  families_to_enrich: z.number().int().nonnegative(),
  family_missing: z.number().int().nonnegative(),
  warning_families: z.number().int().nonnegative(),
  families: z.array(InformesFamilySchema),
  parse_errors: z.array(RowErrorSchema),
});
export type InformesPreviewResponse = z.infer<typeof InformesPreviewResponseSchema>;

export const InformesConfirmResponseSchema = z.object({
  enriched_count: z.number().int().nonnegative(),
  skipped_missing_count: z.number().int().nonnegative(),
  error_count: z.number().int().nonnegative(),
  errors: z.array(ConfirmErrorSchema).default([]),
});
export type InformesConfirmResponse = z.infer<typeof InformesConfirmResponseSchema>;
