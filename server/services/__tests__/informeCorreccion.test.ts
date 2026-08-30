/**
 * FAMILIAS-6 — tercer estado del informe social: CORRECCIÓN.
 *
 * Hasta ahora la puerta de seguimiento se disparaba por la mera EXISTENCIA de un
 * informe vigente: generar insertaba la fila, la familia pasaba a "renovación" de
 * forma inmediata y permanente y ya no se podía corregir la valoración sin
 * registrar un seguimiento. Estos tests fijan la regla nueva:
 *
 *   - sin informe previo            → primera_emision  (sin puerta)
 *   - informe previo AL DÍA (<5m)   → correccion       (sin puerta)
 *   - informe previo por renovar    → renovacion       (con puerta de seguimiento)
 */
import { describe, it, expect } from "vitest";

import {
  informeGenerationMode,
  requiereSeguimiento,
} from "@shared/informeFreshness";
import {
  evaluateInformeReadiness,
  type InformeReadinessInput,
} from "../informeEligibility";

/** ISO de hace N días — evita las trampas de fin de mes de setMonth(). */
function isoHaceDias(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10);
}

const RECIENTE = isoHaceDias(30); // < 5 meses → informe al día
const POR_RENOVAR = isoHaceDias(160); // ≥ 5 y < 6 meses
const VENCIDO = isoHaceDias(200); // ≥ 6 meses

describe("informeGenerationMode — los tres estados", () => {
  it("sin informe previo → primera_emision (aunque no haya fecha)", () => {
    expect(informeGenerationMode(false, null)).toBe("primera_emision");
    expect(informeGenerationMode(false, VENCIDO)).toBe("primera_emision");
  });

  it("informe previo al día → correccion", () => {
    expect(informeGenerationMode(true, RECIENTE)).toBe("correccion");
  });

  it("informe previo por renovar o vencido → renovacion", () => {
    expect(informeGenerationMode(true, POR_RENOVAR)).toBe("renovacion");
    expect(informeGenerationMode(true, VENCIDO)).toBe("renovacion");
  });

  it("informe previo sin fecha conocida → renovacion (fail-closed)", () => {
    expect(informeGenerationMode(true, null)).toBe("renovacion");
    expect(informeGenerationMode(true, "")).toBe("renovacion");
  });

  it("solo la renovación exige seguimiento", () => {
    expect(requiereSeguimiento("primera_emision")).toBe(false);
    expect(requiereSeguimiento("correccion")).toBe(false);
    expect(requiereSeguimiento("renovacion")).toBe(true);
  });
});

// ── evaluateInformeReadiness ─────────────────────────────────────────────────

function familia(over: Partial<InformeReadinessInput> = {}): InformeReadinessInput {
  return {
    titular_id: "t-1",
    titular: { nombre: "Ana", apellidos: "García", numero_documento: "X1234567A" },
    situacion_familiar_texto: "Situación descrita.",
    latest_follow_up_fecha: null,
    members: [],
    has_informe_previo: false,
    informe_social_fecha: null,
    ...over,
  };
}

describe("evaluateInformeReadiness — corrección de un informe vigente", () => {
  it("informe al día + SIN seguimiento → READY (es una corrección, no una renovación)", () => {
    const r = evaluateInformeReadiness(
      familia({ has_informe_previo: true, informe_social_fecha: RECIENTE }),
    );
    expect(r).toEqual({ ready: true });
  });

  it("informe al día + seguimiento vencido → READY (la corrección no mira el seguimiento)", () => {
    const r = evaluateInformeReadiness(
      familia({
        has_informe_previo: true,
        informe_social_fecha: RECIENTE,
        latest_follow_up_fecha: isoHaceDias(400),
      }),
    );
    expect(r).toEqual({ ready: true });
  });

  it("informe por renovar + sin seguimiento → SIN_SEGUIMIENTO (la puerta sigue viva)", () => {
    const r = evaluateInformeReadiness(
      familia({ has_informe_previo: true, informe_social_fecha: POR_RENOVAR }),
    );
    expect(r).toEqual({ ready: false, reason: "SIN_SEGUIMIENTO" });
  });

  it("informe vencido + seguimiento vencido → SEGUIMIENTO_VENCIDO", () => {
    const r = evaluateInformeReadiness(
      familia({
        has_informe_previo: true,
        informe_social_fecha: VENCIDO,
        latest_follow_up_fecha: isoHaceDias(400),
      }),
    );
    expect(r).toEqual({ ready: false, reason: "SEGUIMIENTO_VENCIDO" });
  });

  it("informe previo sin fecha → la puerta de renovación se aplica (fail-closed)", () => {
    const r = evaluateInformeReadiness(
      familia({ has_informe_previo: true, informe_social_fecha: null }),
    );
    expect(r).toEqual({ ready: false, reason: "SIN_SEGUIMIENTO" });
  });

  it("una corrección sigue exigiendo la valoración escrita", () => {
    const r = evaluateInformeReadiness(
      familia({
        has_informe_previo: true,
        informe_social_fecha: RECIENTE,
        situacion_familiar_texto: "   ",
      }),
    );
    expect(r).toEqual({ ready: false, reason: "SIN_DESCRIPCION_SITUACION" });
  });

  it("primera emisión sigue sin exigir seguimiento", () => {
    expect(evaluateInformeReadiness(familia())).toEqual({ ready: true });
  });
});
