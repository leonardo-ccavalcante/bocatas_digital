/**
 * situacionLegal.test.ts — "Sin papeles" deja de ofrecerse (feedback ALTAS-2).
 *
 * `situacion_legal` es TEXT en la base (migración 20260411081830), no un enum
 * de Postgres, así que retirarlo es sólo cuestión de esquema y de etiquetas: no
 * hace falta migración y las fichas antiguas que ya lo tengan guardado siguen
 * leyéndose (ResumenTab pinta el valor crudo).
 *
 * Se retira de los DOS lados: el servidor es el único muro real (ADR-0002), el
 * cliente es sólo la lista que ve el voluntario.
 */
import { describe, it, expect } from "vitest";
import { SituacionLegalSchema } from "../enums";
import { SITUACION_LEGAL_LABELS } from "../labels";
import { SituacionLegalEnum } from "../../../../../../server/routers/persons/_shared";

describe("situacion_legal — sin la opción 'sin papeles'", () => {
  it("el esquema de cliente la rechaza", () => {
    expect(SituacionLegalSchema.safeParse("sin_papeles").success).toBe(false);
  });

  it("el esquema de servidor la rechaza", () => {
    expect(SituacionLegalEnum.safeParse("sin_papeles").success).toBe(false);
  });

  it("no aparece en el desplegable", () => {
    // Step2Documento usa el mapa de etiquetas como lista de opciones.
    expect(Object.keys(SITUACION_LEGAL_LABELS)).not.toContain("sin_papeles");
  });

  it("mantiene el resto de situaciones", () => {
    for (const v of ["regular", "irregular", "solicitante_asilo", "en_tramite"]) {
      expect(SituacionLegalSchema.safeParse(v).success).toBe(true);
      expect(SituacionLegalEnum.safeParse(v).success).toBe(true);
      expect(Object.keys(SITUACION_LEGAL_LABELS)).toContain(v);
    }
  });
});
