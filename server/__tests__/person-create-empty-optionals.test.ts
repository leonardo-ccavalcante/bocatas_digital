import { describe, it, expect } from "vitest";
import { PersonCreateInput } from "../routers/persons/_shared";
import { PersonCreateSchema } from "../../client/src/features/persons/schemas";

// Minimal valid persons.create payload (same fixture shape as
// server/__tests__/fecha-llegada-espana.test.ts).
const BASE = {
  canal_llegada: "boca_a_boca",
  nombre: "Juan",
  apellidos: "Pérez",
  fecha_nacimiento: "1990-01-15",
  idioma_principal: "es",
  program_ids: ["550e8400-e29b-41d4-a716-446655440000"],
};

describe("persons.create input — empty optional fields from the wizard (F024/F047/F250)", () => {
  it("accepts fecha_llegada_espana:'' (untouched <input type=date> submits '')", () => {
    const result = PersonCreateInput.safeParse({ ...BASE, fecha_llegada_espana: "" });
    expect(result.success).toBe(true);
  });

  it("accepts whatever the client schema outputs for the same raw form values (ADR-0001 drift guard, F116)", () => {
    const raw = { ...BASE, fecha_llegada_espana: "", email: "", codigo_postal: "" };
    const clientParsed = PersonCreateSchema.safeParse(raw);
    expect(clientParsed.success).toBe(true);
    if (clientParsed.success) {
      expect(PersonCreateInput.safeParse(clientParsed.data).success).toBe(true);
    }
  });

  it("still rejects a malformed non-empty date", () => {
    expect(PersonCreateInput.safeParse({ ...BASE, fecha_llegada_espana: "15/05/2020" }).success).toBe(false);
  });
});
