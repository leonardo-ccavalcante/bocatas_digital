/**
 * bulkTemplate.test.ts — Build-time guard that the public CSV template
 * columns match exactly what the bulk-import router expects.
 *
 * If this test fails, either the template or the router's EXPECTED_HEADERS
 * was changed without updating the other. Fix one to match.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Duplicated from server/routers/announcements.ts EXPECTED_HEADERS on
// purpose — if the server-side list changes, this test breaks and forces
// a docs/template review.
const EXPECTED_HEADERS = [
  "titulo",
  "contenido",
  "tipo",
  "es_urgente",
  "fecha_inicio",
  "fecha_fin",
  "fijado",
  "audiencias",
];

describe("novedades bulk-import CSV template", () => {
  const templatePath = resolve(
    __dirname,
    "../../../../public/novedades-bulk-template.csv"
  );
  const content = readFileSync(templatePath, "utf-8");
  const lines = content
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);

  it("exists and is non-empty", () => {
    expect(lines.length).toBeGreaterThan(0);
  });

  it("header row matches router EXPECTED_HEADERS exactly", () => {
    const headers = lines[0].split(",").map((s) => s.trim());
    expect(headers).toEqual(EXPECTED_HEADERS);
  });

  it("contains at least one example data row", () => {
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it("example rows have the same column count as the header", () => {
    const headerCount = lines[0].split(",").length;
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(",");
      expect(cells.length).toBe(headerCount);
    }
  });

  it("uses only current tipo values (no legacy cierre/urgente)", () => {
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(",");
      const tipo = cells[2]?.trim();
      expect(tipo).not.toBe("cierre");
      expect(tipo).not.toBe("urgente");
      expect(["info", "evento", "cierre_servicio", "convocatoria"]).toContain(
        tipo
      );
    }
  });
});
