import { describe, it, expect } from "vitest";
import { validateAnnouncementRow } from "../db/bulk-import-validation";

describe("CSV Field Validation", () => {
  /**
   * TEST 1: Valid announcement passes validation
   */
  it("should accept valid announcement row", () => {
    const validRow = {
      titulo: "Test Announcement",
      contenido: "Test content",
      tipo: "info",
      es_urgente: false,
      fecha_inicio: "2026-05-01",
      fecha_fin: "2026-05-31",
      fijado: false,
      audiencias: "all",
    };

    const result = validateAnnouncementRow(validRow);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  /**
   * TEST 2: Missing required field
   */
  it("should reject missing required field (titulo)", () => {
    const invalidRow = {
      contenido: "Test content",
      tipo: "info",
      es_urgente: false,
      fecha_inicio: "2026-05-01",
      fecha_fin: "2026-05-31",
      fijado: false,
      audiencias: "all",
    };

    const result = validateAnnouncementRow(invalidRow);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.field === "titulo")).toBe(true);
  });

  /**
   * TEST 3: Invalid date format
   */
  it("should reject invalid date format", () => {
    const invalidRow = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "info",
      es_urgente: false,
      fecha_inicio: "invalid-date",
      fecha_fin: "2026-05-31",
      fijado: false,
      audiencias: "all",
    };

    const result = validateAnnouncementRow(invalidRow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "fecha_inicio")).toBe(true);
  });

  /**
   * TEST 4: Invalid tipo enum
   */
  it("should reject invalid tipo value", () => {
    const invalidRow = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "invalid_type",
      es_urgente: false,
      fecha_inicio: "2026-05-01",
      fecha_fin: "2026-05-31",
      fijado: false,
      audiencias: "all",
    };

    const result = validateAnnouncementRow(invalidRow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "tipo")).toBe(true);
  });

  /**
   * TEST 5: End date before start date
   */
  it("should reject end date before start date", () => {
    const invalidRow = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "info",
      es_urgente: false,
      fecha_inicio: "2026-05-31",
      fecha_fin: "2026-05-01",
      fijado: false,
      audiencias: "all",
    };

    const result = validateAnnouncementRow(invalidRow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "fecha_fin")).toBe(true);
  });

  /**
   * TEST 6: Empty titulo
   */
  it("should reject empty titulo", () => {
    const invalidRow = {
      titulo: "",
      contenido: "Test content",
      tipo: "info",
      es_urgente: false,
      fecha_inicio: "2026-05-01",
      fecha_fin: "2026-05-31",
      fijado: false,
      audiencias: "all",
    };

    const result = validateAnnouncementRow(invalidRow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "titulo")).toBe(true);
  });
});
