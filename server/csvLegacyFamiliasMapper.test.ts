import { describe, it, expect } from "vitest";
import {
  parseDate,
  parseSexo,
  parseCountry,
  parseDocumento,
  parseNivelEstudios,
  parseSituacionLaboral,
  parseColectivos,
  isTitular,
  parseParentesco,
  parseRow,
  CSV_HEADERS,
} from "./csvLegacyFamiliasMapper";
import type { LegacyRow } from "../shared/legacyFamiliasTypes";

// Test data drawn from PRUEBA FAMILIAS.xlsx — Hoja 1.csv (real user CSV).
// Every quirk in the source CSV must be covered.

describe("parseDate", () => {
  it("dd/mm/yyyy → ISO", () => {
    expect(parseDate("30/09/2020")).toEqual({ value: "2020-09-30", warning: null });
  });
  it("d/m/yyyy single-digit", () => {
    expect(parseDate("3/9/2020")).toEqual({ value: "2020-09-03", warning: null });
  });
  it("d/m/yyyy with leading space", () => {
    expect(parseDate(" 17/03/1983 ")).toEqual({ value: "1983-03-17", warning: null });
  });
  it("invalid date returns null + warning", () => {
    const r = parseDate("99/99/9999");
    expect(r.value).toBeNull();
    expect(r.warning?.code).toBe("date_invalid");
  });
  it("non-date string returns null + warning", () => {
    const r = parseDate("abc/def/ghi");
    expect(r.value).toBeNull();
    expect(r.warning?.code).toBe("date_invalid");
  });
  it("empty returns null without warning", () => {
    expect(parseDate("")).toEqual({ value: null, warning: null });
    expect(parseDate(undefined)).toEqual({ value: null, warning: null });
  });
});

describe("parseSexo", () => {
  it("M → masculino", () => {
    expect(parseSexo("M")).toEqual({ value: "masculino", warning: null });
  });
  it("F → femenino", () => {
    expect(parseSexo("F")).toEqual({ value: "femenino", warning: null });
  });
  it("lowercase m/f", () => {
    expect(parseSexo("m").value).toBe("masculino");
    expect(parseSexo("f").value).toBe("femenino");
  });
  it("empty returns null without warning", () => {
    expect(parseSexo("")).toEqual({ value: null, warning: null });
    expect(parseSexo(undefined)).toEqual({ value: null, warning: null });
  });
  it("unrecognised value returns null + warning", () => {
    const r = parseSexo("X");
    expect(r.value).toBeNull();
    expect(r.warning?.code).toBe("sexo_unknown");
  });
});

describe("parseCountry", () => {
  it("Perú → PE", () => {
    expect(parseCountry("Perú")).toEqual({ value: "PE", warning: null });
  });
  it("Peru no accent → PE", () => {
    expect(parseCountry("Peru")).toEqual({ value: "PE", warning: null });
  });
  it("España → ES", () => {
    expect(parseCountry("España")).toEqual({ value: "ES", warning: null });
  });
  it("Marruecos → MA", () => {
    expect(parseCountry("Marruecos")).toEqual({ value: "MA", warning: null });
  });
  it("trailing whitespace ignored", () => {
    expect(parseCountry("España ").value).toBe("ES");
  });
  it("unknown country returns null + warning", () => {
    const r = parseCountry("Wakanda");
    expect(r.value).toBeNull();
    expect(r.warning?.code).toBe("country_unknown");
  });
  it("empty returns null without warning", () => {
    expect(parseCountry("")).toEqual({ value: null, warning: null });
  });
});

describe("parseDocumento", () => {
  it("NIE with hyphens → tipo NIE, cleaned numero", () => {
    expect(parseDocumento("Y-8206459-G")).toEqual({
      tipo_documento: "NIE",
      numero_documento: "Y8206459G",
      warning: null,
    });
  });
  it("NIE without hyphens", () => {
    expect(parseDocumento("Y6802248N")).toEqual({
      tipo_documento: "NIE",
      numero_documento: "Y6802248N",
      warning: null,
    });
  });
  it("DNI with dots → tipo DNI", () => {
    expect(parseDocumento("55.310.594-X")).toEqual({
      tipo_documento: "DNI",
      numero_documento: "55310594X",
      warning: null,
    });
  });
  it("DNI with trailing space inside", () => {
    expect(parseDocumento("55.307.681- H")).toEqual({
      tipo_documento: "DNI",
      numero_documento: "55307681H",
      warning: null,
    });
  });
  it("DNI 8 digits + letter", () => {
    expect(parseDocumento("51030846X")).toEqual({
      tipo_documento: "DNI",
      numero_documento: "51030846X",
      warning: null,
    });
  });
  it("Pasaporte fallback for non-matching format → tipo Pasaporte", () => {
    const r = parseDocumento("ABC123XYZ");
    expect(r.tipo_documento).toBe("Pasaporte");
    expect(r.numero_documento).toBe("ABC123XYZ");
  });
  it("empty → null tipo and numero, no warning", () => {
    expect(parseDocumento("")).toEqual({
      tipo_documento: null,
      numero_documento: null,
      warning: null,
    });
  });
});

