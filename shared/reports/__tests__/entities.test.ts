/**
 * entities.test.ts — DX-T3 drift guard.
 *
 * Verifies that every field name in ENTITY_FIELDS exists in the corresponding
 * Database["public"]["Tables"][T]["Row"] type AND that the high-risk PII fields
 * are absent from every entity's allowlist.
 *
 * This test catches schema drift early: if a migration renames a column that
 * is in the ENTITY_FIELDS allowlist, the test fails and prompts an update.
 *
 * NOTE: This test operates on the generated TypeScript types at import time —
 * it is a type-level drift guard that runs at unit-test time. The DB types
 * must be regenerated with `supabase gen types typescript` before this catches
 * new drift.
 */

import { describe, it, expect } from "vitest";

import {
  ENTITY_FIELDS,
  ENTITY_TO_TABLE,
  HIGH_RISK_PII_FIELDS,
  QUASI_IDENTIFIER_FIELDS,
  isQuasiIdentifier,
} from "../entities";

// Build sets by listing string column names. Column names are enumerated
// explicitly so any rename in the DB schema is immediately visible as a test failure.
function cols(...names: string[]): Set<string> {
  return new Set(names);
}

const TABLE_COLUMNS: Record<string, Set<string>> = {
  families: cols(
    "id",
    "estado",
    "familia_numero",
    "titular_id",
    "num_adultos",
    "num_menores_18",
    "num_miembros",
    "distrito",
    "codigo_postal",
    "alta_en_guf",
    "informe_social",
    "informe_social_fecha",
    "padron_recibido",
    "padron_recibido_fecha",
    "consent_bocatas",
    "consent_banco_alimentos",
    "docs_identidad",
    "autorizado",
    "autorizado_documento_url",
    "persona_recoge",
    "fecha_alta",
    "fecha_baja",
    "motivo_baja",
    "guf_cutoff_day",
    "guf_verified_at",
    "fecha_alta_guf",
    "fecha_baja_guf",
    "sin_guf",
    "sin_informe_social",
    "justificante_recibido",
    "legacy_numero",
    "metadata",
    "created_at",
    "updated_at",
    "deleted_at",
  ),
  persons: cols(
    "id",
    "nombre",
    "apellidos",
    "genero",
    "fecha_nacimiento",
    "telefono",
    "email",
    "idioma_principal",
    "idiomas",
    "pais_origen",
    "pais_documento",
    "tipo_documento",
    "numero_documento",
    "foto_documento_url",
    "foto_perfil_url",
    "situacion_legal",
    "recorrido_migratorio",
    "fase_itinerario",
    "canal_llegada",
    "entidad_derivadora",
    "empadronado",
    "direccion",
    "distrito",
    "codigo_postal",
    "barrio_zona",
    "municipio",
    "nivel_estudios",
    "nivel_ingresos",
    "situacion_laboral",
    "estado_empleo",
    "empresa_empleo",
    "estabilidad_habitacional",
    "tipo_vivienda",
    "es_retorno",
    "motivo_retorno",
    "fecha_llegada_espana",
    "persona_referencia",
    "necesidades_principales",
    "restricciones_alimentarias",
    "observaciones",
    "notas_privadas",
    "alertas_activas",
    "metadata",
    "role",
    "created_at",
    "updated_at",
    "deleted_at",
  ),
  familia_miembros: cols(
    "id",
    "familia_id",
    "nombre",
    "apellidos",
    "relacion",
    "rol",
    "fecha_nacimiento",
    "documento",
    "person_id",
    "estado",
    "created_at",
    "updated_at",
    "deleted_at",
  ),
  family_member_documents: cols(
    "id",
    "family_id",
    "member_id",
    "member_index",
    "member_person_id",
    "documento_tipo",
    "documento_url",
    "fecha_upload",
    "is_current",
    "tipo_id",
    "verified_by",
    "created_at",
    "deleted_at",
  ),
  deliveries: cols(
    "id",
    "family_id",
    "session_id",
    "grant_id",
    "fecha_entrega",
    "es_autorizado",
    "recogido_por",
    "recogido_por_documento_url",
    "registrado_por",
    "firma_url",
    "kg_total",
    "kg_carne",
    "kg_frutas_hortalizas",
    "kg_infantil",
    "kg_otros",
    "unidades_no_alimenticias",
    "notas",
    "metadata",
    "created_at",
    "updated_at",
    "deleted_at",
  ),
};

