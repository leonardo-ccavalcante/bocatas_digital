import { describe, it, expect } from "vitest";
import { validateAnnouncementRow } from "../db/csv-validation";

describe("CSV Validation - Announcements", () => {
  describe("Required Fields", () => {
    it("should reject row with missing titulo", () => {
      const row = {
        contenido: "Test content",
        tipo: "informativo",
        es_urgente: "false",
        fecha_inicio: "2026-05-01",
        fecha_fin: "2026-05-02",
        fijado: "false",
        audiencias: "all",
      };
      const result = validateAnnouncementRow(row);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("titulo is required");
    });

    it("should reject row with missing contenido", () => {
      const row = {
        titulo: "Test",
        tipo: "informativo",
        es_urgente: "false",
        fecha_inicio: "2026-05-01",
        fecha_fin: "2026-05-02",
        fijado: "false",
        audiencias: "all",
      };
      const result = validateAnnouncementRow(row);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("contenido is required");
    });
  });

  describe("Date Validation", () => {
    it("should reject invalid date format", () => {
      const row = {
        titulo: "Test",
        contenido: "Test content",
        tipo: "informativo",
        es_urgente: "false",
        fecha_inicio: "invalid-date",
        fecha_fin: "2026-05-02",
        fijado: "false",
        audiencias: "all",
      };
      const result = validateAnnouncementRow(row);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("fecha_inicio"))).toBe(true);
    });

    it("should reject fecha_fin before fecha_inicio", () => {
      const row = {
        titulo: "Test",
        contenido: "Test content",
        tipo: "informativo",
        es_urgente: "false",
        fecha_inicio: "2026-05-02",
        fecha_fin: "2026-05-01",
        fijado: "false",
        audiencias: "all",
      };
      const result = validateAnnouncementRow(row);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("fecha_fin"))).toBe(true);
    });
  });

  describe("Boolean Validation", () => {
    it("should accept valid boolean values", () => {
      const row = {
        titulo: "Test",
        contenido: "Test content",
        tipo: "informativo",
        es_urgente: "true",
        fecha_inicio: "2026-05-01",
        fecha_fin: "2026-05-02",
        fijado: "false",
        audiencias: "all",
      };
      const result = validateAnnouncementRow(row);
      expect(result.valid).toBe(true);
    });

    it("should reject invalid boolean values", () => {
      const row = {
        titulo: "Test",
        contenido: "Test content",
        tipo: "informativo",
        es_urgente: "maybe",
        fecha_inicio: "2026-05-01",
        fecha_fin: "2026-05-02",
        fijado: "false",
        audiencias: "all",
      };
      const result = validateAnnouncementRow(row);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("es_urgente"))).toBe(true);
    });
  });

  describe("Enum Validation", () => {
    it("should accept valid tipo values", () => {
      const validTypes = ["informativo", "urgente", "evento"];
      for (const tipo of validTypes) {
        const row = {
          titulo: "Test",
          contenido: "Test content",
          tipo,
          es_urgente: "false",
          fecha_inicio: "2026-05-01",
          fecha_fin: "2026-05-02",
          fijado: "false",
          audiencias: "all",
        };
        const result = validateAnnouncementRow(row);
        expect(result.valid).toBe(true);
      }
    });

    it("should reject invalid tipo values", () => {
      const row = {
        titulo: "Test",
        contenido: "Test content",
        tipo: "invalid_type",
        es_urgente: "false",
        fecha_inicio: "2026-05-01",
        fecha_fin: "2026-05-02",
        fijado: "false",
        audiencias: "all",
      };
      const result = validateAnnouncementRow(row);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("tipo"))).toBe(true);
    });
  });

  describe("Valid Row", () => {
    it("should accept completely valid row", () => {
      const row = {
        titulo: "Important Announcement",
        contenido: "This is important content",
        tipo: "informativo",
        es_urgente: "false",
        fecha_inicio: "2026-05-01",
        fecha_fin: "2026-05-10",
        fijado: "true",
        audiencias: "all",
      };
      const result = validateAnnouncementRow(row);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
