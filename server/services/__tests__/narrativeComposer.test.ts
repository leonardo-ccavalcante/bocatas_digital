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
    observaciones: "Familia colaboradora",
    necesidades_principales: "Apoyo alimentario",
    restricciones_alimentarias: "Sin cerdo",
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
    expect(out).toContain("Sin cerdo");
    expect(out).toContain("Familia colaboradora");
    // follow-ups, most-recent first
    expect(out).toContain("Seguimiento:");
    expect(out).toContain("02/05/2026: Revisión de situación");
    expect(out.indexOf("02/05/2026")).toBeLessThan(out.indexOf("10/01/2026"));
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
        observaciones: null,
        necesidades_principales: null,
        restricciones_alimentarias: null,
      },
      followUps: [],
    });
    expect(out).toContain("1 persona adulta");
    expect(out).not.toMatch(/undefined|null|NaN/);
    expect(out).not.toContain("Seguimiento:"); // no follow-ups → no block
  });

  it("handles an unknown country code gracefully (no crash, still emits the clause)", () => {
    const out = composeSituacionFamiliar({
      ...FULL,
      titular: { ...FULL.titular, pais_origen: "zz" },
    });
    expect(out).toMatch(/nacionalidad \S/);
    expect(out).not.toMatch(/undefined|null|NaN/);
  });

  it("ignores follow-ups with empty notes", () => {
    const out = composeSituacionFamiliar({
      ...FULL,
      followUps: [{ fecha: "2026-05-02", notas: "   " }, { fecha: "2026-01-10", notas: null }],
    });
    expect(out).not.toContain("Seguimiento:");
  });
});