describe("parseNivelEstudios", () => {
  it("Sin Estudios → sin_estudios", () => {
    expect(parseNivelEstudios("Sin Estudios").value).toBe("sin_estudios");
  });
  it("Educación Primaria with trailing space → primaria", () => {
    expect(parseNivelEstudios("Educación Primaria ").value).toBe("primaria");
  });
  it("Educación Secundaria → secundaria", () => {
    expect(parseNivelEstudios("Educación Secundaria").value).toBe("secundaria");
  });
  it("Educación Post-Secundaria no Superior → bachillerato + warning", () => {
    const r = parseNivelEstudios("Educación Post-Secundaria no Superior");
    expect(r.value).toBe("bachillerato");
    expect(r.warning?.code).toBe("estudios_unknown");
  });
  it("Educación Superior → universitario", () => {
    expect(parseNivelEstudios("Educación Superior ").value).toBe("universitario");
  });
  it("empty returns null without warning", () => {
    expect(parseNivelEstudios("")).toEqual({ value: null, warning: null });
  });
  it("unknown value returns null + warning", () => {
    const r = parseNivelEstudios("Doctorate of Witchcraft");
    expect(r.value).toBeNull();
    expect(r.warning?.code).toBe("estudios_unknown");
  });
});

describe("parseSituacionLaboral", () => {
  it("Personas Inactivas → desempleado + warning", () => {
    const r = parseSituacionLaboral("Personas Inactivas ");
    expect(r.value).toBe("desempleado");
    expect(r.warning?.code).toBe("laboral_unknown");
  });
  it("Personas en situación de Precariedad Laboral → empleo_temporal + warning", () => {
    const r = parseSituacionLaboral("Personas en situación de Precariedad Laboral ");
    expect(r.value).toBe("empleo_temporal");
    expect(r.warning?.code).toBe("laboral_unknown");
  });
  it("Desempleado con Subsidio... → desempleado", () => {
    const r = parseSituacionLaboral(
      "Desempleado  con Subsidio de desempleo de larga duración (más de 12 meses) "
    );
    expect(r.value).toBe("desempleado");
  });
  it("empty returns null without warning", () => {
    expect(parseSituacionLaboral("")).toEqual({ value: null, warning: null });
  });
});

describe("parseColectivos", () => {
  it("Colectivo LGTBI → ['LGTBI']", () => {
    expect(parseColectivos("Colectivo LGTBI")).toEqual({
      colectivos: ["LGTBI"],
      warning: null,
    });
  });
  it("Gitanos → ['Gitanos']", () => {
    expect(parseColectivos("Gitanos")).toEqual({
      colectivos: ["Gitanos"],
      warning: null,
    });
  });
  it("Sin Hogar → ['Sin_Hogar']", () => {
    expect(parseColectivos("Sin Hogar")).toEqual({
      colectivos: ["Sin_Hogar"],
      warning: null,
    });
  });
  it("Reclusos y/o exreclusos → ['Reclusos']", () => {
    expect(parseColectivos("Reclusos y/o exreclusos")).toEqual({
      colectivos: ["Reclusos"],
      warning: null,
    });
  });
  it("'Otros/ especificar...' → []", () => {
    expect(parseColectivos("Otros/ especificar en la siguiente columna")).toEqual({
      colectivos: [],
      warning: null,
    });
  });
  it("empty → []", () => {
    expect(parseColectivos("")).toEqual({ colectivos: [], warning: null });
  });
});

describe("isTitular", () => {
  it("'x' lowercase", () => {
    expect(isTitular("x")).toBe(true);
  });
  it("'X' uppercase", () => {
    expect(isTitular("X")).toBe(true);
  });
  it("padded ' x '", () => {
    expect(isTitular(" x ")).toBe(true);
  });
  it("relacion text 'Cuñada'", () => {
    expect(isTitular("Cuñada")).toBe(false);
  });
  it("'Hijo'", () => {
    expect(isTitular("Hijo")).toBe(false);
  });
  it("empty", () => {
    expect(isTitular("")).toBe(false);
    expect(isTitular(undefined)).toBe(false);
  });
});

