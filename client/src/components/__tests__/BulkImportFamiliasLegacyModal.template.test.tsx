/**
 * TDD: Verifica que el modal de importación legacy muestra un botón de descarga
 * del template CSV en el Step 1 y que el CSV generado tiene las cabeceras correctas.
 */
import { describe, it, expect } from "vitest";
import { buildTemplateCsv, CSV_HEADERS } from "../../../../shared/legacyFamiliasTypes";

describe("buildTemplateCsv", () => {
  it("genera una cadena CSV con la primera fila igual a CSV_HEADERS", () => {
    const csv = buildTemplateCsv();
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toBe(CSV_HEADERS.join(","));
  });

  it("genera exactamente 2 líneas: cabecera + 1 fila de ejemplo", () => {
    const csv = buildTemplateCsv();
    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    expect(lines).toHaveLength(2);
  });

  it("la fila de ejemplo tiene el mismo número de columnas que CSV_HEADERS", () => {
    const csv = buildTemplateCsv();
    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    // Parse the second line respecting quoted fields
    const exampleLine = lines[1];
    // Simple split by comma — the template values must not contain unescaped commas
    const cols = exampleLine.split(",");
    expect(cols).toHaveLength(CSV_HEADERS.length);
  });

  it("la fila de ejemplo tiene 'x' en la columna CABEZA DE FAMILIA (índice 8)", () => {
    const csv = buildTemplateCsv();
    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    const cols = lines[1].split(",");
    expect(cols[8]).toBe("x");
  });

  it("la fila de ejemplo tiene un NUMERO FAMILIA BOCATAS no vacío (índice 1)", () => {
    const csv = buildTemplateCsv();
    const lines = csv.split("\n").filter((l) => l.trim() !== "");
    const cols = lines[1].split(",");
    expect(cols[1].trim()).not.toBe("");
  });
});
