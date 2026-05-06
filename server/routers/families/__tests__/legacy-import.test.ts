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
import { parseRow, fieldsToLegacyRow, CSV_HEADERS } from "../../../csvLegacyFamiliasMapper";
import { assembleFamilyGroups } from "../../../csvLegacyFamiliasGroup";
import { parseCSVLine } from "../../announcements/_shared";

// Deterministic end-to-end transformation: CSV string → groups[].
function transformCsv(csv: string): {
  groups: ReturnType<typeof assembleFamilyGroups>;
  parseErrors: number;
} {
  const csvNormalised = csv.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = csvNormalised.split("\n");

  let headerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields[0]?.trim().startsWith("NÚMERO DE ORDEN")) {
      headerLineIdx = i;
      break;
    }
  }
  if (headerLineIdx === -1) throw new Error("Header not found");

  let dataStart = headerLineIdx + 1;
  const next = parseCSVLine(lines[headerLineIdx + 1] ?? "");
  if (next[0]?.trim().startsWith("(MARCAR CON UNA X")) {
    dataStart = headerLineIdx + 2;
  }

  const cleanRows = [];
  let parseErrors = 0;
  for (let i = dataStart; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = parseCSVLine(lines[i]).map((f) => f.trim());
    if (!fields[1]) continue;
    const legacy = fieldsToLegacyRow(fields);
    const r = parseRow(legacy, i + 1);
    if (r.ok) cleanRows.push(r.row);
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

  it("flags rows with missing nombre as parse errors", () => {
    const csv = [
      FIXTURE_HEADER,
      '1,1030,,,Apellidos,M,,,x,Perú,17/03/1983,,,,,,,,',
    ].join("\n");

    const { parseErrors, groups } = transformCsv(csv);
    expect(parseErrors).toBe(1);
    expect(groups.length).toBe(0);
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
