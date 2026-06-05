/**
 * legacy-import.test.ts — Contract tests for the legacy FAMILIAS bulk importer.
 *
 * The procedure body is heavy on Supabase admin client interaction
 * (probe queries, OR filters, RPC). Mocking the full chain duplicates the
 * production code without raising confidence. Instead we test the
 * deterministic units (header detection, row aggregation, group assembly)
 * end-to-end through the pure helpers, plus the input shape contract via Zod.
 *
 * Integration coverage (RPC + Supabase) is covered by the E2E Playwright
 * spec in e2e/bulk-import-legacy-familias.spec.ts which runs against a
 * local Supabase instance.
 */
import { describe, it, expect } from "vitest";
import { parseRow, CSV_HEADERS } from "../../../csvLegacyFamiliasMapper";
import {
  parseCSVDocument,
  resolveColumnMap,
  fieldsToLegacyRow,
  REQUIRED_KEYS,
} from "../../../csvLegacyFamiliasParser";
import { assembleFamilyGroups } from "../../../csvLegacyFamiliasGroup";

// Deterministic end-to-end transformation: CSV string → groups[].
// Mirrors the production parsing in legacy-import.ts (whole-document parser +
// header-NAME resolution) so the test exercises the real pipeline.
function transformCsv(csv: string): {
  groups: ReturnType<typeof assembleFamilyGroups>;
  parseErrors: number;
} {
  const records = parseCSVDocument(csv);

  let headerIdx = -1;
  let columnMap: ReturnType<typeof resolveColumnMap> | null = null;
  for (let i = 0; i < Math.min(records.length, 10); i++) {
    const candidate = resolveColumnMap(records[i]);
    if (REQUIRED_KEYS.every((k) => candidate.has(k))) {
      headerIdx = i;
      columnMap = candidate;
      break;
    }
  }
  if (headerIdx === -1 || !columnMap) throw new Error("Header not found");

  const famIdx = columnMap.get("numero_familia")!;
  const data = records.slice(headerIdx + 1);
  const cleanRows = [];
  let parseErrors = 0;
  for (let r = 0; r < data.length; r++) {
    const rec = data[r];
    if (rec.every((c) => c.trim() === "")) continue;
    if (!(rec[famIdx] ?? "").trim()) continue;
    const legacy = fieldsToLegacyRow(rec, columnMap);
    const res = parseRow(legacy, headerIdx + 1 + r + 1);
    if (res.ok) cleanRows.push(res.row);
    else parseErrors++;
  }
  return { groups: assembleFamilyGroups(cleanRows), parseErrors };
}

const FIXTURE_HEADER =
  '"NÚMERO DE ORDEN","NUMERO FAMILIA BOCATAS","FECHA ALTA","NOMBRE","APELLIDOS","SEXO",' +
  '"TELEFONO","DNI/NIE/ PASAPORTE","CABEZA DE FAMILIA","PAIS","Fecha Nacimiento","EMAIL",' +
  '"DIRECCION","CODIGO POSTAL","Localidad","NOTAS PARA INFORME SOCIAL",' +
  '"Nivel de estudios finalizados","Situación Laboral","Otras Características"';

