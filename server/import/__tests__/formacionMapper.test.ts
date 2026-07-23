/**
 * formacionMapper.test.ts — mapping Notion fichas onto the ADR-0013 program
 * tree. ALL fixture people are SYNTHETIC (invented names/documents).
 */
import { describe, it, expect } from "vitest";
import type { Ficha } from "../notionFicha";
import { mapFormacion } from "../formacionMapper";

function makeFicha(overrides: Partial<Ficha>): Ficha {
  return {
    titulo: "Pruebas, Ana",
    nombre: "Ana",
    apellidos: "PRUEBAS",
    tipoDoc: "NIE",
    numeroDoc: "X0000000T",
    campos: {},
    cursoTokens: [],
    tallerTokens: [],
    ...overrides,
  };
}

describe("edition token grammar", () => {
  it("maps '2025/09 ESP' to curso clases_espanol + edition esp_2025_09", () => {
    const plan = mapFormacion([makeFicha({ cursoTokens: ["2025/09 ESP"] })]);
    expect(plan.cursos).toEqual([
      {
        slug: "clases_espanol",
        name: "Clases de Español",
        tipo: "curso",
        parentSlug: "formacion",
        etiquetas: ["espanol"],
      },
    ]);
    expect(plan.ediciones).toEqual([
      {
        slug: "esp_2025_09",
        name: "2025/09 ESP",
        tipo: "edicion",
        parentSlug: "clases_espanol",
        etiquetas: [],
      },
    ]);
    expect(plan.enrollments).toHaveLength(1);
    expect(plan.enrollments[0]).toMatchObject({
      editionSlug: "esp_2025_09",
      estado: "inscrito",
    });
    expect(plan.unmapped).toEqual([]);
  });

  it("maps all four curso codes to their catalog entries", () => {
    const plan = mapFormacion([
      makeFicha({
        cursoTokens: ["2025/09 ESP", "2025/04 CAM", "2026/01 COC", "2026/02 PAN"],
      }),
    ]);
    const bySlug = Object.fromEntries(plan.cursos.map((c) => [c.slug, c.name]));
    expect(bySlug).toEqual({
      clases_espanol: "Clases de Español",
      curso_camarero: "Curso de Camarero",
      curso_cocina: "Curso de Cocina",
      curso_panaderia: "Curso de Panadería y Repostería",
    });
    expect(plan.ediciones.map((e) => e.slug).sort()).toEqual([
      "cam_2025_04",
      "coc_2026_01",
      "esp_2025_09",
      "pan_2026_02",
    ]);
  });

  it("recognizes the L.Espera suffix → estado lista_espera, name keeps only the base token", () => {
    const plan = mapFormacion([makeFicha({ cursoTokens: ["2026/01 ESP L.Espera"] })]);
    expect(plan.ediciones[0]).toMatchObject({ slug: "esp_2026_01", name: "2026/01 ESP" });
    expect(plan.enrollments[0]).toMatchObject({
      editionSlug: "esp_2026_01",
      estado: "lista_espera",
    });
  });

  it("collects non-matching tokens as unmapped with the person ref — never guesses", () => {
    const plan = mapFormacion([
      makeFicha({ cursoTokens: ["Español Satelites", "III/26", "2025/09 ESP"] }),
    ]);
    expect(plan.unmapped).toHaveLength(2);
    expect(plan.unmapped.map((u) => u.token).sort()).toEqual(["Español Satelites", "III/26"]);
    expect(plan.unmapped[0].person.numeroDoc).toBe("X0000000T");
    // the valid token still maps
    expect(plan.enrollments).toHaveLength(1);
  });

  it("dedupes curso/edition nodes across fichas", () => {
    const plan = mapFormacion([
      makeFicha({ cursoTokens: ["2025/09 ESP"] }),
      makeFicha({
        titulo: "Ensayo, Luis",
        nombre: "Luis",
        apellidos: "ENSAYO",
        numeroDoc: "Y0000000Z",
        cursoTokens: ["2025/09 ESP"],
      }),
    ]);
    expect(plan.cursos).toHaveLength(1);
    expect(plan.ediciones).toHaveLength(1);
    expect(plan.enrollments).toHaveLength(2);
  });
});

