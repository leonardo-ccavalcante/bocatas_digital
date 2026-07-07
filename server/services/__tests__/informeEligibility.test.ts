import { describe, it, expect } from "vitest";
import { evaluateInformeReadiness, type InformeReadinessInput } from "../informeEligibility";

const RECENT = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
const OLD = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);

function base(): InformeReadinessInput {
  return {
    titular_id: "t-1",
    titular: { nombre: "María", apellidos: "García", numero_documento: "X1" },
    situacion_familiar_texto: "Situación de la familia.",
    latest_follow_up_fecha: RECENT,
    members: [{ nombre: "Ahmed", apellidos: "García", fecha_nacimiento: "2015-01-01" }],
  };
}

describe("evaluateInformeReadiness — ordered skip ladder", () => {
  it("returns READY when every required datum is present and seguimiento is fresh", () => {
    expect(evaluateInformeReadiness(base())).toEqual({ ready: true });
  });

  it("SIN_TITULAR when titular_id is null", () => {
    expect(evaluateInformeReadiness({ ...base(), titular_id: null })).toEqual({
      ready: false,
      reason: "SIN_TITULAR",
    });
  });

  it("TITULAR_DATOS_INCOMPLETOS when documento is blank", () => {
    expect(
      evaluateInformeReadiness({ ...base(), titular: { nombre: "M", apellidos: "G", numero_documento: "  " } }),
    ).toEqual({ ready: false, reason: "TITULAR_DATOS_INCOMPLETOS" });
  });

  it("SIN_SEGUIMIENTO when there is no follow-up", () => {
    expect(evaluateInformeReadiness({ ...base(), latest_follow_up_fecha: null })).toEqual({
      ready: false,
      reason: "SIN_SEGUIMIENTO",
    });
  });

  it("SEGUIMIENTO_VENCIDO when the last follow-up is >365 days old", () => {
    expect(evaluateInformeReadiness({ ...base(), latest_follow_up_fecha: OLD })).toEqual({
      ready: false,
      reason: "SEGUIMIENTO_VENCIDO",
    });
  });

  it("SIN_DESCRIPCION_SITUACION when the valoración narrative is empty", () => {
    expect(evaluateInformeReadiness({ ...base(), situacion_familiar_texto: "   " })).toEqual({
      ready: false,
      reason: "SIN_DESCRIPCION_SITUACION",
    });
  });

  it("MIEMBRO_DATOS_INCOMPLETOS when a member is missing a birth date", () => {
    expect(
      evaluateInformeReadiness({
        ...base(),
        members: [{ nombre: "Ahmed", apellidos: "García", fecha_nacimiento: null }],
      }),
    ).toEqual({ ready: false, reason: "MIEMBRO_DATOS_INCOMPLETOS" });
  });

  it("is READY for a titular-only family (no members)", () => {
    expect(evaluateInformeReadiness({ ...base(), members: [] })).toEqual({ ready: true });
  });

  it("reports the MOST FUNDAMENTAL defect first (titular before seguimiento)", () => {
    // Both titular missing AND no seguimiento → SIN_TITULAR wins.
    expect(
      evaluateInformeReadiness({ ...base(), titular_id: null, latest_follow_up_fecha: null }),
    ).toEqual({ ready: false, reason: "SIN_TITULAR" });
  });
});
