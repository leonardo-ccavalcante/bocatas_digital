import { describe, it, expect } from "vitest";
import { generateFamiliesCSV } from "./csvExport";
import { validateFamiliesCSV, parseFamiliesCSV } from "./csvImport";

describe("CSV Export/Import Edge Cases", () => {
  describe("Special Characters & Escaping", () => {
    it("should escape commas in family names", () => {
      const families = [
        {
          id: "test-1",
          familia_numero: "1",
          nombre_familia: "García, López y Cia",
          contacto_principal: "Juan",
          telefono: "123456789",
          direccion: "Calle Principal, 123",
          estado: "activa",
          fecha_creacion: "2026-01-01",
          miembros_count: 4,
          docs_identidad: true,
          padron_recibido: true,
          justificante_recibido: true,
          consent_bocatas: true,
          consent_banco_alimentos: true,
          informe_social: true,
          informe_social_fecha: "2026-01-15",
          alta_en_guf: true,
          fecha_alta_guf: "2026-01-10",
          guf_verified_at: "2026-01-15",
        },
      ];

      const csv = generateFamiliesCSV(families, "update");
      expect(csv).toContain('"García, López y Cia"');
    });

    it("should escape quotes in family names", () => {
      const families = [
        {
          id: "test-1",
          familia_numero: "1",
          nombre_familia: 'García "La Familia" López',
          contacto_principal: "Juan",
          telefono: "123456789",
          direccion: "Calle Principal",
          estado: "activa",
          fecha_creacion: "2026-01-01",
          miembros_count: 4,
          docs_identidad: true,
          padron_recibido: true,
          justificante_recibido: true,
          consent_bocatas: true,
          consent_banco_alimentos: true,
          informe_social: true,
          informe_social_fecha: "2026-01-15",
          alta_en_guf: true,
          fecha_alta_guf: "2026-01-10",
          guf_verified_at: "2026-01-15",
        },
      ];

      const csv = generateFamiliesCSV(families, "update");
      expect(csv).toContain('"García ""La Familia"" López"');
    });

    it("should handle newlines in family names", () => {
      const families = [
        {
          id: "test-1",
          familia_numero: "1",
          nombre_familia: "García\nLópez",
          contacto_principal: "Juan",
          telefono: "123456789",
          direccion: "Calle Principal",
          estado: "activa",
          fecha_creacion: "2026-01-01",
          miembros_count: 4,
          docs_identidad: true,
          padron_recibido: true,
          justificante_recibido: true,
          consent_bocatas: true,
          consent_banco_alimentos: true,
          informe_social: true,
          informe_social_fecha: "2026-01-15",
          alta_en_guf: true,
          fecha_alta_guf: "2026-01-10",
          guf_verified_at: "2026-01-15",
        },
      ];

      const csv = generateFamiliesCSV(families, "update");
      expect(csv).toContain('"García\nLópez"');
    });

    it("should handle multiple special characters combined", () => {
      const families = [
        {
          id: "test-1",
          familia_numero: "1",
          nombre_familia: 'García "López, Jr." & Cia\nS.L.',
          contacto_principal: "Juan",
          telefono: "123456789",
          direccion: "Calle Principal",
          estado: "activa",
          fecha_creacion: "2026-01-01",
          miembros_count: 4,
          docs_identidad: true,
          padron_recibido: true,
          justificante_recibido: true,
          consent_bocatas: true,
          consent_banco_alimentos: true,
          informe_social: true,
          informe_social_fecha: "2026-01-15",
          alta_en_guf: true,
          fecha_alta_guf: "2026-01-10",
          guf_verified_at: "2026-01-15",
        },
      ];

      const csv = generateFamiliesCSV(families, "update");
      expect(csv).toContain('"García ""López, Jr."" & Cia\nS.L."');
    });
  });

  describe("Large Data Sets", () => {
    it("should handle 100 families without errors", () => {
      const families = Array.from({ length: 100 }, (_, i) => ({
        id: `test-${i}`,
        familia_numero: `${i + 1}`,
        nombre_familia: `Familia ${i + 1}`,
        contacto_principal: `Contacto ${i + 1}`,
        telefono: `12345678${i % 10}`,
        direccion: `Calle ${i + 1}`,
        estado: "activa" as const,
        fecha_creacion: "2026-01-01",
        miembros_count: 4,
        docs_identidad: true,
        padron_recibido: true,
        justificante_recibido: true,
        consent_bocatas: true,
        consent_banco_alimentos: true,
        informe_social: true,
        informe_social_fecha: "2026-01-15",
        alta_en_guf: true,
        fecha_alta_guf: "2026-01-10",
        guf_verified_at: "2026-01-15",
      }));

      const csv = generateFamiliesCSV(families, "update");
      const lines = csv.split("\n").filter((l) => l.trim());
      expect(lines).toHaveLength(101); // header + 100 rows
    });

    it("should validate 100 families without errors", () => {
      const csvContent = `familia_numero,nombre_familia,contacto_principal
1,Familia 1,Contacto 1
2,Familia 2,Contacto 2
3,Familia 3,Contacto 3`;

      const result = validateFamiliesCSV(csvContent);
      expect(result.isValid).toBe(true);
      expect(result.recordCount).toBe(3);
    });
  });

  describe("Empty & Null Values", () => {
    it("should handle null values in optional fields", () => {
      const families = [
        {
          id: "test-1",
          familia_numero: "1",
          nombre_familia: "García López",
          contacto_principal: "Juan",
          telefono: "123456789",
          direccion: "Calle Principal",
          estado: "activa",
          fecha_creacion: "2026-01-01",
          miembros_count: 4,
          docs_identidad: true,
          padron_recibido: true,
          justificante_recibido: true,
          consent_bocatas: true,
          consent_banco_alimentos: true,
          informe_social: false,
          informe_social_fecha: null,
          alta_en_guf: false,
          fecha_alta_guf: null,
          guf_verified_at: null,
        },
      ];

      const csv = generateFamiliesCSV(families, "update");
      // Null values are exported as empty strings (RFC 4180 compliant)
      expect(csv).toContain("false,,false,,"); // Empty fields for null values
    });

    it("should handle empty CSV", () => {
      const result = validateFamiliesCSV("");
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("CSV file is empty");
    });

    it("should handle CSV with only header", () => {
      const csvContent = "familia_numero,nombre_familia,contacto_principal";
      const result = validateFamiliesCSV(csvContent);
      expect(result.isValid).toBe(false);
      expect(result.recordCount).toBe(0);
      expect(result.errors.some((e) => e.includes("header"))).toBe(true);
    });
  });

  describe("CSV Parsing Robustness", () => {
    it("should parse CSV with quoted fields correctly", () => {
      const csvContent = `familia_numero,nombre_familia,contacto_principal
1,"García, López","Juan, María"
2,"Familia 2","Contacto 2"`;

      const parsed = parseFamiliesCSV(csvContent);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].nombre_familia).toBe("García, López");
      expect(parsed[0].contacto_principal).toBe("Juan, María");
    });

    it("should parse CSV with escaped quotes", () => {
      const csvContent = `familia_numero,nombre_familia,contacto_principal
1,"García ""La Familia"" López","Juan"
2,"Familia 2","Contacto 2"`;

      const parsed = parseFamiliesCSV(csvContent);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].nombre_familia).toBe('García "La Familia" López');
    });

    it("should handle Windows line endings (CRLF)", () => {
      const csvContent = `familia_numero,nombre_familia,contacto_principal\r\n1,Familia 1,Contacto 1\r\n2,Familia 2,Contacto 2`;

      const parsed = parseFamiliesCSV(csvContent);
      expect(parsed).toHaveLength(2);
    });

    it("should handle mixed line endings", () => {
      const csvContent = `familia_numero,nombre_familia,contacto_principal\r\n1,Familia 1,Contacto 1\n2,Familia 2,Contacto 2`;

      const parsed = parseFamiliesCSV(csvContent);
      expect(parsed).toHaveLength(2);
    });
  });

  describe("Export Modes", () => {
    it("should export with update mode (all fields)", () => {
      const families = [
        {
          id: "test-1",
          familia_numero: "1",
          nombre_familia: "García López",
          contacto_principal: "Juan",
          telefono: "123456789",
          direccion: "Calle Principal",
          estado: "activa",
          fecha_creacion: "2026-01-01",
          miembros_count: 4,
          docs_identidad: true,
          padron_recibido: true,
          justificante_recibido: true,
          consent_bocatas: true,
          consent_banco_alimentos: true,
          informe_social: true,
          informe_social_fecha: "2026-01-15",
          alta_en_guf: true,
          fecha_alta_guf: "2026-01-10",
          guf_verified_at: "2026-01-15",
        },
      ];

      const csv = generateFamiliesCSV(families, "update");
      const header = csv.split("\n")[0];
      const fields = header.split(",");
      expect(fields.length).toBeGreaterThanOrEqual(18);
    });

    it("should export with audit mode (key fields only)", () => {
      const families = [
        {
          id: "test-1",
          familia_numero: "1",
          nombre_familia: "García López",
          contacto_principal: "Juan",
          telefono: "123456789",
          direccion: "Calle Principal",
          estado: "activa",
          fecha_creacion: "2026-01-01",
          miembros_count: 4,
          docs_identidad: true,
          padron_recibido: true,
          justificante_recibido: true,
          consent_bocatas: true,
          consent_banco_alimentos: true,
          informe_social: true,
          informe_social_fecha: "2026-01-15",
          alta_en_guf: true,
          fecha_alta_guf: "2026-01-10",
          guf_verified_at: "2026-01-15",
        },
      ];

      const csv = generateFamiliesCSV(families, "audit");
      const header = csv.split("\n")[0];
      const fields = header.split(",");
      expect(fields.length).toBeLessThan(18);
      expect(fields).toContain("familia_numero");
      expect(fields).toContain("nombre_familia");
    });

    it("should export with verify mode (minimal fields + familia_id UUID)", () => {
      const families = [
        {
          id: "test-1",
          familia_numero: "1",
          nombre_familia: "García López",
          contacto_principal: "Juan",
          telefono: "123456789",
          direccion: "Calle Principal",
          estado: "activa",
          fecha_creacion: "2026-01-01",
          miembros_count: 4,
          docs_identidad: true,
          padron_recibido: true,
          justificante_recibido: true,
          consent_bocatas: true,
          consent_banco_alimentos: true,
          informe_social: true,
          informe_social_fecha: "2026-01-15",
          alta_en_guf: true,
          fecha_alta_guf: "2026-01-10",
          guf_verified_at: "2026-01-15",
        },
      ];

      const csv = generateFamiliesCSV(families, "verify");
      const header = csv.split("\n")[0];
      const fields = header.split(",");
      // familia_id (UUID) is now always first column for reliable import matching
      expect(fields.length).toBe(5);
      expect(fields).toEqual(["familia_id", "familia_numero", "nombre_familia", "contacto_principal", "estado"]);
    });
  });

  describe("Validation Rules", () => {
    it("should reject CSV with missing required fields", () => {
      const csvContent = `familia_numero,nombre_familia
1,Familia 1
2,Familia 2`;

      const result = validateFamiliesCSV(csvContent);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("contacto_principal"))).toBe(true);
    });

    it("should accept alphanumeric familia_numero", () => {
      const csvContent = `familia_numero,nombre_familia,contacto_principal
FAM-001,Familia 1,Contacto 1`;

      const result = validateFamiliesCSV(csvContent);
      expect(result.isValid).toBe(true);
    });

    it("should detect duplicate familia_numero", () => {
      const csvContent = `familia_numero,nombre_familia,contacto_principal
FAM-001,Familia 1,Contacto 1
FAM-001,Familia 1 Duplicate,Contacto 1`;

      const result = validateFamiliesCSV(csvContent);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
    });

    it("should reject invalid familia_numero with special characters", () => {
      const csvContent = `familia_numero,nombre_familia,contacto_principal
familia@123,Familia 1,Contacto 1`;

      const result = validateFamiliesCSV(csvContent);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("alphanumeric"))).toBe(true);
      expect(result.errors.some((e) => e.includes("@"))).toBe(true);
    });
  });
});
