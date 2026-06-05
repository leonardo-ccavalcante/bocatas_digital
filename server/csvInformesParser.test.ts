import { describe, it, expect } from "vitest";
import { resolveInformesColumns, parseInformesDocument } from "./csvInformesParser";

// Structurally faithful wide INFORMES slice (real header typos preserved:
// "NACIEMIENTO", "DNI/ PASAPORTE", trailing-space slot headers).
const HEADER =
  'NUMERO FAMILIA BOCATAS,FECHA ALTA,NOMBRE,APELLIDOS,TELEFONO,DNI/ PASAPORTE,PAIS,' +
  'Fecha Nacimiento,DIRECCION,CODIGO POSTAL,Localidad,DESCRIPCION SITUACIÓN FAMILIAR,' +
  'NOTAS NECESIDADES,NOMBRE 2,APELLIDO 2,FECHA DE NACIEMIENTO  2,PARENTESCO 2,DNI/ PASAPORTE 2,' +
  'NOMBRE 3,APELLIDO 3,FECHA DE NACIEMIENTO  3,PARENTESCO 3,DNI/ PASAPORTE 3';

const ROW1 =
  'ABC-1,30/09/2020,Maria,Garcia Lopez,600111222,50.773.937-B,España,9/08/1977,"C/ Falsa 1",28004,Madrid,' +
  '"Familia monoparental con dos menores.","Apoyo alimentario y ropa.",' +
  'Juan,Garcia,23-sept-22,Hijo,,' +
  'Pedro,Garcia,17-mar-83,Cuñado,Y6802248N';

describe("resolveInformesColumns", () => {
  const header = HEADER.split(",");
  const c = resolveInformesColumns(header);
  it("resolves titular scalars (not confused with member slots)", () => {
    expect(c.numero_familia).toBe(0);
    expect(c.nombre).toBe(2);
    expect(c.apellidos).toBe(3);
    expect(c.documento).toBe(5); // titular DNI (no slot number)
    expect(c.pais).toBe(6);
    expect(c.fecha_nacimiento).toBe(7); // titular DOB, not a member fecha
    expect(c.codigo_postal).toBe(9);
    expect(c.situacion_familiar).toBe(11);
    expect(c.necesidades).toBe(12);
  });
  it("groups member slots despite typos / spacing", () => {
    expect(c.memberSlots.length).toBe(2);
    const s2 = c.memberSlots[0];
    expect(s2.slot).toBe(2);
    expect(s2.nombre).toBe(13);
    expect(s2.fecha).toBe(15); // "FECHA DE NACIEMIENTO  2" (typo+double space)
    expect(s2.parentesco).toBe(16);
    expect(s2.documento).toBe(17);
  });
});

describe("parseInformesDocument", () => {
  const parsed = parseInformesDocument(`${HEADER}\n${ROW1}`);
  it("finds the header and one family", () => {
    expect(parsed.header_found).toBe(true);
    expect(parsed.families.length).toBe(1);
  });
  it("un-pivots the titular with reused coercers", () => {
    const f = parsed.families[0];
    expect(f.legacy_numero_familia).toBe("ABC-1");
    expect(f.titular.nombre).toBe("Maria");
    expect(f.titular.pais_origen).toBe("ES");
    expect(f.titular.fecha_nacimiento).toBe("1977-08-09");
    expect(f.titular.codigo_postal).toBe("28004");
    expect(f.titular.tipo_documento).toBe("DNI");
    expect(f.titular.numero_documento).toBe("50773937B");
  });
  it("carries the social-report narrative", () => {
    const f = parsed.families[0];
    expect(f.situacion_familiar_texto).toContain("monoparental");
    expect(f.necesidades_texto).toContain("alimentario");
  });
  it("un-pivots members with parentesco + DNI coercion", () => {
    const f = parsed.families[0];
    expect(f.members.length).toBe(2);
    const [m2, m3] = f.members;
    expect(m2.nombre).toBe("Juan");
    expect(m2.relacion_db).toBe("hijo_a"); // "Hijo"
    expect(m2.fecha_nacimiento).toBe("2022-09-23"); // 23-sept-22
    expect(m3.nombre).toBe("Pedro");
    expect(m3.relacion_db).toBe("other"); // "Cuñado"
    expect(m3.parentesco_original).toBe("Cuñado");
    expect(m3.numero_documento).toBe("Y6802248N");
  });
});

// ── Phase 5 (best-effort): a member slot with data but no NOMBRE is recovered
//    with a placeholder, not dropped; a fully-empty slot is still skipped. ──
describe("parseInformesDocument — Phase 5 member placeholder", () => {
  // slot 2: apellido + fecha + parentesco present, NOMBRE 2 empty → placeholder.
  // slot 3: fully empty → skipped.
  const ROW =
    'XYZ-2,01/01/2020,Ana,Ruiz,600,,España,01/01/1980,"C/ X",28004,Madrid,' +
    '"sit","nec",,Perez,12/12/2015,Hijo,,,,,,';
  const parsed = parseInformesDocument(`${HEADER}\n${ROW}`);

  it("keeps a named-less slot as a placeholder member (not dropped)", () => {
    expect(parsed.families.length).toBe(1);
    const f = parsed.families[0];
    expect(f.members.length).toBe(1); // slot 2 kept, slot 3 (empty) skipped
    const m = f.members[0];
    expect(m.nombre).toBe("(sin nombre)");
    expect(m.apellidos).toBe("Perez");
    expect(m.fecha_nacimiento).toBe("2015-12-12");
    expect(m.warnings.some((w) => w.code === "nombre_placeholder")).toBe(true);
  });
});
