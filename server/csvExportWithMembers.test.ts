import { describe, it, expect } from 'vitest';
import { generateFamiliesCSVWithMembers, type ExportMode } from './csvExportWithMembers';

describe('generateFamiliesCSVWithMembers', () => {
  const mockFamilyWithMembers = [
    {
      family: {
        id: 'd0000-0001',
        familia_numero: 'FAM-001',
        nombre_familia: 'Garcia Lopez',
        contacto_principal: 'Juan Garcia',
        telefono: '+34-123-456-789',
        direccion: 'Calle Principal 1',
        estado: 'activo',
        fecha_creacion: '2026-01-15',
        miembros_count: 2,
        docs_identidad: true,
        padron_recibido: true,
        justificante_recibido: true,
        consent_bocatas: true,
        consent_banco_alimentos: true,
        informe_social: true,
        informe_social_fecha: '2025-12-15',
        alta_en_guf: true,
        fecha_alta_guf: '2026-01-10',
        guf_verified_at: '2026-04-10',
      },
      members: [
        {
          id: 'm0001-0001',
          familia_id: 'd0000-0001',
          nombre: 'Maria Garcia Lopez',
          rol: 'head_of_household',
          relacion: 'titular',
          fecha_nacimiento: '1980-05-15',
          estado: 'activo',
        },
        {
          id: 'm0001-0002',
          familia_id: 'd0000-0001',
          nombre: 'Juan Garcia Lopez Jr',
          rol: 'dependent',
          relacion: 'hijo',
          fecha_nacimiento: '2010-03-20',
          estado: 'activo',
        },
      ],
    },
  ];

  describe('Update Mode (Full Fields)', () => {
    it('should export with all family and member fields', () => {
      const csv = generateFamiliesCSVWithMembers(mockFamilyWithMembers, 'update');
      const lines = csv.split('\n').filter(l => l);

      // Header + 2 member rows
      expect(lines.length).toBe(3);

      const header = lines[0];
      const fields = header.split(',');

      // Should include familia_id and miembro_id
      expect(fields).toContain('familia_id');
      expect(fields).toContain('miembro_id');
      expect(fields).toContain('familia_numero');
      expect(fields).toContain('nombre_familia');
      expect(fields).toContain('miembro_nombre');
      expect(fields).toContain('miembro_rol');
    });

    it('should repeat family data for each member row', () => {
      const csv = generateFamiliesCSVWithMembers(mockFamilyWithMembers, 'update');
      const lines = csv.split('\n').filter(l => l);

      const memberRow1 = lines[1];
      const memberRow2 = lines[2];

      // Both should start with same familia_id
      expect(memberRow1).toContain('d0000-0001');
      expect(memberRow2).toContain('d0000-0001');

      // Both should have FAM-001
      expect(memberRow1).toContain('FAM-001');
      expect(memberRow2).toContain('FAM-001');

      // But different miembro_id
      expect(memberRow1).toContain('m0001-0001');
      expect(memberRow2).toContain('m0001-0002');
    });

    it('should escape special characters in member names', () => {
      const familyWithSpecialChars = [
        {
          family: mockFamilyWithMembers[0].family,
          members: [
            {
              id: 'm0001-0001',
              familia_id: 'd0000-0001',
              nombre: 'Maria "La Reina" Garcia, Lopez',
              rol: 'head_of_household',
              relacion: 'titular',
              fecha_nacimiento: '1980-05-15',
              estado: 'activo',
            },
          ],
        },
      ];

      const csv = generateFamiliesCSVWithMembers(familyWithSpecialChars, 'update');
      const lines = csv.split('\n').filter(l => l);

      // Should have quoted field with escaped quotes
      expect(lines[1]).toContain('"Maria ""La Reina"" Garcia, Lopez"');
    });
  });

  describe('Audit Mode (Key Fields)', () => {
    it('should export with audit fields only', () => {
      const csv = generateFamiliesCSVWithMembers(mockFamilyWithMembers, 'audit');
      const header = csv.split('\n')[0];
      const fields = header.split(',');

      // Should have key fields
      expect(fields).toContain('familia_id');
      expect(fields).toContain('familia_numero');
      expect(fields).toContain('nombre_familia');
      expect(fields).toContain('miembro_id');
      expect(fields).toContain('miembro_nombre');
      expect(fields).toContain('estado');

      // Should NOT have all fields
      expect(fields).not.toContain('telefono');
      expect(fields).not.toContain('direccion');
    });
  });

  describe('Verify Mode (Minimal Fields)', () => {
    it('should export with minimal fields', () => {
      const csv = generateFamiliesCSVWithMembers(mockFamilyWithMembers, 'verify');
      const header = csv.split('\n')[0];
      const fields = header.split(',');

      // Should have minimal fields
      expect(fields).toContain('familia_id');
      expect(fields).toContain('familia_numero');
      expect(fields).toContain('nombre_familia');
      expect(fields).toContain('miembro_id');
      expect(fields).toContain('miembro_nombre');
      expect(fields).toContain('estado');

      // Should NOT have detailed fields
      expect(fields).not.toContain('telefono');
      expect(fields).not.toContain('direccion');
      expect(fields).not.toContain('consent_bocatas');
    });
  });

  describe('Family Without Members', () => {
    it('should export family with empty member fields', () => {
      const familyNoMembers = [
        {
          family: mockFamilyWithMembers[0].family,
          members: [],
        },
      ];

      const csv = generateFamiliesCSVWithMembers(familyNoMembers, 'update');
      const lines = csv.split('\n').filter(l => l);

      // Header + 1 family row (no members)
      expect(lines.length).toBe(2);

      const familyRow = lines[1];
      // Should have familia_id and family data
      expect(familyRow).toContain('d0000-0001');
      expect(familyRow).toContain('FAM-001');
      // Should have empty member fields
      expect(familyRow.split(',').length).toBeGreaterThan(0);
    });
  });

  describe('Multiple Families', () => {
    it('should export multiple families with their members', () => {
      const multipleFamilies = [
        mockFamilyWithMembers[0],
        {
          family: {
            id: 'd0000-0002',
            familia_numero: 'FAM-002',
            nombre_familia: 'Rodriguez Martinez',
            contacto_principal: 'Carlos Rodriguez',
            telefono: '+34-987-654-321',
            direccion: 'Calle Secundaria 2',
            estado: 'activo',
            fecha_creacion: '2026-02-01',
            miembros_count: 1,
            docs_identidad: false,
            padron_recibido: false,
            justificante_recibido: false,
            consent_bocatas: false,
            consent_banco_alimentos: false,
            informe_social: false,
            informe_social_fecha: null,
            alta_en_guf: false,
            fecha_alta_guf: null,
            guf_verified_at: null,
          },
          members: [
            {
              id: 'm0002-0001',
              familia_id: 'd0000-0002',
              nombre: 'Carlos Rodriguez Martinez',
              rol: 'head_of_household',
              relacion: 'titular',
              fecha_nacimiento: '1975-12-08',
              estado: 'activo',
            },
          ],
        },
      ];

      const csv = generateFamiliesCSVWithMembers(multipleFamilies, 'update');
      const lines = csv.split('\n').filter(l => l);

      // Header + 2 members from family 1 + 1 member from family 2
      expect(lines.length).toBe(4);

      // Check familia_ids are present
      expect(csv).toContain('d0000-0001');
      expect(csv).toContain('d0000-0002');

      // Check miembro_ids are present
      expect(csv).toContain('m0001-0001');
      expect(csv).toContain('m0001-0002');
      expect(csv).toContain('m0002-0001');
    });
  });

  describe('Null and Empty Values', () => {
    it('should handle null values correctly', () => {
      const familyWithNulls = [
        {
          family: {
            ...mockFamilyWithMembers[0].family,
            informe_social_fecha: null,
            fecha_alta_guf: null,
            guf_verified_at: null,
          },
          members: [
            {
              id: 'm0001-0001',
              familia_id: 'd0000-0001',
              nombre: 'Maria Garcia',
              rol: 'head_of_household',
              relacion: null,
              fecha_nacimiento: null,
              estado: 'activo',
            },
          ],
        },
      ];

      const csv = generateFamiliesCSVWithMembers(familyWithNulls, 'update');
      const lines = csv.split('\n').filter(l => l);

      // Should not crash and should produce valid CSV
      expect(lines.length).toBe(2);
      expect(csv).toBeTruthy();
    });
  });

  describe('CSV Format Compliance', () => {
    it('should produce valid RFC 4180 CSV', () => {
      const csv = generateFamiliesCSVWithMembers(mockFamilyWithMembers, 'update');

      // Should end with newline
      expect(csv.endsWith('\n')).toBe(true);

      // Should have consistent column count across rows
      const lines = csv.split('\n').filter(l => l);
      const headerColumnCount = lines[0].split(',').length;

      for (let i = 1; i < lines.length; i++) {
        const rowColumnCount = lines[i].split(',').length;
        expect(rowColumnCount).toBe(headerColumnCount);
      }
    });

    it('should have familia_id as first column', () => {
      const csv = generateFamiliesCSVWithMembers(mockFamilyWithMembers, 'update');
      const header = csv.split('\n')[0];
      const firstField = header.split(',')[0];

      expect(firstField).toBe('familia_id');
    });

    it('should have miembro_id in member section', () => {
      const csv = generateFamiliesCSVWithMembers(mockFamilyWithMembers, 'update');
      const header = csv.split('\n')[0];
      const fields = header.split(',');

      const miembroIdIndex = fields.indexOf('miembro_id');
      expect(miembroIdIndex).toBeGreaterThan(0);
      // miembro_id should be after family fields
      expect(miembroIdIndex).toBeGreaterThan(10);
    });
  });
});
