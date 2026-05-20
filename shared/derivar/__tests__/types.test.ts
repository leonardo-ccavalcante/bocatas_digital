import { describe, expect, it } from "vitest";

import {
  InterventionInsertSchema,
  InstitucionCreateSchema,
  StartInterventionResultSchema,
} from "../types";

const validIntervention = {
  scope: "persona" as const,
  entityId: "11111111-1111-4111-8111-111111111111",
  programaId: "22222222-2222-4222-8222-222222222222",
  fecha: "2026-05-20",
  tipoSlug: "salud",
  descripcion: "Derivación a Médicos del Mundo",
};

describe("InterventionInsertSchema", () => {
  it("accepts a well-formed intervention", () => {
    expect(InterventionInsertSchema.safeParse(validIntervention).success).toBe(true);
  });

  it("rejects an empty descripcion", () => {
    const r = InterventionInsertSchema.safeParse({ ...validIntervention, descripcion: "" });
    expect(r.success).toBe(false);
  });

  it("rejects a descripcion over 2000 chars", () => {
    const r = InterventionInsertSchema.safeParse({
      ...validIntervention,
      descripcion: "x".repeat(2001),
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-ISO fecha", () => {
    const r = InterventionInsertSchema.safeParse({ ...validIntervention, fecha: "20/05/2026" });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown scope", () => {
    const r = InterventionInsertSchema.safeParse({ ...validIntervention, scope: "barrio" });
    expect(r.success).toBe(false);
  });
});

describe("InstitucionCreateSchema", () => {
  it("rejects a codigo_postal that is not 5 digits", () => {
    expect(InstitucionCreateSchema.safeParse({ nombre: "Cruz Roja", codigo_postal: "280" }).success).toBe(
      false,
    );
  });

  it("accepts a valid 5-digit codigo_postal", () => {
    expect(
      InstitucionCreateSchema.safeParse({ nombre: "Cruz Roja", codigo_postal: "28012" }).success,
    ).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(InstitucionCreateSchema.safeParse({ nombre: "Cruz Roja", email: "not-an-email" }).success).toBe(
      false,
    );
  });

  it("defaults areas to an empty array when omitted", () => {
    const r = InstitucionCreateSchema.parse({ nombre: "Cruz Roja" });
    expect(r.areas).toEqual([]);
  });
});

describe("StartInterventionResultSchema", () => {
  it("allows a null hoja id (hoja created on first intervention insert)", () => {
    const r = StartInterventionResultSchema.safeParse({
      hoja: { id: null, fechaApertura: "2026-05-20", estado: "new" },
      header: {
        nombre: "Raúl Uzcategui",
        numUnidadFamiliar: "2422",
        programaNombre: "Programa de Familia",
        profesionalNombre: "Sole",
        fechaAperturaISO: "2026-05-20",
      },
      defaults: { fechaISO: "2026-05-20", tipoSlug: null, descripcion: null, observaciones: null },
    });
    expect(r.success).toBe(true);
  });
});
