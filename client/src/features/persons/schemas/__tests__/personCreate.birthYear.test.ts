import { describe, it, expect } from "vitest";
import { PersonCreateSchema } from "../personCreate";

const BASE = {
  canal_llegada: "boca_a_boca",
  nombre: "Juan",
  apellidos: "Pérez",
  idioma_principal: "es",
  program_ids: ["550e8400-e29b-41d4-a716-446655440000"],
};

describe("PersonCreateSchema — fecha_nacimiento bounds (F058)", () => {
  it("rejects a birth date older than 120 years", () => {
    expect(PersonCreateSchema.safeParse({ ...BASE, fecha_nacimiento: "1800-01-01" }).success).toBe(false);
  });

  it("accepts a realistic elderly birth date", () => {
    expect(PersonCreateSchema.safeParse({ ...BASE, fecha_nacimiento: "1950-06-15" }).success).toBe(true);
  });
});
