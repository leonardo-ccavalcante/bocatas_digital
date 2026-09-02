/**
 * canalLlegada.test.ts — canal «Bocatas» y motivo del retorno (reunión 31-08).
 *
 * Dos contratos:
 *   · el VALOR del enum `retorno_bocatas` no cambia — fichas antiguas y
 *     estadísticas dependen de él; sólo cambia la ETIQUETA, que pasa de
 *     «Retorno Bocatas» a «Bocatas».
 *   · `motivo_retorno` existe como columna desde 20260411081830 pero ninguna
 *     capa lo recogía. Entra en el esquema del alta (paso 0) como texto
 *     opcional de hasta 500 caracteres.
 */
import { describe, it, expect } from "vitest";
import { CanalLlegadaSchema } from "../enums";
import { CANAL_LLEGADA_LABELS } from "../labels";
import { PersonCreateSchema, Step0Schema } from "../personCreate";

const ALTA_MINIMA = {
  canal_llegada: "retorno_bocatas",
  nombre: "Ana",
  apellidos: "García",
  fecha_nacimiento: "1990-01-01",
  idioma_principal: "es",
  program_ids: [],
} as const;

describe("canal de llegada «Bocatas» (retorno)", () => {
  it("se presenta como «Bocatas», no «Retorno Bocatas»", () => {
    expect(CANAL_LLEGADA_LABELS.retorno_bocatas).toBe("Bocatas");
  });

  it("el valor del enum sigue siendo retorno_bocatas — fichas antiguas dependen", () => {
    expect(CanalLlegadaSchema.safeParse("retorno_bocatas").success).toBe(true);
  });

  it("el alta acepta y CONSERVA motivo_retorno", () => {
    const parsed = PersonCreateSchema.parse({
      ...ALTA_MINIMA,
      motivo_retorno: "Vuelve tras seis meses fuera de Madrid",
    });
    expect(parsed.motivo_retorno).toBe("Vuelve tras seis meses fuera de Madrid");
  });

  it("motivo_retorno es opcional y limita a 500 caracteres", () => {
    expect(PersonCreateSchema.safeParse(ALTA_MINIMA).success).toBe(true);
    expect(
      PersonCreateSchema.safeParse({ ...ALTA_MINIMA, motivo_retorno: "x".repeat(501) }).success
    ).toBe(false);
  });

  it("el paso 0 valida motivo_retorno junto al canal", () => {
    expect(Object.keys(Step0Schema.shape)).toContain("motivo_retorno");
  });
});
