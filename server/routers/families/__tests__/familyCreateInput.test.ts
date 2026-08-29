import { describe, it, expect } from "vitest";
import { FamilyCreateInputSchema } from "../_shared";

const BASE = {
  titular_id: "550e8400-e29b-41d4-a716-446655440000",
  num_adultos: 1,
  num_menores_18: 0,
  program_id: "550e8400-e29b-41d4-a716-446655440001",
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
