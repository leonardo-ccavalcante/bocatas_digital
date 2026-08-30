/**
 * upsert_legacy_person column-completeness gate (#148).
 *
 * upsert_legacy_person is the SOLE legacy-import writer for persons (AGENTS.md).
 * Its INSERT enumerates a fixed column list, and NOTHING failed when a new
 * persons column was added but not taught to it — so the column was silently
 * dropped on import. This is that missing gate, enforced at COMPILE TIME so it
 * runs on every PR via `pnpm check`:
 *
 *   INTENTIONALLY_NOT_IMPORTED is typed as an exhaustive Record over
 *   `keyof PersonsRow` minus the written columns. Add a persons column and the
 *   complement gains a key the object does not provide → tsc goes RED naming it.
 *   The fix is a deliberate choice: teach it to upsert_legacy_person (move it to
 *   WRITTEN_BY_UPSERT_LEGACY_PERSON, and update the migration) OR record here why
 *   the legacy CSV import intentionally skips it.
 *
 * WRITTEN mirrors the INSERT in supabase/migrations/
 * 20260708000003_import_colectivos_to_typed_column.sql (the current definition).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import type { Database } from "../../client/src/lib/database.types";

// The migration that currently defines upsert_legacy_person. If the function is
// ever redefined in a later migration, point this at that file.
const MIGRATION_FILE = join(
  process.cwd(),
  "supabase/migrations/20260708000003_import_colectivos_to_typed_column.sql"
);

/**
 * The column list the function's `INSERT INTO persons (...)` actually writes,
 * read from the migration SQL — so WRITTEN below is VERIFIED against the real
 * function rather than being a hand-maintained duplicate (the AGENTS.md rule is
 * about the SQL, not about a mirror of it).
 */
function columnsWrittenByMigration(): string[] {
  const sql = readFileSync(MIGRATION_FILE, "utf8");
  const m = sql.match(/INSERT\s+INTO\s+(?:public\.)?persons\s*\(([\s\S]*?)\)\s*VALUES/i);
  if (!m) throw new Error(`No 'INSERT INTO persons (...) VALUES' found in ${MIGRATION_FILE}`);
  return m[1]
    .split(",")
    .map((c) => c.replace(/--.*$/gm, "").trim())
    .filter(Boolean);
}

type PersonsRow = Database["public"]["Tables"]["persons"]["Row"];

const WRITTEN_BY_UPSERT_LEGACY_PERSON = [
  "nombre", "apellidos", "fecha_nacimiento", "genero", "pais_origen", "telefono",
  "email", "direccion", "municipio", "tipo_documento", "numero_documento",
  "nivel_estudios", "situacion_laboral", "observaciones", "codigo_postal",
  "canal_llegada", "idioma_principal", "colectivos", "metadata",
] as const satisfies readonly (keyof PersonsRow)[];

const INTENTIONALLY_NOT_IMPORTED: Record<
  Exclude<keyof PersonsRow, (typeof WRITTEN_BY_UPSERT_LEGACY_PERSON)[number]>,
  string
> = {
  id: "PK generada por la DB",
  created_at: "timestamp gestionado por la DB",
  updated_at: "timestamp gestionado por la DB",
  deleted_at: "soft-delete, no se fija en la importación",
  nombre_norm: "columna de búsqueda derivada de nombre",
  role: "rol de auth, no es un campo del CSV heredado",
  foto_perfil_url: "foto capturada en la app, no en el CSV heredado",
  foto_documento_url: "foto capturada en la app, no en el CSV heredado",
  restricciones_alimentarias: "se captura en el check-in, no en el CSV heredado",
  notas_privadas: "nota privada introducida en la app",
  alertas_activas: "estado derivado/gestionado por la app",
  // Campos tipados añadidos DESPUÉS de la importación heredada: no están en el
  // CSV fuente. Si alguno debe importarse, enséñaselo a upsert_legacy_person.
  barrio_zona: "no está en el CSV heredado",
  distrito: "no está en el CSV heredado",
  colectivo_otros: "no está en el CSV heredado",
  empadronado: "no está en el CSV heredado",
  empresa_empleo: "no está en el CSV heredado",
  entidad_derivadora: "no está en el CSV heredado",
  es_retorno: "no está en el CSV heredado",
  estabilidad_habitacional: "no está en el CSV heredado",
  estado_empleo: "no está en el CSV heredado",
  fase_itinerario: "no está en el CSV heredado",
  fecha_llegada_espana: "no está en el CSV heredado",
  idiomas: "no está en el CSV heredado",
  motivo_retorno: "no está en el CSV heredado",
  necesidades_principales: "no está en el CSV heredado",
  nivel_ingresos: "no está en el CSV heredado",
  pais_documento: "no está en el CSV heredado",
  persona_referencia: "no está en el CSV heredado",
  recorrido_migratorio: "no está en el CSV heredado (dato de alto riesgo)",
  situacion_ante_empleo: "no está en el CSV heredado",
  situacion_legal: "no está en el CSV heredado (dato de alto riesgo)",
  tipo_vivienda: "no está en el CSV heredado",
};

describe("upsert_legacy_person column completeness (#148)", () => {
  it("WRITTEN mirrors the real INSERT in the migration — catches SQL/list drift", () => {
    // If the function's INSERT gains or loses a column and WRITTEN is not kept in
    // step, this fails naming the discrepancy — so WRITTEN can never silently lie
    // about what the SQL writes.
    expect(new Set(WRITTEN_BY_UPSERT_LEGACY_PERSON)).toEqual(new Set(columnsWrittenByMigration()));
  });

  it("classifies every persons column as written or explicitly not-imported", () => {
    const written = new Set<string>(WRITTEN_BY_UPSERT_LEGACY_PERSON);
    const notImported = new Set(Object.keys(INTENTIONALLY_NOT_IMPORTED));
    // No column is both written and excluded.
    expect([...written].filter((c) => notImported.has(c))).toEqual([]);
    // Together they cover the whole table (compile-time exhaustiveness backs this).
    expect(written.size).toBe(WRITTEN_BY_UPSERT_LEGACY_PERSON.length);
    expect(written.size + notImported.size).toBeGreaterThanOrEqual(51);
  });
});
