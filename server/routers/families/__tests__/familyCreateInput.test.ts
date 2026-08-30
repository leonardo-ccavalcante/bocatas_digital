import { describe, it, expect } from "vitest";
import { FamilyCreateInputSchema } from "../_shared";

const BASE = {
  titular_id: "550e8400-e29b-41d4-a716-446655440000",
  num_adultos: 1,
  num_menores_18: 0,
  program_id: "550e8400-e29b-41d4-a716-446655440001",
  // Obligatorios desde FAMILIAS-5. Van en BASE para que estos casos sigan
  // midiendo sólo la regla de persona_recoge.
  informe_social: true,
  informe_social_fecha: "2026-08-30",
};

describe("families.create input — persona_recoge conditional on autorizado (F158/F190)", () => {
  it("accepts autorizado=false with persona_recoge '' (what IntakeWizard submits for the default household)", () => {
    expect(FamilyCreateInputSchema.safeParse({ ...BASE, autorizado: false, persona_recoge: "" }).success).toBe(true);
  });

  it("accepts autorizado=false with persona_recoge omitted", () => {
    expect(FamilyCreateInputSchema.safeParse({ ...BASE, autorizado: false }).success).toBe(true);
  });

  it("rejects autorizado=true with a blank persona_recoge, anchored to the field, in Spanish", () => {
    const r = FamilyCreateInputSchema.safeParse({ ...BASE, autorizado: true, persona_recoge: "   " });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.join(".") === "persona_recoge");
      expect(issue?.message).toBe("Indica el nombre de la persona autorizada para recoger");
    }
  });

  it("accepts autorizado=true with a named person", () => {
    expect(FamilyCreateInputSchema.safeParse({ ...BASE, autorizado: true, persona_recoge: "María Gómez" }).success).toBe(true);
  });
});

/**
 * FAMILIAS-5: la información social del apartado Documentación se recoge en la
 * entrevista, así que no puede quedar opcional en el alta.
 *
 * El servidor es el punto de aplicación real: el IntakeWizard monta zodResolver
 * pero nunca llama a handleSubmit/trigger, así que la validación de cliente
 * está inerte y el único gate del wizard es el onClick de «Siguiente».
 */
describe("FamilyCreateInputSchema — informe social obligatorio", () => {
  const base = {
    titular_id: "11111111-1111-4111-8111-111111111111",
    miembros: [],
    num_adultos: 1,
    num_menores_18: 0,
    program_id: "22222222-2222-4222-8222-222222222222",
  };

  it("rechaza el alta sin informe social", () => {
    const r = FamilyCreateInputSchema.safeParse({ ...base, informe_social: false });
    expect(r.success).toBe(false);
  });

  it("rechaza el informe social sin fecha", () => {
    const r = FamilyCreateInputSchema.safeParse({ ...base, informe_social: true });
    expect(r.success).toBe(false);
  });

  it("rechaza una fecha vacía (rompía el INSERT en la columna DATE)", () => {
    const r = FamilyCreateInputSchema.safeParse({
      ...base,
      informe_social: true,
      informe_social_fecha: "",
    });
    expect(r.success).toBe(false);
  });

  it("acepta informe social con fecha ISO", () => {
    const r = FamilyCreateInputSchema.safeParse({
      ...base,
      informe_social: true,
      informe_social_fecha: "2026-08-30",
    });
    expect(r.success).toBe(true);
  });
});
