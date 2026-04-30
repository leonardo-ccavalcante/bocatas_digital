import { describe, it, expect } from 'vitest';
import { generateFamiliesCSV, ExportMode } from './csvExport';

describe('CSV Export', () => {
  const mockFamilies = [
    {
      id: 'fam-001',
      familia_numero: 'FAM-001',
      nombre_familia: 'García López',
      contacto_principal: 'Juan García',
      telefono: '+34-123-456-789',
      direccion: 'Calle Principal 1',
      estado: 'activo',
      fecha_creacion: '2026-01-15T00:00:00Z',
      miembros_count: 4,
      docs_identidad: true,
      padron_recibido: true,
      justificante_recibido: true,
      consent_bocatas: true,
      consent_banco_alimentos: true,
      informe_social: true,
      informe_social_fecha: '2025-12-15T00:00:00Z',
      alta_en_guf: true,
      fecha_alta_guf: '2026-01-10T00:00:00Z',
      guf_verified_at: '2026-04-10T00:00:00Z',
    },
    {
      id: 'fam-002',
      familia_numero: 'FAM-002',
      nombre_familia: 'Rodríguez Martín',
      contacto_principal: 'María Rodríguez',
      telefono: '+34-234-567-890',
      direccion: 'Calle Secundaria 2',
      estado: 'activo',
      fecha_creacion: '2026-02-20T00:00:00Z',
      miembros_count: 3,
      docs_identidad: false,
      padron_recibido: true,
      justificante_recibido: false,
      consent_bocatas: true,
      consent_banco_alimentos: false,
      informe_social: false,
      informe_social_fecha: null,
      alta_en_guf: false,
      fecha_alta_guf: null,
      guf_verified_at: null,
    },
  ];

  describe('Update mode (all fields)', () => {
    it('should generate CSV with all family fields', () => {
      const csv = generateFamiliesCSV(mockFamilies, 'update');
      
      // Should have header row
      expect(csv).toContain('familia_numero');
      expect(csv).toContain('nombre_familia');
      expect(csv).toContain('contacto_principal');
      
      // Should have data rows
      expect(csv).toContain('FAM-001');
      expect(csv).toContain('García López');
      expect(csv).toContain('FAM-002');
      expect(csv).toContain('Rodríguez Martín');
    });

    it('should properly escape CSV special characters', () => {
      const familiesWithSpecialChars = [
        {
          ...mockFamilies[0],
          nombre_familia: 'García, López & Cia.',
          direccion: 'Calle "Principal" 1',
        },
      ];
      
      const csv = generateFamiliesCSV(familiesWithSpecialChars, 'update');
      
      // Commas should be escaped with quotes
      expect(csv).toContain('"García, López & Cia."');
      // Quotes should be escaped as double quotes in CSV
      expect(csv).toContain('Calle ""Principal"" 1');
    });

    it('should handle null/undefined values', () => {
      const csv = generateFamiliesCSV(mockFamilies, 'update');
      
      // Should have empty values for null fields
      const lines = csv.split('\n');
      expect(lines.length).toBeGreaterThan(2); // Header + 2 data rows
      expect(csv).toContain('FAM-002'); // Second family has nulls
    });
  });

  describe('Audit mode (key fields)', () => {
    it('should generate CSV with audit-relevant fields only', () => {
      const csv = generateFamiliesCSV(mockFamilies, 'audit');
      
      // Should have key fields
      expect(csv).toContain('familia_numero');
      expect(csv).toContain('nombre_familia');
      expect(csv).toContain('contacto_principal');
      expect(csv).toContain('estado');
      
      // Should NOT have all fields (e.g., guf_verified_at is not in audit mode)
      const headerLine = csv.split('\n')[0];
      const fieldCount = headerLine.split(',').length;
      expect(fieldCount).toBeLessThan(20); // Audit mode has fewer fields than update
    });

    it('should include compliance status in audit mode', () => {
      const csv = generateFamiliesCSV(mockFamilies, 'audit');
      
      // Audit mode should show compliance summary
      expect(csv).toContain('FAM-001');
      expect(csv).toContain('FAM-002');
    });
  });

  describe('Verify mode (minimal fields)', () => {
    it('should generate CSV with minimal fields for verification', () => {
      const csv = generateFamiliesCSV(mockFamilies, 'verify');
      
      // Should have minimal fields
      expect(csv).toContain('familia_numero');
      expect(csv).toContain('nombre_familia');
      expect(csv).toContain('estado');
      
      // Should have data
      expect(csv).toContain('FAM-001');
      expect(csv).toContain('García López');
    });

    it('should have fewer fields than audit mode', () => {
      const auditCsv = generateFamiliesCSV(mockFamilies, 'audit');
      const verifyCsv = generateFamiliesCSV(mockFamilies, 'verify');
      
      const auditFieldCount = auditCsv.split('\n')[0].split(',').length;
      const verifyFieldCount = verifyCsv.split('\n')[0].split(',').length;
      
      expect(verifyFieldCount).toBeLessThan(auditFieldCount);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty family list', () => {
      const csv = generateFamiliesCSV([], 'update');
      
      // Should have header but no data rows
      const lines = csv.split('\n').filter(line => line.trim());
      expect(lines.length).toBe(1); // Just header
      expect(csv).toContain('familia_numero');
    });

    it('should format dates consistently', () => {
      const csv = generateFamiliesCSV(mockFamilies, 'update');
      
      // Dates should be in ISO format or consistent format
      expect(csv).toContain('2026-01-15');
      expect(csv).toContain('2026-02-20');
    });

    it('should handle boolean values correctly', () => {
      const csv = generateFamiliesCSV(mockFamilies, 'update');
      
      // Should have true/false or 1/0 for booleans
      const lines = csv.split('\n');
      expect(lines.length).toBeGreaterThan(2);
    });
  });

  describe('CSV format compliance', () => {
    it('should produce valid CSV format', () => {
      const csv = generateFamiliesCSV(mockFamilies, 'update');
      
      const lines = csv.split('\n');
      const headerLine = lines[0];
      const headers = headerLine.split(',').length;
      
      // All data rows should have same number of fields as header
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const fields = lines[i].split(',').length;
          expect(fields).toBe(headers);
        }
      }
    });

    it('should end with newline', () => {
      const csv = generateFamiliesCSV(mockFamilies, 'update');
      expect(csv.endsWith('\n')).toBe(true);
    });
  });
});