describe("Legacy import — CSV to groups transformation", () => {
  it("parses a 2-family CSV and groups by NUMERO FAMILIA BOCATAS", () => {
    const csv = [
      FIXTURE_HEADER,
      '1,1030,30/09/2020,Luis,Apellido,M,604372950,Y-8206459-G,x,Perú,17/03/1983,,"C/ Test 17",28020,Madrid,"Notas",Educación Primaria,Personas Inactivas,Otros/ especificar...',
      '2,1030,,Nimia,Carguatocto,F,,,Cuñada,Perú,23/02/1985,,,,,,Educación Post-Secundaria no Superior,Personas en situación de Precariedad Laboral,Otros/ especificar...',
      '3,1032,27/06/2025,Susi,Vilca,F,,Y6802248N,X,Perú,4/10/1985,,C/ Otro,28018,Madrid,"Notas2",Educación Secundaria,Personas Inactivas,Gitanos',
    ].join("\n");

    const { groups, parseErrors } = transformCsv(csv);
    expect(parseErrors).toBe(0);
    expect(groups.length).toBe(2);

    const fam1030 = groups.find((g) => g.legacy_numero_familia === "1030");
    expect(fam1030).toBeDefined();
    expect(fam1030!.rows.length).toBe(2);
    expect(fam1030!.titular_index).toBe(0);
    expect(fam1030!.rows[0].is_titular).toBe(true);
    expect(fam1030!.rows[0].person.nombre).toBe("Luis");

    const fam1032 = groups.find((g) => g.legacy_numero_familia === "1032");
    expect(fam1032!.rows[0].person.metadata.colectivos).toEqual(["Gitanos"]);
  });

  it("tolerates a blank row before the header", () => {
    const csv = [
      ",,,,,,,,,,,,,,,,,,",
      FIXTURE_HEADER,
      '1,1030,30/09/2020,X,Y,M,,,x,Perú,17/03/1983,,,,,,Educación Primaria,,Otros/ especificar...',
    ].join("\n");

    const { groups, parseErrors } = transformCsv(csv);
    expect(parseErrors).toBe(0);
    expect(groups.length).toBe(1);
  });

  it("tolerates a multi-line header (CABEZA DE FAMILIA + parenthetical continuation)", () => {
    const csv = [
      FIXTURE_HEADER.replace(
        '"CABEZA DE FAMILIA"',
        '"CABEZA DE FAMILIA\n(MARCAR CON UNA X DONDE PROCEDA)"'
      ),
      '1,1030,30/09/2020,X,Y,M,,,x,Perú,17/03/1983,,,,,,Educación Primaria,,Otros/ especificar...',
    ].join("\n");

    // Note: in practice the user's CSV has a literal newline inside the quoted
    // header cell, so parseCSVLine sees them as ONE physical line. This test
    // pins that behavior — the multi-line header inside quotes does not break parsing.
    const { groups, parseErrors } = transformCsv(csv);
    expect(parseErrors).toBe(0);
    expect(groups.length).toBe(1);
  });

  it("flags families with no titular as group-error", () => {
    const csv = [
      FIXTURE_HEADER,
      '1,1030,,X,Y,M,,,Hermano,Perú,17/03/1983,,,,,,,,Otros/ especificar...',
      '2,1030,,Z,W,F,,,Hija,Perú,17/03/1985,,,,,,,,Otros/ especificar...',
    ].join("\n");

    const { groups } = transformCsv(csv);
    expect(groups[0].errors.length).toBeGreaterThan(0);
    expect(groups[0].errors[0].message).toContain("ningún titular");
  });

  it("flags families with multiple titulares as group-error", () => {
    const csv = [
      FIXTURE_HEADER,
      '1,1030,,X,Y,M,,,x,Perú,17/03/1983,,,,,,,,Otros/ especificar...',
      '2,1030,,Z,W,F,,,X,Perú,17/03/1985,,,,,,,,Otros/ especificar...',
    ].join("\n");

    const { groups } = transformCsv(csv);
    expect(groups[0].errors.length).toBeGreaterThan(0);
    expect(groups[0].errors[0].message).toContain("varios titulares");
  });

  it("recovers rows with missing nombre via a placeholder (Phase 5 — not a parse error)", () => {
    const csv = [
      FIXTURE_HEADER,
      '1,1030,,,Apellidos,M,,,x,Perú,17/03/1983,,,,,,,,',
    ].join("\n");

    const { parseErrors, groups } = transformCsv(csv);
    // Best-effort: a missing nombre no longer rejects the row — it is recovered
    // with a placeholder + warning so the family isn't lost.
    expect(parseErrors).toBe(0);
    expect(groups.length).toBe(1);
    expect(groups[0].rows[0].person.nombre).toBe("(sin nombre)");
    expect(groups[0].rows[0].warnings.some((w) => w.code === "nombre_placeholder")).toBe(true);
  });
});

describe("Legacy import — DNI/NIE canonicalisation through full pipeline", () => {
  it("strips dots, hyphens, and trailing spaces from DNI", () => {
    const csv = [
      FIXTURE_HEADER,
      '1,1030,,X,Y,M,,55.307.681- H,x,España,17/03/1983,,,,,,,,Otros/ especificar...',
    ].join("\n");

    const { groups } = transformCsv(csv);
    expect(groups[0].rows[0].person.tipo_documento).toBe("DNI");
    expect(groups[0].rows[0].person.numero_documento).toBe("55307681H");
  });

  it("infers NIE from leading X/Y/Z", () => {
    const csv = [
      FIXTURE_HEADER,
      '1,1030,,X,Y,M,,Y-8206459-G,x,Perú,17/03/1983,,,,,,,,Otros/ especificar...',
    ].join("\n");

    const { groups } = transformCsv(csv);
    expect(groups[0].rows[0].person.tipo_documento).toBe("NIE");
    expect(groups[0].rows[0].person.numero_documento).toBe("Y8206459G");
  });
});

describe("CSV_HEADERS contract", () => {
  it("matches the expected legacy column order", () => {
    expect(CSV_HEADERS[0]).toBe("NÚMERO DE ORDEN");
    expect(CSV_HEADERS[1]).toBe("NUMERO FAMILIA BOCATAS");
    expect(CSV_HEADERS[8]).toBe("CABEZA DE FAMILIA");
    expect(CSV_HEADERS[18]).toBe("Otras Características");
    expect(CSV_HEADERS.length).toBe(19);
  });
});
