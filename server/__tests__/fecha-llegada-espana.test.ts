import { describe, it, expect } from "vitest";
import { PersonCreateSchema } from "../../client/src/features/persons/schemas";

describe("PersonCreateSchema — fecha_llegada_espana field", () => {
  it("should transform empty string to null", () => {
    const input = {
      canal_llegada: "boca_a_boca",
      nombre: "Juan",
      apellidos: "Pérez",
      fecha_nacimiento: "1990-01-15",
      idioma_principal: "es",
      fecha_llegada_espana: "", // Empty string from date input
      program_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    };

    const result = PersonCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fecha_llegada_espana).toBe(null);
    }
  });

  it("should accept valid YYYY-MM-DD format", () => {
    const input = {
      canal_llegada: "boca_a_boca",
      nombre: "Juan",
      apellidos: "Pérez",
      fecha_nacimiento: "1990-01-15",
      idioma_principal: "es",
      fecha_llegada_espana: "2020-05-15",
      program_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    };

    const result = PersonCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fecha_llegada_espana).toBe("2020-05-15");
    }
  });

  it("should reject invalid date format", () => {
    const input = {
      canal_llegada: "boca_a_boca",
      nombre: "Juan",
      apellidos: "Pérez",
      fecha_nacimiento: "1990-01-15",
      idioma_principal: "es",
      fecha_llegada_espana: "15/05/2020", // Invalid format
      program_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    };

    const result = PersonCreateSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should allow null value", () => {
    const input = {
      canal_llegada: "boca_a_boca",
      nombre: "Juan",
      apellidos: "Pérez",
      fecha_nacimiento: "1990-01-15",
      idioma_principal: "es",
      fecha_llegada_espana: null,
      program_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    };

    const result = PersonCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fecha_llegada_espana).toBe(null);
    }
  });

  it("should allow undefined (optional field)", () => {
    const input = {
      canal_llegada: "boca_a_boca",
      nombre: "Juan",
      apellidos: "Pérez",
      fecha_nacimiento: "1990-01-15",
      idioma_principal: "es",
      // fecha_llegada_espana omitted
      program_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    };

    const result = PersonCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
