import { describe, it, expect } from "vitest";
import { computeDeliveryRow } from "../notaEntregaComputer";

const BASE_FAMILY = {
  familia_numero: 42,
  titular_nombre: "María",
  titular_apellidos: "García López",
  titular_documento: "X1234567A",
  titular_telefono: "600000000",
  num_adultos: 2,
  num_menores_18: 1,
  fecha: "2026-05-20",
};

const RATES = {
  per_member_rate_fyh: 3.0,
  per_member_rate_carne: 2.5,
  per_member_rate_infantil: 1.5,
  per_member_rate_unidades: 1,
};

describe("computeDeliveryRow", () => {
  it("computes kg correctly for 2 adults + 1 minor", () => {
    const row = computeDeliveryRow(BASE_FAMILY, RATES);
    const total = 2 + 1; // 3 total
    expect(row.kg_frutas_hortalizas).toBe(RATES.per_member_rate_fyh * total); // 9.0
    expect(row.kg_carne).toBe(RATES.per_member_rate_carne * total); // 7.5
    expect(row.kg_infantil).toBe(RATES.per_member_rate_infantil * BASE_FAMILY.num_menores_18); // 1.5
    expect(row.unidades_no_alimentacion).toBe(RATES.per_member_rate_unidades * total); // 3
  });

  it("formats familia numero with zero-padding", () => {
    const row = computeDeliveryRow(BASE_FAMILY, RATES);
    expect(row.numero_expediente).toBe("0042");
  });

  it("leaves FIRMA blank (empty string)", () => {
    const row = computeDeliveryRow(BASE_FAMILY, RATES);
    // Docxtemplater renders empty string as blank cell — FIRMA is not a computed field
    expect("firma" in row).toBe(false);
  });

  it("throws if per_member_rate_fyh is negative", () => {
    expect(() =>
      computeDeliveryRow(BASE_FAMILY, { ...RATES, per_member_rate_fyh: -1 })
    ).toThrow("per_member_rate_fyh must be non-negative");
  });
});
