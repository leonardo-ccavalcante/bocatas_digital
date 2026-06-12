/**
 * shared/reports/entities.ts — ENTITY_FIELDS allowlist and ENTITY_TO_TABLE map.
 *
 * Compliance (CLAUDE.md §3 + DX-T3): ENTITY_FIELDS.persons MUST NOT include
 * situacion_legal, foto_documento_url, recorrido_migratorio (high-risk PII).
 * entities.test.ts (DX-T3) verifies field names exist in the DB Row types.
 */

export const REPORT_ENTITIES = [
  "families",
  "persons",
  "miembros",
  "documents",
  "deliveries",
] as const;

export type ReportEntity = (typeof REPORT_ENTITIES)[number];

export interface FieldDef {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "enum";
  enumValues?: readonly string[];
  filterable: boolean;
  groupable: boolean;
  aggregable: false | readonly ("count" | "sum" | "avg" | "min" | "max")[];
}

/**
 * Allowlisted fields per entity. These are the ONLY fields that can appear in
 * filters, groupBy, aggregate, and orderBy in a SavedQuerySpec.
 *
 * HIGH-RISK PII EXCLUSIONS (non-negotiable):
 *   persons: situacion_legal, foto_documento_url, recorrido_migratorio are ABSENT.
 *   These fields are RLS-restricted at the DB layer; the allowlist provides a
 *   defense-in-depth application-layer guarantee.
 */
export const ENTITY_FIELDS: Readonly<Record<ReportEntity, readonly FieldDef[]>> =
  Object.freeze({
    families: [
      {
        name: "estado",
        label: "Estado",
        type: "enum",
        enumValues: ["activa", "baja"],
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "distrito",
        label: "Distrito",
        type: "string",
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "alta_en_guf",
        label: "Alta GUF",
        type: "boolean",
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "informe_social",
        label: "Informe social",
        type: "boolean",
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "padron_recibido",
        label: "Padrón recibido",
        type: "boolean",
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "num_adultos",
        label: "Núm. adultos",
        type: "number",
        filterable: true,
        groupable: false,
        aggregable: ["count", "sum", "avg", "min", "max"],
      },
      {
        name: "num_menores_18",
        label: "Núm. menores",
        type: "number",
        filterable: true,
        groupable: false,
        aggregable: ["count", "sum", "avg", "min", "max"],
      },
      {
        name: "created_at",
        label: "Fecha de alta",
        type: "date",
        filterable: true,
        groupable: false,
        aggregable: ["count", "min", "max"],
      },
      {
        name: "id",
        label: "ID",
        type: "string",
        filterable: false,
        groupable: false,
        aggregable: ["count"],
      },
    ],

    // HIGH-RISK PII NOTE: situacion_legal, foto_documento_url, recorrido_migratorio
    // are intentionally absent from this list (CLAUDE.md §3 Compliance).
    persons: [
      {
        name: "idioma_principal",
        label: "Idioma principal",
        type: "string",
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "pais_origen",
        label: "País de origen",
        type: "string",
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "fase_itinerario",
        label: "Fase itinerario",
        type: "enum",
        enumValues: ["0", "1", "2", "3", "4"],
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "canal_llegada",
        label: "Canal de llegada",
        type: "string",
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "genero",
        label: "Género",
        type: "string",
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "empadronado",
        label: "Empadronado",
        type: "boolean",
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "created_at",
        label: "Fecha de registro",
        type: "date",
        filterable: true,
        groupable: false,
        aggregable: ["count", "min", "max"],
      },
      {
        name: "id",
        label: "ID",
        type: "string",
        filterable: false,
        groupable: false,
        aggregable: ["count"],
      },
    ],

    miembros: [
      {
        name: "relacion",
        label: "Relación",
        type: "string",
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "id",
        label: "ID",
        type: "string",
        filterable: false,
        groupable: false,
        aggregable: ["count"],
      },
    ],

    documents: [
      {
        name: "documento_tipo",
        label: "Tipo de documento",
        type: "string",
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "is_current",
        label: "Vigente",
        type: "boolean",
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "created_at",
        label: "Subido",
        type: "date",
        filterable: true,
        groupable: false,
        aggregable: ["count"],
      },
      {
        name: "id",
        label: "ID",
        type: "string",
        filterable: false,
        groupable: false,
        aggregable: ["count"],
      },
    ],

    deliveries: [
      {
        name: "fecha_entrega",
        label: "Fecha",
        type: "date",
        filterable: true,
        groupable: true,
        aggregable: ["count"],
      },
      {
        name: "es_autorizado",
        label: "Autorizado",
        type: "boolean",
        filterable: true,
        groupable: true,
        aggregable: false,
      },
      {
        name: "kg_total",
        label: "Kg total",
        type: "number",
        filterable: true,
        groupable: false,
        aggregable: ["count", "sum", "avg", "min", "max"],
      },
      {
        name: "id",
        label: "ID",
        type: "string",
        filterable: false,
        groupable: false,
        aggregable: ["count"],
      },
    ],
  });

/**
 * Maps ReportEntity to the actual Supabase table name.
 * Keep in sync with Database["public"]["Tables"] keys.
 */
export const ENTITY_TO_TABLE: Readonly<Record<ReportEntity, string>> = Object.freeze({
  families: "families",
  persons: "persons",
  miembros: "familia_miembros",
  documents: "family_member_documents",
  deliveries: "deliveries",
});

/** The field names that are permanently banned from reports (high-risk PII). */
export const HIGH_RISK_PII_FIELDS = [
  "situacion_legal",
  "foto_documento_url",
  "recorrido_migratorio",
] as const;

/**
 * Quasi-identifiers (CAS-05 / themis BLOCKER 3): demographic/geographic groupable
 * dimensions whose small groups are re-identifying. When a customQuery groups by
 * ANY of these, the k-anonymity floor is FORCED server-side regardless of the
 * user's kAnonymize toggle (a sub-floor group over a quasi-identifier leaks an
 * individual). Non-identifying groupable flags (e.g. alta_en_guf, informe_social,
 * is_current, es_autorizado, relacion, documento_tipo, fecha_entrega) keep the
 * user-facing default (toggle governs them).
 *
 * Single source of truth — keep aligned with the groupable demographic fields in
 * ENTITY_FIELDS. quasi-identifiers.test.ts pins membership against the allowlist.
 */
export const QUASI_IDENTIFIER_FIELDS = [
  "distrito",
  "pais_origen",
  "genero",
  "idioma_principal",
  "fase_itinerario",
  "canal_llegada",
] as const;

export type QuasiIdentifierField = (typeof QUASI_IDENTIFIER_FIELDS)[number];

const QUASI_IDENTIFIER_SET: ReadonlySet<string> = new Set(QUASI_IDENTIFIER_FIELDS);

/** True when `fieldName` is a quasi-identifier (floor is forced when grouping by it). */
export function isQuasiIdentifier(fieldName: string): boolean {
  return QUASI_IDENTIFIER_SET.has(fieldName);
}

/** Helper: return true if a field name is in the ENTITY_FIELDS allowlist for the given entity. */
export function isFieldAllowed(entity: ReportEntity, fieldName: string): boolean {
  return ENTITY_FIELDS[entity].some((f) => f.name === fieldName);
}