describe("parseParentesco", () => {
  it("Hijo → hijo_a", () => {
    expect(parseParentesco("Hijo")).toEqual({
      relacion: "hijo_a",
      warning: null,
    });
  });
  it("Hija → hijo_a", () => {
    expect(parseParentesco("Hija").relacion).toBe("hijo_a");
  });
  it("Esposo → esposo_a", () => {
    expect(parseParentesco("Esposo").relacion).toBe("esposo_a");
  });
  it("Esposa → esposo_a", () => {
    expect(parseParentesco("Esposa").relacion).toBe("esposo_a");
  });
  it("Hermano/Hermana → hermano_a", () => {
    expect(parseParentesco("Hermano").relacion).toBe("hermano_a");
    expect(parseParentesco("Hermana").relacion).toBe("hermano_a");
  });
  it("Madre → madre", () => {
    expect(parseParentesco("Madre").relacion).toBe("madre");
  });
  it("Padre → padre", () => {
    expect(parseParentesco("Padre").relacion).toBe("padre");
  });
  it("Abuelo/Abuela → abuelo_a", () => {
    expect(parseParentesco("Abuelo").relacion).toBe("abuelo_a");
    expect(parseParentesco("Abuela").relacion).toBe("abuelo_a");
  });
  it("Suegro/Suegra → suegro_a", () => {
    expect(parseParentesco("Suegro").relacion).toBe("suegro_a");
    expect(parseParentesco("Suegra").relacion).toBe("suegro_a");
  });
  it("Cuñada → other + warning", () => {
    const r = parseParentesco("Cuñada");
    expect(r.relacion).toBe("other");
    expect(r.warning?.code).toBe("parentesco_coerced");
  });
  it("Cuñado → other + warning", () => {
    expect(parseParentesco("Cuñado").relacion).toBe("other");
  });
  it("Nieto → other + warning", () => {
    const r = parseParentesco("Nieto");
    expect(r.relacion).toBe("other");
    expect(r.warning?.code).toBe("parentesco_coerced");
  });
  it("Empty → other (no warning, used when titular)", () => {
    expect(parseParentesco("")).toEqual({ relacion: "other", warning: null });
  });
});

describe("parseRow — titular full", () => {
  const titularRow: LegacyRow = {
    numero_orden: "1",
    numero_familia: "1030",
    fecha_alta: "30/09/2020",
    nombre: "Luís Alfredo",
    apellidos: "Alburquerque Gutierrez",
    sexo: "M",
    telefono: "604372950",
    documento: "Y-8206459-G",
    cabeza_familia: "x",
    pais: "Perú",
    fecha_nacimiento: "17/03/1983",
    email: "",
    direccion: "C/ Palencia, 17, 1 int, drcha",
    codigo_postal: "28020",
    localidad: "Madrid",
    notas_informe_social: "Unidad familiar de 6 miembros",
    nivel_estudios: "Educación Primaria ",
    situacion_laboral: "Personas Inactivas ",
    otras_caracteristicas: "Otros/ especificar en la siguiente columna",
  };

  it("returns ok=true with CleanRow", () => {
    const r = parseRow(titularRow, 4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.legacy_numero_familia).toBe("1030");
    expect(r.row.legacy_numero_orden).toBe("1");
    expect(r.row.is_titular).toBe(true);
    expect(r.row.parentesco_original).toBeNull();
    expect(r.row.fecha_alta).toBe("2020-09-30");
    expect(r.row.relacion_db).toBe("other"); // titulars don't have a relacion
    expect(r.row.person.nombre).toBe("Luís Alfredo");
    expect(r.row.person.apellidos).toBe("Alburquerque Gutierrez");
    expect(r.row.person.fecha_nacimiento).toBe("1983-03-17");
    expect(r.row.person.genero).toBe("masculino");
    expect(r.row.person.pais_origen).toBe("PE");
    expect(r.row.person.telefono).toBe("604372950");
    expect(r.row.person.tipo_documento).toBe("NIE");
    expect(r.row.person.numero_documento).toBe("Y8206459G");
    expect(r.row.person.direccion).toBe("C/ Palencia, 17, 1 int, drcha");
    expect(r.row.person.municipio).toBe("Madrid");
    expect(r.row.person.metadata.codigo_postal).toBe("28020");
    expect(r.row.person.metadata.legacy_orden).toBe("1");
    expect(r.row.person.metadata.legacy_row).toBe(4);
    expect(r.row.person.nivel_estudios).toBe("primaria");
    expect(r.row.person.situacion_laboral).toBe("desempleado"); // coerced from Personas Inactivas
    expect(r.row.person.metadata.colectivos).toEqual([]);
  });

  it("emits warning for situacion_laboral coercion", () => {
    const r = parseRow(titularRow, 4);
    if (!r.ok) throw new Error("expected ok");
    const codes = r.row.warnings.map((w) => w.code);
    expect(codes).toContain("laboral_unknown");
  });
});

