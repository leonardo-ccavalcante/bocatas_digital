import { describe, it, expect } from 'vitest';
import { validateFamiliesCSV, parseFamiliesCSV, ImportValidationResult } from './csvImport';

describe('CSV Import', () => {
  const validCSVHeader = 'familia_numero,nombre_familia,contacto_principal,telefono,direccion,estado,fecha_creacion,miembros_count,docs_identidad,padron_recibido,justificante_recibido,consent_bocatas,consent_banco_alimentos,informe_social,informe_social_fecha,alta_en_guf,fecha_alta_guf,guf_verified_at';

  const validCSVData = `${validCSVHeader}
FAM-001,García López,Juan García,+34-123-456-789,Calle Principal 1,activo,2026-01-15,4,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10
FAM-002,Rodríguez Martín,María Rodríguez,+34-234-567-890,Calle Secundaria 2,activo,2026-02-20,3,false,true,false,true,false,false,,false,,`;

  describe('CSV Validation', () => {
    it('should validate correct CSV structure', () => {
      const result = validateFamiliesCSV(validCSVData);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should reject CSV with missing headers', () => {
      const invalidCSV = 'familia_numero,nombre_familia\nFAM-001,García López';
      const result = validateFamiliesCSV(invalidCSV);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject CSV with missing required fields', () => {
      const missingFieldCSV = `familia_numero,nombre_familia
FAM-001,García López`;
      const result = validateFamiliesCSV(missingFieldCSV);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('required'))).toBe(true);
    });

    it('should reject CSV with duplicate familia_ids', () => {
      const duplicateCSV = `${validCSVHeader}
FAM-001,García López,Juan García,+34-123-456-789,Calle Principal 1,activo,2026-01-15,4,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10
FAM-001,Rodríguez Martín,María Rodríguez,+34-234-567-890,Calle Secundaria 2,activo,2026-02-20,3,false,true,false,true,false,false,,false,,`;
      const result = validateFamiliesCSV(duplicateCSV);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate') || e.includes('duplicate'))).toBe(true);
    });

    it('should warn on invalid date format', () => {
      const invalidDateCSV = `${validCSVHeader}
FAM-001,García López,Juan García,+34-123-456-789,Calle Principal 1,activo,invalid-date,4,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10`;
      const result = validateFamiliesCSV(invalidDateCSV);
      
      expect(result.warnings.some(w => w.includes('date'))).toBe(true);
    });

    it('should warn on invalid enum values', () => {
      const invalidEnumCSV = `${validCSVHeader}
FAM-001,García López,Juan García,+34-123-456-789,Calle Principal 1,invalid-status,2026-01-15,4,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10`;
      const result = validateFamiliesCSV(invalidEnumCSV);
      
      expect(result.warnings.some(w => w.includes('estado') || w.includes('status'))).toBe(true);
    });

    it('should handle escaped CSV values correctly', () => {
      const escapedCSV = `${validCSVHeader}
FAM-001,"García, López & Cia.",Juan García,+34-123-456-789,"Calle ""Principal"" 1",activo,2026-01-15,4,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10`;
      const result = validateFamiliesCSV(escapedCSV);
      
      expect(result.isValid).toBe(true);
    });
  });

  describe('CSV Parsing', () => {
    it('should parse valid CSV into family objects', () => {
      const result = parseFamiliesCSV(validCSVData);
      
      expect(result).toHaveLength(2);
      expect(result[0].familia_numero).toBe('FAM-001');
      expect(result[0].nombre_familia).toBe('García López');
      expect(result[1].familia_numero).toBe('FAM-002');
    });

    it('should parse boolean values correctly', () => {
      const result = parseFamiliesCSV(validCSVData);
      
      expect(result[0].docs_identidad).toBe(true);
      expect(result[1].docs_identidad).toBe(false);
    });

    it('should parse null values as empty strings or null', () => {
      const result = parseFamiliesCSV(validCSVData);
      
      // FAM-002 has empty informe_social_fecha
      expect(result[1].informe_social_fecha === '' || result[1].informe_social_fecha === null).toBe(true);
    });

    it('should handle escaped commas in values', () => {
      const escapedCSV = `${validCSVHeader}
FAM-001,"García, López & Cia.",Juan García,+34-123-456-789,"Calle ""Principal"" 1",activo,2026-01-15,4,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10`;
      const result = parseFamiliesCSV(escapedCSV);
      
      expect(result[0].nombre_familia).toContain('García, López');
      expect(result[0].direccion).toContain('Principal');
    });

    it('should parse empty CSV (header only)', () => {
      const result = parseFamiliesCSV(validCSVHeader);
      
      expect(result).toHaveLength(0);
    });
  });

  describe('Validation Result Structure', () => {
    it('should return validation result with correct structure', () => {
      const result = validateFamiliesCSV(validCSVData);
      
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('recordCount');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should count records correctly', () => {
      const result = validateFamiliesCSV(validCSVData);
      
      expect(result.recordCount).toBe(2);
    });

    it('should report line numbers in errors', () => {
      const invalidCSV = `${validCSVHeader}
FAM-001,García López,Juan García,+34-123-456-789,Calle Principal 1,activo,2026-01-15,4,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10
FAM-001,Rodríguez Martín,María Rodríguez,+34-234-567-890,Calle Secundaria 2,activo,2026-02-20,3,false,true,false,true,false,false,,false,,`;
      const result = validateFamiliesCSV(invalidCSV);
      
      // Error should mention line number or row number
      expect(result.errors.some(e => e.includes('Row') || e.includes('row') || e.includes('line') || e.includes('Line'))).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty CSV', () => {
      const result = validateFamiliesCSV('');
      
      expect(result.isValid).toBe(false);
    });

    it('should handle CSV with only whitespace', () => {
      const result = validateFamiliesCSV('   \n\n   ');
      
      expect(result.isValid).toBe(false);
    });

    it('should handle very long field values', () => {
      const longValue = 'a'.repeat(1000);
      const longCSV = `${validCSVHeader}
FAM-001,${longValue},Juan García,+34-123-456-789,Calle Principal 1,activo,2026-01-15,4,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10`;
      const result = validateFamiliesCSV(longCSV);
      
      expect(result.isValid).toBe(true);
    });

    it('should handle special characters in values', () => {
      const specialCSV = `${validCSVHeader}
FAM-001,García López & Cia.,Juan García,+34-123-456-789,Calle Principal 1 (Apt 2B),activo,2026-01-15,4,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10`;
      const result = validateFamiliesCSV(specialCSV);
      
      expect(result.isValid).toBe(true);
    });
  });

  describe('Data Type Validation', () => {
    it('should validate numeric fields', () => {
      const invalidNumericCSV = `${validCSVHeader}
FAM-001,García López,Juan García,+34-123-456-789,Calle Principal 1,activo,2026-01-15,not-a-number,true,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10`;
      const result = validateFamiliesCSV(invalidNumericCSV);
      
      expect(result.warnings.some(w => w.includes('miembros_count') || w.includes('numeric'))).toBe(true);
    });

    it('should validate boolean fields', () => {
      const invalidBooleanCSV = `${validCSVHeader}
FAM-001,García López,Juan García,+34-123-456-789,Calle Principal 1,activo,2026-01-15,4,maybe,true,true,true,true,true,2025-12-15,true,2026-01-10,2026-04-10`;
      const result = validateFamiliesCSV(invalidBooleanCSV);
      
      expect(result.warnings.some(w => w.includes('boolean') || w.includes('true/false'))).toBe(true);
    });
  });
});
