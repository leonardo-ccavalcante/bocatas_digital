/**
 * informesImportReport.test.ts — unit tests for generateInformesWarningsReport
 *
 * Verifies that the XLSX generator:
 * 1. Returns a non-empty Buffer
 * 2. Contains the expected 4 worksheets
 * 3. Correctly classifies families into warnings / missing / ok
 * 4. Handles empty input gracefully
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generateInformesWarningsReport } from "../informesImportReport";
import type { InformesFamily, InformesMember, InformesTitular, MemberMatch } from "../../shared/legacyFamiliasTypes";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const makeTitular = (): InformesTitular => ({
  nombre: "Ana",
  apellidos: "García",
  fecha_nacimiento: null,
  pais_origen: null,
  telefono: null,
  direccion: null,
  municipio: null,
  codigo_postal: null,
  tipo_documento: null,
  numero_documento: null,
  warnings: [],
});

const makeMember = (slot: number): InformesMember => ({
  slot,
  nombre: "Test",
  apellidos: "Miembro",
  fecha_nacimiento: null,
  relacion_db: "hijo_a",
  parentesco_original: null,
  tipo_documento: null,
  numero_documento: null,
  warnings: [],
});

const makeMatch = (slot: number, tier: MemberMatch["match_tier"]): MemberMatch => ({
  slot,
  matched_member_id: tier === "ambiguous" || tier === "member_conflict" ? null : "m1",
  matched_person_id: tier === "ambiguous" || tier === "member_conflict" ? null : "p1",
  match_tier: tier,
});

const makeFamily = (overrides: Partial<InformesFamily>): InformesFamily => ({
  legacy_numero_familia: "100",
  family_id: "uuid-100",
  titular: makeTitular(),
  titular_id: "t-uuid",
  members: [makeMember(2)],
  member_matches: [makeMatch(2, "documento")],
  situacion_familiar_texto: null,
  necesidades_texto: null,
  members_truncated: false,
  warnings: [],
  ...overrides,
});

// Family with ambiguous match → "warnings"
const warnFamily: InformesFamily = makeFamily({
  legacy_numero_familia: "200",
  member_matches: [makeMatch(2, "ambiguous")],
});

// Family not found in padrón → "missing"
const missingFamily: InformesFamily = makeFamily({
  legacy_numero_familia: "300",
  family_id: null,
  titular_id: null,
  member_matches: [],
});

// Family with member_conflict → also "warnings"
const conflictFamily: InformesFamily = makeFamily({
  legacy_numero_familia: "400",
  member_matches: [makeMatch(2, "member_conflict")],
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS types expect the older Buffer type; Buffer.from ensures compatibility.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any);
  return wb;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("generateInformesWarningsReport", () => {
  it("returns a non-empty Buffer", async () => {
    const buf = await generateInformesWarningsReport([makeFamily({})]);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("workbook has exactly 4 worksheets with correct names", async () => {
    const buf = await generateInformesWarningsReport([makeFamily({})]);
    const wb = await loadWorkbook(buf);
    const names = wb.worksheets.map((ws) => ws.name);
    expect(names).toEqual(["Instrucciones", "Resumen", "Con avisos", "No encontradas"]);
  });

  it("Resumen sheet shows correct counts for mixed input", async () => {
    const families = [makeFamily({}), warnFamily, missingFamily, conflictFamily];
    const buf = await generateInformesWarningsReport(families, "test.csv");
    const wb = await loadWorkbook(buf);
    const ws = wb.getWorksheet("Resumen")!;
    // Row 1 is header, rows 2-5 are data rows
    // Row 2: OK families (1 ok family)
    const okCount = ws.getRow(2).getCell("C").value;
    expect(okCount).toBe(1);
    // Row 3: warning families (2: warnFamily + conflictFamily)
    const warnCount = ws.getRow(3).getCell("C").value;
    expect(warnCount).toBe(2);
    // Row 4: missing families (1)
    const missingCount = ws.getRow(4).getCell("C").value;
    expect(missingCount).toBe(1);
    // Row 5: total (4)
    const total = ws.getRow(5).getCell("C").value;
    expect(total).toBe(4);
  });

  it("Con avisos sheet has one row per warning member_match", async () => {
    const buf = await generateInformesWarningsReport([warnFamily, conflictFamily]);
    const wb = await loadWorkbook(buf);
    const ws = wb.getWorksheet("Con avisos")!;
    // Row 1 = header, rows 2+ = data (1 ambiguous + 1 member_conflict = 2 rows)
    const dataRows = ws.rowCount - 1;
    expect(dataRows).toBe(2);
  });

  it("No encontradas sheet has one row per missing family", async () => {
    const buf = await generateInformesWarningsReport([missingFamily, makeFamily({})]);
    const wb = await loadWorkbook(buf);
    const ws = wb.getWorksheet("No encontradas")!;
    // Row 1 = header, row 2 = missingFamily
    const dataRows = ws.rowCount - 1;
    expect(dataRows).toBe(1);
  });

  it("handles empty input gracefully (no-data rows in Con avisos and No encontradas)", async () => {
    const buf = await generateInformesWarningsReport([]);
    const wb = await loadWorkbook(buf);
    const wsW = wb.getWorksheet("Con avisos")!;
    const wsM = wb.getWorksheet("No encontradas")!;
    // Both sheets should have the "no data" placeholder row
    expect(wsW.rowCount).toBeGreaterThanOrEqual(2);
    expect(wsM.rowCount).toBeGreaterThanOrEqual(2);
  });

  it("includes src_filename in the Instrucciones sheet subtitle", async () => {
    const buf = await generateInformesWarningsReport([], "mi_archivo.csv");
    const wb = await loadWorkbook(buf);
    const ws = wb.getWorksheet("Instrucciones")!;
    // Row 2 is the subtitle row with the filename
    const subtitleCell = ws.getRow(2).getCell("B").value;
    expect(String(subtitleCell)).toContain("mi_archivo.csv");
  });
});
