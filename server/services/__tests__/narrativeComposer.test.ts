import { describe, it, expect } from "vitest";
import { composeSituacionFamiliar, type NarrativeInput } from "../narrativeComposer";

const FULL: NarrativeInput = {
  familia: { num_adultos: 2, num_menores_18: 3, distrito: "Tetuán" },
  titular: {
    pais_origen: "PE",
    fecha_llegada_espana: "2019-06-01",
    tipo_vivienda: "piso_compartido_alquiler",
    situacion_laboral: "economia_informal",
    nivel_ingresos: "menos_500",
    nivel_estudios: "secundaria",
    empadronado: true,
    necesidades_principales: "Apoyo alimentario",
  },
  followUps: [
    { fecha: "2026-01-10", notas: "Primera entrevista" },
    { fecha: "2026-05-02", notas: "Revisión de situación" },
  ],
};

describe("composeSituacionFamiliar", () => {
  it("merges family composition, titular situation, and follow-ups into Spanish prose", () => {
    const out = composeSituacionFamiliar(FULL);
    expect(out).toContain("2 personas adultas");
    expect(out).toContain("3 menores");
    expect(out).toContain("distrito de Tetuán");
    expect(out).toContain("Perú"); // ISO-2 PE → Spanish
    expect(out).toContain("01/06/2019"); // fecha_llegada formatted, tz-safe
    expect(out).toContain("piso compartido");
    expect(out).toContain("economía informal");
    expect(out).toContain("menos de 500€");
    expect(out).toContain("estudios secundarios");
    expect(out).toContain("empadronada");
    expect(out).toContain("Apoyo alimentario");
    // follow-ups, most-recent first
    expect(out).toContain("Seguimiento del proceso:");
    expect(out).toContain("02/05/2026: Revisión de situación");
    expect(out.indexOf("02/05/2026")).toBeLessThan(out.indexOf("10/01/2026"));
  });

  it("does NOT emit dietary restrictions (off-script — handled by the fixed boilerplate)", () => {
    const out = composeSituacionFamiliar({
      ...FULL,
      // @ts-expect-error — restricciones_alimentarias is intentionally not part of
      // NarrativeInput; even if a caller smuggles it in, it must never surface.
      titular: { ...FULL.titular, restricciones_alimentarias: "Sin gluten" },
    });
    expect(out).not.toMatch(/gluten/i);
    expect(out).not.toMatch(/restricci/i);
  });

  it("deduplicates identical follow-ups (same date + note collapse to one line)", () => {
    const out = composeSituacionFamiliar({
      ...FULL,
      followUps: Array.from({ length: 6 }, () => ({
        fecha: "2026-07-07",
        notas: "Entrevista de prueba",
      })),
    });
    const occurrences = out.split("07/07/2026").length - 1;
    expect(occurrences).toBe(1); // 6 identical → exactly one line
  });

  it("keeps at most the 5 most recent distinct follow-ups", () => {
    const out = composeSituacionFamiliar({
      ...FULL,
      followUps: Array.from({ length: 8 }, (_, i) => ({
        // 2026-01-01 … 2026-01-08, all distinct
        fecha: `2026-01-0${i + 1}`,
        notas: `Nota ${i + 1}`,
      })),
    });
    const bulletCount = out.split("\n").filter((l) => l.startsWith("- ")).length;
    expect(bulletCount).toBe(5);
    expect(out).toContain("Nota 8"); // most recent kept
    expect(out).not.toContain("Nota 1"); // oldest dropped
  });

  it("does not double-punctuate free-text notes already ending in a period", () => {
    const out = composeSituacionFamiliar({
      ...FULL,
      titular: { ...FULL.titular, necesidades_principales: "Apoyo alimentario." },
    });
    expect(out).not.toMatch(/\.\./); // no ".." anywhere
    expect(out).toContain("Apoyo alimentario.");
  });

  it("never emits the interviewer's internal observaciones (not for an official document)", () => {
    const out = composeSituacionFamiliar({
      ...FULL,
      // @ts-expect-error — observaciones is intentionally not part of NarrativeInput;
      // even if a caller smuggles it in, it must never reach the official document.
      titular: { ...FULL.titular, observaciones: "NOTA_INTERNA_ENTREVISTADOR" },
    });
    expect(out).not.toContain("NOTA_INTERNA_ENTREVISTADOR");
    expect(out).not.toMatch(/observaci/i);
  });

  it("includes a 'Cambios desde el último informe' block when changes are provided", () => {
    const out = composeSituacionFamiliar({
      ...FULL,
      cambios: [
        { campo: "Empleo", antes: "desempleo", ahora: "empleo temporal" },
        { campo: "Vivienda", antes: "piso compartido en alquiler", ahora: "vivienda en propiedad" },
      ],
      ultimoInformeFecha: "2026-01-08",
    });
    expect(out).toContain("Cambios desde el último informe (08/01/2026):");
    expect(out).toContain("- Empleo: desempleo → empleo temporal");
    expect(out).toContain("- Vivienda: piso compartido en alquiler → vivienda en propiedad");
    // ordering: situación · cambios · seguimientos
    expect(out.indexOf("procede de")).toBeLessThan(out.indexOf("Cambios desde"));
    expect(out.indexOf("Cambios desde")).toBeLessThan(out.indexOf("Seguimiento del proceso"));
  });

  it("omits the cambios block when there are no changes", () => {
    const out = composeSituacionFamiliar({ ...FULL, cambios: [] });
    expect(out).not.toContain("Cambios desde el último informe");
  });

  it("is deterministic (same input → identical output)", () => {
    expect(composeSituacionFamiliar(FULL)).toBe(composeSituacionFamiliar(FULL));
  });

  it("skips missing clauses without emitting undefined/null/NaN", () => {
    const out = composeSituacionFamiliar({
      familia: { num_adultos: 1, num_menores_18: 0, distrito: null },
      titular: {
        pais_origen: null,
        fecha_llegada_espana: null,
        tipo_vivienda: null,
        situacion_laboral: null,
        nivel_ingresos: null,
        nivel_estudios: null,
        empadronado: null,
        necesidades_principales: null,
      },
      followUps: [],
    });
    expect(out).toContain("1 persona adulta");
    expect(out).not.toMatch(/undefined|null|NaN/);
    expect(out).not.toContain("Seguimiento del proceso:"); // no follow-ups → no block
  });

  it("handles an unknown country code gracefully (no crash, still emits the clause)", () => {
    const out = composeSituacionFamiliar({
      ...FULL,
      titular: { ...FULL.titular, pais_origen: "zz" },
    });
    expect(out).toMatch(/procede de \S/);
    expect(out).not.toMatch(/undefined|null|NaN/);
  });

  it("ignores follow-ups with empty notes", () => {
    const out = composeSituacionFamiliar({
      ...FULL,
      followUps: [{ fecha: "2026-05-02", notas: "   " }, { fecha: "2026-01-10", notas: null }],
    });
    expect(out).not.toContain("Seguimiento del proceso:");
  });
});
