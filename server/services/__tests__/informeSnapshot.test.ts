import { describe, it, expect } from "vitest";
import {
  computeSituacionChanges,
  lastSnapshot,
  appendHistorial,
  getInformeHistorial,
  type SituacionSnapshot,
} from "../informeSnapshot";

const BASE: SituacionSnapshot = {
  tipo_vivienda: "piso_compartido_alquiler",
  situacion_laboral: "desempleado",
  nivel_ingresos: "sin_ingresos",
  nivel_estudios: "secundaria",
  empadronado: false,
  direccion: "Calle A 1",
  num_adultos: 1,
  num_menores_18: 1,
};

describe("computeSituacionChanges", () => {
  it("returns [] with no previous snapshot (first informe)", () => {
    expect(computeSituacionChanges(null, BASE)).toEqual([]);
  });

  it("returns [] when nothing changed", () => {
    expect(computeSituacionChanges(BASE, { ...BASE })).toEqual([]);
  });

  it("detects empleo / vivienda / empadronamiento changes with Spanish labels", () => {
    const curr: SituacionSnapshot = {
      ...BASE,
      situacion_laboral: "empleo_temporal",
      tipo_vivienda: "piso_propio_propiedad",
      empadronado: true,
    };
    const byCampo = Object.fromEntries(
      computeSituacionChanges(BASE, curr).map((c) => [c.campo, `${c.antes} → ${c.ahora}`]),
    );
    expect(byCampo["Empleo"]).toBe("desempleo → empleo temporal");
    expect(byCampo["Vivienda"]).toBe("piso compartido en alquiler → vivienda en propiedad");
    expect(byCampo["Empadronamiento"]).toBe("No → Sí");
  });

  it("renders — when a value becomes null", () => {
    const c = computeSituacionChanges(BASE, { ...BASE, situacion_laboral: null });
    expect(c).toEqual([{ campo: "Empleo", antes: "desempleo", ahora: "—" }]);
  });
});

describe("informe_historial helpers", () => {
  it("appends entries and reads the most recent snapshot", () => {
    const curr: SituacionSnapshot = { ...BASE, situacion_laboral: "empleo_temporal" };
    const m1 = appendHistorial({}, { fecha: "2026-01-08", situacion: BASE, cambios: [] });
    const m2 = appendHistorial(m1, { fecha: "2026-07-08", situacion: curr, cambios: [] });
    expect(getInformeHistorial(m2)).toHaveLength(2);
    expect(lastSnapshot(m2)).toEqual(curr);
  });

  it("preserves other metadata keys", () => {
    const m = appendHistorial({ foo: "bar" }, { fecha: "2026-07-08", situacion: BASE, cambios: [] });
    expect(m.foo).toBe("bar");
  });

  it("lastSnapshot is null with no history", () => {
    expect(lastSnapshot({})).toBeNull();
    expect(lastSnapshot(null)).toBeNull();
  });
});