// ─── DX-T3: drift guard tests ─────────────────────────────────────────────

describe("entities.ts drift guard (DX-T3)", () => {
  it("ENTITY_TO_TABLE values are all known table names in TABLE_COLUMNS", () => {
    for (const [entity, tableName] of Object.entries(ENTITY_TO_TABLE)) {
      expect(
        TABLE_COLUMNS[tableName],
        `ENTITY_TO_TABLE["${entity}"] = "${tableName}" — not found in TABLE_COLUMNS`,
      ).toBeDefined();
    }
  });

  for (const entity of Object.keys(ENTITY_FIELDS) as (keyof typeof ENTITY_FIELDS)[]) {
    const tableName = ENTITY_TO_TABLE[entity];

    describe(`entity: ${entity} (table: ${tableName})`, () => {
      it("every field in ENTITY_FIELDS exists in the DB table row", () => {
        const cols = TABLE_COLUMNS[tableName];
        for (const fieldDef of ENTITY_FIELDS[entity]) {
          // 'id' is present on all tables — shortcut to avoid verbosity.
          if (fieldDef.name === "id") continue;
          expect(
            cols.has(fieldDef.name),
            `Field "${fieldDef.name}" is in ENTITY_FIELDS["${entity}"] but NOT in the "${tableName}" table row type. ` +
              `Run "supabase gen types typescript" and update ENTITY_FIELDS if the column was renamed.`,
          ).toBe(true);
        }
      });
    });
  }

  // ─── High-risk PII guard ────────────────────────────────────────────────

  describe("high-risk PII fields are absent from ALL entity allowlists", () => {
    for (const entity of Object.keys(ENTITY_FIELDS) as (keyof typeof ENTITY_FIELDS)[]) {
      for (const piiField of HIGH_RISK_PII_FIELDS) {
        it(`${entity}: '${piiField}' is NOT in ENTITY_FIELDS`, () => {
          const has = ENTITY_FIELDS[entity].some((f) => f.name === piiField);
          expect(
            has,
            `HIGH-RISK PII VIOLATION: '${piiField}' found in ENTITY_FIELDS["${entity}"]! ` +
              `Remove it immediately — CLAUDE.md §3 Compliance.`,
          ).toBe(false);
        });
      }
    }
  });

  // ─── Quasi-identifier set (CAS-05 / themis BLOCKER 3) ────────────────────

  describe("QUASI_IDENTIFIER_FIELDS — forced-floor dimensions", () => {
    it("matches the agreed demographic/geographic quasi-identifier set", () => {
      expect([...QUASI_IDENTIFIER_FIELDS].sort()).toEqual(
        ["canal_llegada", "distrito", "fase_itinerario", "genero", "idioma_principal", "pais_origen"],
      );
    });

    it("every quasi-identifier is a GROUPABLE field somewhere in the allowlist", () => {
      // The forced floor only fires on groupBy, so each QI must be groupable —
      // otherwise the set has drifted from the allowlist it is meant to cover.
      const groupable = new Set<string>();
      for (const fields of Object.values(ENTITY_FIELDS)) {
        for (const f of fields) if (f.groupable) groupable.add(f.name);
      }
      for (const qi of QUASI_IDENTIFIER_FIELDS) {
        expect(groupable.has(qi), `'${qi}' must be a groupable allowlist field`).toBe(true);
      }
    });

    it("isQuasiIdentifier discriminates QI from non-identifying groupable flags", () => {
      expect(isQuasiIdentifier("distrito")).toBe(true);
      expect(isQuasiIdentifier("pais_origen")).toBe(true);
      // Operational flags are groupable but NOT quasi-identifiers.
      expect(isQuasiIdentifier("alta_en_guf")).toBe(false);
      expect(isQuasiIdentifier("is_current")).toBe(false);
      expect(isQuasiIdentifier("unknown_field")).toBe(false);
    });
  });
});
