import { describe, it, expect } from "vitest";
import { esFueraDeMadrid } from "@shared/madrid/fueraDeMadrid";

describe("esFueraDeMadrid — derived from codigo_postal (outside Madrid municipality)", () => {
  it("is false for a Madrid-city postal code", () => {
    expect(esFueraDeMadrid("28004")).toBe(false); // Centro
    expect(esFueraDeMadrid("28017")).toBe(false); // Ciudad Lineal
  });

  it("is true for a valid CP outside Madrid municipality", () => {
    expect(esFueraDeMadrid("28801")).toBe(true); // Alcalá de Henares (province, not city)
    expect(esFueraDeMadrid("08001")).toBe(true); // Barcelona
  });

  it("is false (unknown) for empty or malformed codes — handled by the manual count", () => {
    expect(esFueraDeMadrid(null)).toBe(false);
    expect(esFueraDeMadrid(undefined)).toBe(false);
    expect(esFueraDeMadrid("")).toBe(false);
    expect(esFueraDeMadrid("2800")).toBe(false);
    expect(esFueraDeMadrid("abcde")).toBe(false);
  });
});
