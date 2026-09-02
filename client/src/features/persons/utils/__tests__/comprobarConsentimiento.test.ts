/**
 * comprobarConsentimiento.test.ts — la lista pegada se trocea aquí, no en el
 * componente: es lo único del diálogo que puede equivocarse en silencio.
 */
import { describe, it, expect } from "vitest";
import { parsearNombres, MAX_NOMBRES } from "../comprobarConsentimiento";

describe("parsearNombres", () => {
  it("una línea es un nombre, sin vacías ni espacios de sobra", () => {
    expect(parsearNombres("  Ana García \n\n José Núñez\n")).toEqual([
      "Ana García",
      "José Núñez",
    ]);
  });

  it("no repite el mismo nombre pegado dos veces", () => {
    expect(parsearNombres("Ana García\nana garcía")).toEqual(["Ana García"]);
  });

  it("corta en el tope que acepta el servidor", () => {
    const texto = Array.from({ length: MAX_NOMBRES + 20 }, (_, i) => `Persona ${i}`).join("\n");
    expect(parsearNombres(texto)).toHaveLength(MAX_NOMBRES);
  });

  it("un texto en blanco no produce ninguna consulta", () => {
    expect(parsearNombres("   \n\n ")).toEqual([]);
  });
});
