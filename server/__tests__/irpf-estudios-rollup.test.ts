/**
 * irpf-estudios-rollup.test.ts — los valores nuevos de nivel_estudios NO pueden
 * caer en "no_indicado" en el informe al financiador.
 *
 * ALTAS-4 introduce `postsecundaria_no_superior` y `superior` como valores
 * capturables. Son literalmente los buckets que el informe IRPF ya calculaba,
 * así que ESTUDIOS_ROLLUP tiene que mapearlos a sí mismos: si se olvida, cada
 * persona registrada con el desplegable nuevo desaparece de la fila que le toca
 * y engorda "No indicado" — un error silencioso en un informe a financiador.
 */
import { describe, it, expect } from "vitest";
import { bucketRows, type NormalizedMiembroRow } from "../_core/irpfAggregation";

function row(nivel: string | null): NormalizedMiembroRow {
  return {
    fecha_nacimiento: "1990-01-01",
    genero: "femenino",
    nivel_estudios: nivel,
    situacion_laboral: "inactiva",
    pais_origen: "ES",
    colectivos: [],
  };
}

describe("ESTUDIOS_ROLLUP con los valores nuevos", () => {
  it("mantiene 'postsecundaria_no_superior' en su propio bucket", () => {
    const [bucket] = bucketRows([row("postsecundaria_no_superior")], 2026);
    expect(bucket?.nivel_estudios).toBe("postsecundaria_no_superior");
  });

  it("mantiene 'superior' en su propio bucket", () => {
    const [bucket] = bucketRows([row("superior")], 2026);
    expect(bucket?.nivel_estudios).toBe("superior");
  });

  it("sigue agrupando los valores históricos como antes", () => {
    expect(bucketRows([row("bachillerato")], 2026)[0]?.nivel_estudios).toBe(
      "postsecundaria_no_superior"
    );
    expect(bucketRows([row("formacion_profesional")], 2026)[0]?.nivel_estudios).toBe(
      "postsecundaria_no_superior"
    );
    expect(bucketRows([row("universitario")], 2026)[0]?.nivel_estudios).toBe("superior");
    expect(bucketRows([row("postgrado")], 2026)[0]?.nivel_estudios).toBe("superior");
  });

  it("un valor desconocido sigue cayendo en 'no_indicado'", () => {
    expect(bucketRows([row("marciano")], 2026)[0]?.nivel_estudios).toBe("no_indicado");
  });
});