describe("estado refinement (person-level fields)", () => {
  it("'Estado Curso Español: Baja' refines ONLY the most recent ESP edition, with motivo", () => {
    const plan = mapFormacion([
      makeFicha({
        cursoTokens: ["2025/09 ESP", "2026/01 ESP L.Espera"],
        campos: { "Estado Curso Español": "Baja" },
      }),
    ]);
    const byEdition = Object.fromEntries(plan.enrollments.map((e) => [e.editionSlug, e]));
    expect(byEdition["esp_2025_09"]).toMatchObject({ estado: "inscrito" });
    expect(byEdition["esp_2026_01"]).toMatchObject({
      estado: "baja",
      motivoBaja: "importado de Notion",
    });
  });

  it("'Estado Curso Español: Admitido' → admitido on the most recent ESP edition", () => {
    const plan = mapFormacion([
      makeFicha({
        cursoTokens: ["2025/09 ESP"],
        campos: { "Estado Curso Español": "Admitido" },
      }),
    ]);
    expect(plan.enrollments[0]).toMatchObject({ estado: "admitido" });
    expect(plan.enrollments[0].motivoBaja).toBeUndefined();
  });

  it("'Estado Curso Camarero' supports Terminado / Preseleccionado / Baja", () => {
    const terminado = mapFormacion([
      makeFicha({ cursoTokens: ["2025/04 CAM"], campos: { "Estado Curso Camarero": "Terminado" } }),
    ]);
    expect(terminado.enrollments[0]).toMatchObject({ estado: "terminado" });

    const presel = mapFormacion([
      makeFicha({
        cursoTokens: ["2025/04 CAM"],
        campos: { "Estado Curso Camarero": "Preseleccionado" },
      }),
    ]);
    expect(presel.enrollments[0]).toMatchObject({ estado: "preseleccionado" });

    const baja = mapFormacion([
      makeFicha({ cursoTokens: ["2025/04 CAM"], campos: { "Estado Curso Camarero": "Baja" } }),
    ]);
    expect(baja.enrollments[0]).toMatchObject({
      estado: "baja",
      motivoBaja: "importado de Notion",
    });
  });

  it("estado refinement does not touch editions of OTHER cursos", () => {
    const plan = mapFormacion([
      makeFicha({
        cursoTokens: ["2025/09 ESP", "2025/04 CAM"],
        campos: { "Estado Curso Español": "Baja" },
      }),
    ]);
    const byEdition = Object.fromEntries(plan.enrollments.map((e) => [e.editionSlug, e]));
    expect(byEdition["cam_2025_04"]).toMatchObject({ estado: "inscrito" });
    expect(byEdition["esp_2025_09"]).toMatchObject({ estado: "baja" });
  });

  it("unrecognized estado value → warning, base estado kept (never guessed)", () => {
    const plan = mapFormacion([
      makeFicha({
        cursoTokens: ["2025/09 ESP"],
        campos: { "Estado Curso Español": "Nivel intergaláctico" },
      }),
    ]);
    expect(plan.enrollments[0]).toMatchObject({ estado: "inscrito" });
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it("estado field with no matching editions → warning, nothing refined", () => {
    const plan = mapFormacion([
      makeFicha({ cursoTokens: [], campos: { "Estado Curso Español": "Baja" } }),
    ]);
    expect(plan.enrollments).toEqual([]);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});

describe("GRUPO (ESPAÑOL) metadata", () => {
  it("attaches { grupo } metadata to the most recent ESP edition only", () => {
    const plan = mapFormacion([
      makeFicha({
        cursoTokens: ["2025/09 ESP", "2026/01 ESP L.Espera"],
        campos: { "GRUPO (ESPAÑOL)": "Bajo" },
      }),
    ]);
    const byEdition = Object.fromEntries(plan.enrollments.map((e) => [e.editionSlug, e]));
    expect(byEdition["esp_2026_01"].metadata).toEqual({ grupo: "Bajo" });
    expect(byEdition["esp_2025_09"].metadata).toBeUndefined();
  });

  it("grupo without any ESP edition → warning", () => {
    const plan = mapFormacion([
      makeFicha({ cursoTokens: ["2025/04 CAM"], campos: { "GRUPO (ESPAÑOL)": "Alto" } }),
    ]);
    expect(plan.enrollments[0].metadata).toBeUndefined();
    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});

describe("duplicate tokens for the same person", () => {
  it("emits one enrollment per (person, edition) and warns on the duplicate", () => {
    const plan = mapFormacion([
      makeFicha({ cursoTokens: ["2025/09 ESP", "2025/09 ESP"] }),
    ]);
    expect(plan.enrollments).toHaveLength(1);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });
});
