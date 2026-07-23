/**
 * reportFormat.test.ts — the stdout summary must never leak PII beyond
 * "Apellidos, N." initials. SYNTHETIC people only.
 */
import { describe, it, expect } from "vitest";
import type { ImportReport } from "../importRunner";
import { formatSummary } from "../reportFormat";

const PERSON = {
  titulo: "Pruebas, Anabel",
  nombre: "Anabel",
  apellidos: "PRUEBAS",
  numeroDoc: "X0000000T",
};

const REPORT: ImportReport = {
  mode: "dry-run",
  generatedAt: "2026-07-23T00:00:00.000Z",
  nodesToCreate: { cursos: [], ediciones: [] },
  existingNodeSlugs: ["formacion"],
  enrollmentsToCreate: [
    { person: PERSON, editionSlug: "esp_2025_09", estado: "inscrito", personId: "p1" },
  ],
  unmatched: [{ person: PERSON, reason: "persona_no_encontrada", editionSlugs: ["esp_2025_09"] }],
  unmapped: [{ person: PERSON, token: "III/26" }],
  estadoDistribution: { inscrito: 1 },
  warnings: [],
  errors: [],
  applied: null,
};

describe("formatSummary", () => {
  const summary = formatSummary(REPORT, 1);

  it("prints counts and the mode", () => {
    expect(summary).toContain("dry-run");
    expect(summary).toContain("Fichas leídas:");
    expect(summary).toContain("inscrito");
  });

  it("lists people ONLY as 'Apellidos, N.' initials", () => {
    expect(summary).toContain("PRUEBAS, A.");
    expect(summary).not.toContain("Anabel");
  });

  it("never prints document numbers", () => {
    expect(summary).not.toContain("X0000000T");
  });

  it("lists unmapped tokens verbatim", () => {
    expect(summary).toContain('"III/26"');
  });
});
