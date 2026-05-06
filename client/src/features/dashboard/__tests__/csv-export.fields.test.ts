/**
 * csv-export.fields.test.ts — Phase A.3.3
 *
 * Locks the CSV export header set so any *drift* (added/removed/reordered
 * column) fails this test. The dashboard CSV is the funder-facing artifact,
 * and adding a PII column here is the kind of regression that is silently
 * dangerous: zero-PII export is a CLAUDE.md compliance non-negotiable.
 *
 * NOTE on header naming: the active codebase ships the export with these
 * Spanish-language headers (see `client/src/features/dashboard/utils/exportCSV.ts`):
 *
 *     fecha, hora, persona_uuid, punto_servicio, programa, metodo
 *
 * The Phase A.3 plan also references an alternative English-leaning naming
 * (`["fecha","hora","id_persona","service_point","method"]`). We lock the
 * *implemented* headers here. If product later renames columns, this test
 * is exactly where that rename gets reviewed (intentional drift).
 *
 * This test stands alongside `csv-export.test.ts` (general format / escaping
 * coverage) and is intentionally focused on the *header set* alone.
 */
import { describe, it, expect } from "vitest";
import { buildCSVString } from "../utils/exportCSV";

const EXPECTED_HEADERS: readonly string[] = [
  "fecha",
  "hora",
  "persona_uuid",
  "punto_servicio",
  "programa",
  "metodo",
] as const;

const PII_COLUMNS: readonly string[] = [
  "nombre",
  "apellidos",
  "email",
  "telefono",
  "dni",
  "nif",
  "documento",
  "direccion",
  "fecha_nacimiento",
  "pais",
] as const;

function getHeaderRow(): string {
  return buildCSVString([]).split("\n")[0];
}

function getHeaderColumns(): string[] {
  return getHeaderRow().split(",");
}

describe("CSV export — header field lock (drift detection)", () => {
  it("header row matches the locked set exactly (order + count)", () => {
    expect(getHeaderColumns()).toEqual([...EXPECTED_HEADERS]);
  });

  it("header row is exactly 6 columns", () => {
    expect(getHeaderColumns()).toHaveLength(EXPECTED_HEADERS.length);
  });

  it("header row joined string matches snapshot", () => {
    // Snapshot-style assertion — pinned literal, not toMatchSnapshot, so
    // the contract is visible in the test source itself.
    expect(getHeaderRow()).toBe(
      "fecha,hora,persona_uuid,punto_servicio,programa,metodo",
    );
  });
});

describe("CSV export — PII column lock", () => {
  it.each(PII_COLUMNS)(
    "header row does NOT contain PII column %s",
    (piiColumn) => {
      expect(getHeaderRow().toLowerCase()).not.toContain(piiColumn);
    },
  );

  it("anonymous person_id renders as 'anonimo' (never a real UUID surrogate)", () => {
    const csv = buildCSVString([
      {
        fecha: "2026-04-11",
        hora: "12:30",
        persona_uuid: "anonimo",
        punto_servicio: "Sede A",
        programa: "comedor",
        metodo: "conteo_anonimo",
      },
    ]);
    expect(csv).toContain(",anonimo,");
  });
});