describe("parseRow — dependent partial", () => {
  const depRow: LegacyRow = {
    numero_orden: "2",
    numero_familia: "1030",
    fecha_alta: "",
    nombre: "Nimia",
    apellidos: "Carguatocto",
    sexo: "F",
    telefono: "",
    documento: "",
    cabeza_familia: "Cuñada",
    pais: "Perú",
    fecha_nacimiento: "23/02/1985",
    email: "",
    direccion: "",
    codigo_postal: "",
    localidad: "",
    notas_informe_social: "",
    nivel_estudios: "Educación Post-Secundaria no Superior ",
    situacion_laboral: "Personas en situación de Precariedad Laboral ",
    otras_caracteristicas: "Otros/ especificar en la siguiente columna",
  };

  it("returns ok=true with is_titular=false and relacion_db='other' + parentesco_original=Cuñada", () => {
    const r = parseRow(depRow, 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.is_titular).toBe(false);
    expect(r.row.parentesco_original).toBe("Cuñada");
    expect(r.row.relacion_db).toBe("other");
    expect(r.row.person.metadata.parentesco_original).toBe("Cuñada");
  });

  it("emits parentesco_coerced + estudios_unknown + laboral_unknown warnings", () => {
    const r = parseRow(depRow, 5);
    if (!r.ok) throw new Error("expected ok");
    const codes = r.row.warnings.map((w) => w.code);
    expect(codes).toContain("parentesco_coerced");
    expect(codes).toContain("estudios_unknown");
    expect(codes).toContain("laboral_unknown");
  });
});

describe("parseRow — dependent with proper parentesco", () => {
  const son: LegacyRow = {
    numero_orden: "6",
    numero_familia: "1030",
    nombre: "Fabricio",
    apellidos: "Alburquerque Carguatocto",
    sexo: "M",
    cabeza_familia: "Hijo",
    pais: "Perú",
    fecha_nacimiento: "20/05/2006",
    nivel_estudios: "Educación Primaria ",
    situacion_laboral: "Personas en situación de Precariedad Laboral ",
    otras_caracteristicas: "Sin Hogar",
  };

  it("relacion_db=hijo_a, no parentesco_coerced warning", () => {
    const r = parseRow(son, 9);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.relacion_db).toBe("hijo_a");
    const codes = r.row.warnings.map((w) => w.code);
    expect(codes).not.toContain("parentesco_coerced");
  });

  it("colectivos contains Sin_Hogar", () => {
    const r = parseRow(son, 9);
    if (!r.ok) throw new Error("expected ok");
    expect(r.row.person.metadata.colectivos).toEqual(["Sin_Hogar"]);
  });
});

describe("parseRow — error paths", () => {
  it("missing numero_familia → error", () => {
    const r = parseRow(
      {
        nombre: "X",
        apellidos: "Y",
        cabeza_familia: "x",
      },
      4
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.field).toBe("numero_familia");
  });
  it("missing nombre → error", () => {
    const r = parseRow(
      { numero_familia: "1030", cabeza_familia: "x", apellidos: "Y" },
      4
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.field).toBe("nombre");
  });
  it("missing apellidos → error", () => {
    const r = parseRow(
      { numero_familia: "1030", cabeza_familia: "x", nombre: "X" },
      4
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.field).toBe("apellidos");
  });
  it("invalid email → error", () => {
    const r = parseRow(
      {
        numero_familia: "1030",
        cabeza_familia: "x",
        nombre: "X",
        apellidos: "Y",
        email: "not-an-email",
      },
      4
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.field).toBe("email");
  });
});

describe("CSV_HEADERS", () => {
  it("declares the canonical legacy header order matching the user's CSV", () => {
    expect(CSV_HEADERS).toEqual([
      "NÚMERO DE ORDEN",
      "NUMERO FAMILIA BOCATAS",
      "FECHA ALTA",
      "NOMBRE",
      "APELLIDOS",
      "SEXO",
      "TELEFONO",
      "DNI/NIE/ PASAPORTE",
      "CABEZA DE FAMILIA",
      "PAIS",
      "Fecha Nacimiento",
      "EMAIL",
      "DIRECCION",
      "CODIGO POSTAL",
      "Localidad",
      "NOTAS PARA INFORME SOCIAL",
      "Nivel de estudios finalizados",
      "Situación Laboral",
      "Otras Características",
    ]);
  });
});
