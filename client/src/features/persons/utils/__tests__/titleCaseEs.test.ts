/**
 * titleCaseEs — normalización «NOMBRE APELLIDO» → «Nombre Apellido».
 *
 * El OCR devuelve los campos del documento en MAYÚSCULAS
 * (server/routers/ocr.ts no pide caja al modelo). La normalización vive UNA
 * vez, en el volcado al formulario; estas pruebas cubren la función pura
 * sin montar React.
 */
import { describe, it, expect } from "vitest";
import { titleCaseEs } from "../titleCaseEs";

describe("titleCaseEs", () => {
  it("capitaliza cada palabra de un nombre en mayúsculas", () => {
    expect(titleCaseEs("MOHAMED EL AMIN")).toBe("Mohamed El Amin");
    expect(titleCaseEs("FATIMA")).toBe("Fatima");
  });

  it("mantiene las partículas en minúscula cuando no abren el nombre", () => {
    expect(titleCaseEs("MARÍA DEL CARMEN")).toBe("María del Carmen");
    expect(titleCaseEs("GARCÍA Y VEGA")).toBe("García y Vega");
    expect(titleCaseEs("JOÃO DOS SANTOS")).toBe("João dos Santos");
    expect(titleCaseEs("LUDWIG VAN BEETHOVEN")).toBe("Ludwig van Beethoven");
    expect(titleCaseEs("MOHAMED BIN SALMAN")).toBe("Mohamed bin Salman");
  });

  it("capitaliza la partícula cuando abre el apellido", () => {
    expect(titleCaseEs("DE LA CRUZ")).toBe("De la Cruz");
    expect(titleCaseEs("DEL RÍO")).toBe("Del Río");
  });

  it("respeta los acentos al bajar y subir de caja", () => {
    expect(titleCaseEs("ÁLVARO")).toBe("Álvaro");
    expect(titleCaseEs("IÑAKI ECHEVERRÍA")).toBe("Iñaki Echeverría");
  });

  it("capitaliza tras apóstrofo y tras guion", () => {
    expect(titleCaseEs("D'ANGELO")).toBe("D'Angelo");
    expect(titleCaseEs("O'BRIEN")).toBe("O'Brien");
    expect(titleCaseEs("ANNE-MARIE")).toBe("Anne-Marie");
    expect(titleCaseEs("JEAN-PIERRE DUPONT")).toBe("Jean-Pierre Dupont");
  });

  it("recorta y colapsa espacios múltiples", () => {
    expect(titleCaseEs("  JUAN   CARLOS  ")).toBe("Juan Carlos");
  });

  it("normaliza siempre, también entradas mixtas o en minúscula (determinista)", () => {
    expect(titleCaseEs("josé maría")).toBe("José María");
    expect(titleCaseEs("MiXeD dE lOs REYES")).toBe("Mixed de los Reyes");
  });

  it("es idempotente", () => {
    expect(titleCaseEs(titleCaseEs("MARÍA DEL CARMEN"))).toBe("María del Carmen");
    expect(titleCaseEs(titleCaseEs("D'ANGELO"))).toBe("D'Angelo");
  });

  it("devuelve cadena vacía para vacío, nulo o indefinido", () => {
    expect(titleCaseEs("")).toBe("");
    expect(titleCaseEs("   ")).toBe("");
    expect(titleCaseEs(null)).toBe("");
    expect(titleCaseEs(undefined)).toBe("");
  });
});
