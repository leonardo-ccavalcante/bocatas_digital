import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  repairMojibake,
  parseCSVDocument,
  normalizeHeader,
  resolveColumnMap,
  fieldsToLegacyRow,
  REQUIRED_KEYS,
} from "./csvLegacyFamiliasParser";
import { CSV_HEADERS } from "./csvLegacyFamiliasMapper";

const FIXTURE = join(__dirname, "..", "tests", "fixtures", "legacy-familias-edgecases.csv");

describe("repairMojibake (G4 — idempotent safety net)", () => {
  it("leaves clean UTF-8 untouched (the real file's case)", () => {
    expect(repairMojibake("España")).toBe("España");
    expect(repairMojibake("Perú")).toBe("Perú");
    expect(repairMojibake("Situación Laboral")).toBe("Situación Laboral");
    expect(repairMojibake("Niño con el que convive")).toBe("Niño con el que convive");
  });
  it("repairs genuine double-encoding (UTF-8 read as Latin-1)", () => {
    // Construct the mojibake exactly as a mis-decode would produce it.
    const mojibake = Buffer.from("España", "utf8").toString("latin1"); // "EspaÃ±a"
    expect(mojibake).not.toBe("España");
    expect(repairMojibake(mojibake)).toBe("España");
    const moji2 = Buffer.from("Situación", "utf8").toString("latin1");
    expect(repairMojibake(moji2)).toBe("Situación");
  });
  it("is idempotent", () => {
    const moji = Buffer.from("Perú", "utf8").toString("latin1");
    expect(repairMojibake(repairMojibake(moji))).toBe(repairMojibake(moji));
    expect(repairMojibake(repairMojibake("España"))).toBe("España");
  });
  it("handles empty / undefined-ish input safely", () => {
    expect(repairMojibake("")).toBe("");
    expect(repairMojibake("abc")).toBe("abc");
  });
});

describe("parseCSVDocument (G2 — whole-document, quote-aware)", () => {
  it("parses simple rows", () => {
    expect(parseCSVDocument("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("keeps a newline inside a quoted field as content (the NOTAS case)", () => {
    const rows = parseCSVDocument('a,"line1\nline2",c\nx,y,z');
    expect(rows).toEqual([
      ["a", "line1\nline2", "c"],
      ["x", "y", "z"],
    ]);
  });
  it("handles escaped double-quotes", () => {
    expect(parseCSVDocument('a,"he said ""hi""",c')).toEqual([
      ["a", 'he said "hi"', "c"],
    ]);
  });
  it("handles CRLF and lone CR as one break", () => {
    expect(parseCSVDocument("a,b\r\nc,d\re,f")).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "f"],
    ]);
  });
  it("does not emit a phantom trailing row for a trailing newline", () => {
    expect(parseCSVDocument("a,b\n")).toEqual([["a", "b"]]);
  });
  it("collapses the real 4107→4015 shape: physical lines < records when quoted", () => {
    // 1 record spanning 2 physical lines + 1 normal record = 2 records.
    expect(parseCSVDocument('"a\nb",c\nd,e').length).toBe(2);
  });
});

describe("normalizeHeader", () => {
  it("collapses the multi-line CABEZA cell (R1)", () => {
    expect(normalizeHeader("CABEZA DE FAMILIA\n(MARCAR CON UNA X DONDE PROCEDA)")).toBe(
      "cabeza de familia marcar con una x donde proceda"
    );
  });
  it("strips accents and lowercases", () => {
    expect(normalizeHeader("NÚMERO DE ORDEN")).toBe("numero de orden");
    expect(normalizeHeader("Situación Laboral")).toBe("situacion laboral");
  });
  it("collapses slashes/punctuation to single spaces", () => {
    expect(normalizeHeader("DNI/NIE/ PASAPORTE")).toBe("dni nie pasaporte");
  });
});

describe("resolveColumnMap (G1 — map by NAME, recovers column shift)", () => {
  const header = parseCSVDocument(readFileSync(FIXTURE, "utf8"))[1]; // row 0 blank, row 1 header

  it("the fixture header is the real 54-column shape", () => {
    expect(header.length).toBe(54);
  });

  it("CRITICAL: país resolves to idx 10, NOT the idx-9 ACTIVA/BAJA column", () => {
    const map = resolveColumnMap(header);
    expect(map.get("pais")).toBe(10);
    // A positional reader would have grabbed idx 9 here:
    expect(normalizeHeader(header[9])).toContain("activa");
  });

  it("resolves every shifted canonical field to its true index", () => {
    const map = resolveColumnMap(header);
    expect(map.get("numero_orden")).toBe(0);
    expect(map.get("numero_familia")).toBe(1);
    expect(map.get("fecha_alta")).toBe(2);
    expect(map.get("nombre")).toBe(3);
    expect(map.get("apellidos")).toBe(4);
    expect(map.get("sexo")).toBe(5);
    expect(map.get("telefono")).toBe(6);
    expect(map.get("documento")).toBe(7);
    expect(map.get("cabeza_familia")).toBe(8); // R1: multi-line cell
    expect(map.get("fecha_nacimiento")).toBe(12); // shifted by DOCUMENTACIÓN col
    expect(map.get("email")).toBe(13);
    expect(map.get("direccion")).toBe(14);
    expect(map.get("codigo_postal")).toBe(15);
    expect(map.get("localidad")).toBe(16);
    expect(map.get("notas_informe_social")).toBe(28);
    expect(map.get("nivel_estudios")).toBe(29);
    expect(map.get("situacion_laboral")).toBe(30);
    expect(map.get("otras_caracteristicas")).toBe(31);
  });

  it("resolves all REQUIRED_KEYS on the real header", () => {
    const map = resolveColumnMap(header);
    for (const k of REQUIRED_KEYS) expect(map.has(k)).toBe(true);
  });

  it("also works on the 19-column clean template (país at idx 9 there)", () => {
    const map = resolveColumnMap(CSV_HEADERS as unknown as string[]);
    expect(map.get("pais")).toBe(9);
    expect(map.get("fecha_nacimiento")).toBe(10);
    expect(map.get("cabeza_familia")).toBe(8);
  });

  it("never assigns one column to two keys", () => {
    const map = resolveColumnMap(header);
    const idxs = [...map.values()];
    expect(new Set(idxs).size).toBe(idxs.length);
  });
});

describe("fieldsToLegacyRow (by resolved name)", () => {
  const text = readFileSync(FIXTURE, "utf8");
  const records = parseCSVDocument(text);
  const map = resolveColumnMap(records[1]);

  it("reads país/DOB from the correct shifted columns (family 9001 titular)", () => {
    // records[2] is the first data row (family 9001 titular).
    const lr = fieldsToLegacyRow(records[2], map);
    expect(lr.numero_familia).toBe("9001");
    expect(lr.nombre).toBe("Sintetica Uno");
    expect(lr.pais).toBe("España"); // would be "Activa" under a positional read
    expect(lr.fecha_nacimiento).toBe("09/08/1977");
    expect(lr.cabeza_familia).toBe("x");
    // The embedded-newline NOTAS survived parsing intact.
    expect(lr.notas_informe_social).toContain("\n");
  });

  it("omits blank cells", () => {
    const lr = fieldsToLegacyRow(records[3], map); // family 9001 dependent (sparse)
    expect(lr.telefono).toBeUndefined();
    expect(lr.email).toBeUndefined();
    expect(lr.pais).toBe("Peru");
  });
});

describe("parseCSVDocument — record ceiling (M1 memory guard)", () => {
  it("throws past maxRecords", () => {
    expect(() => parseCSVDocument("a\nb\nc\nd\ne", 3)).toThrow();
  });
  it("does not throw under the ceiling", () => {
    expect(parseCSVDocument("a\nb", 100).length).toBe(2);
  });
});
