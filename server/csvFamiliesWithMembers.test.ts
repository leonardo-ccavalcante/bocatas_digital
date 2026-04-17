import { describe, it, expect } from 'vitest';
import { generateFamiliesWithMembersCSV, validateFamiliesWithMembersCSV, parseFamiliesWithMembersCSV } from './csvFamiliesWithMembers';

describe('CSV Export/Import - Families with Members', () => {
  describe('Export: Families with Members to CSV', () => {
    it('should export single family with single member', () => {
      const data = [
        {
          familia_id: 'fam-1',
          familia_numero: 1,
          estado: 'activo',
          miembro_nombre: 'Juan García',
          miembro_rol: 'titular',
          miembro_relacion: null,
          miembro_fecha_nacimiento: '1980-01-15',
        },
      ];

      const csv = generateFamiliesWithMembersCSV(data);

      expect(csv).toContain('familia_numero,estado,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento');
      expect(csv).toContain('1,activo,Juan García,titular,,1980-01-15');
    });

    it('should export family with multiple members', () => {
      const data = [
        {
          familia_id: 'fam-1',
          familia_numero: 1,
          estado: 'activo',
          miembro_nombre: 'Juan García',
          miembro_rol: 'titular',
          miembro_relacion: null,
          miembro_fecha_nacimiento: '1980-01-15',
        },
        {
          familia_id: 'fam-1',
          familia_numero: 1,
          estado: 'activo',
          miembro_nombre: 'María García',
          miembro_rol: 'cónyuge',
          miembro_relacion: 'esposa',
          miembro_fecha_nacimiento: '1982-03-20',
        },
      ];

      const csv = generateFamiliesWithMembersCSV(data);

      expect(csv).toContain('1,activo,Juan García,titular,,1980-01-15');
      expect(csv).toContain('1,activo,María García,cónyuge,esposa,1982-03-20');
    });

    it('should handle CSV special characters (quotes, commas) correctly', () => {
      const data = [
        {
          familia_id: 'fam-1',
          familia_numero: 1,
          estado: 'activo',
          miembro_nombre: 'García, Juan "El Mayor"',
          miembro_rol: 'titular',
          miembro_relacion: null,
          miembro_fecha_nacimiento: '1980-01-15',
        },
      ];

      const csv = generateFamiliesWithMembersCSV(data);

      // Should be properly escaped with quotes
      expect(csv).toContain('"García, Juan ""El Mayor"""');
    });

    it('should export multiple families', () => {
      const data = [
        {
          familia_id: 'fam-1',
          familia_numero: 1,
          estado: 'activo',
          miembro_nombre: 'Juan García',
          miembro_rol: 'titular',
          miembro_relacion: null,
          miembro_fecha_nacimiento: '1980-01-15',
        },
        {
          familia_id: 'fam-2',
          familia_numero: 2,
          estado: 'activo',
          miembro_nombre: 'Pedro López',
          miembro_rol: 'titular',
          miembro_relacion: null,
          miembro_fecha_nacimiento: '1975-06-10',
        },
      ];

      const csv = generateFamiliesWithMembersCSV(data);

      expect(csv).toContain('1,activo,Juan García');
      expect(csv).toContain('2,activo,Pedro López');
    });
  });

  describe('Import: Validate CSV before import', () => {
    it('should accept valid CSV with families and members', () => {
      const csv = `familia_numero,estado,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento
1,activo,Juan García,titular,,1980-01-15
1,activo,María García,cónyuge,esposa,1982-03-20
2,activo,Pedro López,titular,,1975-06-10`;

      const result = validateFamiliesWithMembersCSV(csv);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.recordCount).toBe(3);
    });

    it('should reject CSV with missing required fields', () => {
      const csv = `familia_numero,estado,miembro_nombre
1,activo,Juan García
1,activo,María García`;

      const result = validateFamiliesWithMembersCSV(csv);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('miembro_rol');
    });

    it('should reject CSV with invalid familia_numero (not a number)', () => {
      const csv = `familia_numero,estado,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento
abc,activo,Juan García,titular,,1980-01-15`;

      const result = validateFamiliesWithMembersCSV(csv);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('familia_numero');
      expect(result.errors[0]).toContain('number');
    });

    it('should detect duplicate members in same family', () => {
      const csv = `familia_numero,estado,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento
1,activo,Juan García,titular,,1980-01-15
1,activo,Juan García,titular,,1980-01-15`;

      const result = validateFamiliesWithMembersCSV(csv);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('duplicate'))).toBe(true);
    });

    it('should validate fecha_nacimiento format (ISO 8601)', () => {
      const csv = `familia_numero,estado,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento
1,activo,Juan García,titular,,15/01/1980`;

      const result = validateFamiliesWithMembersCSV(csv);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('fecha_nacimiento'))).toBe(true);
    });
  });

  describe('Import: Parse and create families with members', () => {
    it('should parse CSV and group members by family', () => {
      const csv = `familia_numero,estado,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento
1,activo,Juan García,titular,,1980-01-15
1,activo,María García,cónyuge,esposa,1982-03-20
2,activo,Pedro López,titular,,1975-06-10`;

      const result = parseFamiliesWithMembersCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].familia_numero).toBe(1);
      expect(result[0].miembros).toHaveLength(2);
      expect(result[1].familia_numero).toBe(2);
      expect(result[1].miembros).toHaveLength(1);
    });

    it('should handle merge strategy: overwrite', () => {
      const csv = `familia_numero,estado,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento
1,inactivo,Juan García,titular,,1980-01-15`;

      const result = parseFamiliesWithMembersCSV(csv, 'overwrite');

      expect(result[0].mergeStrategy).toBe('overwrite');
      expect(result[0].estado).toBe('inactivo');
    });

    it('should handle merge strategy: merge (default)', () => {
      const csv = `familia_numero,estado,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento
1,,Juan García,titular,,1980-01-15`;

      const result = parseFamiliesWithMembersCSV(csv, 'merge');

      expect(result[0].mergeStrategy).toBe('merge');
      // Empty estado should not override existing value
      expect(result[0].estado).toBeUndefined();
    });
  });

  describe('CSV Format Compliance', () => {
    it('should follow RFC 4180 CSV standard', () => {
      const data = [
        {
          familia_id: 'fam-1',
          familia_numero: 1,
          estado: 'activo',
          miembro_nombre: 'Test',
          miembro_rol: 'titular',
          miembro_relacion: null,
          miembro_fecha_nacimiento: '1980-01-15',
        },
      ];

      const csv = generateFamiliesWithMembersCSV(data);
      const lines = csv.split('\n');

      // Should have header
      expect(lines[0]).toContain('familia_numero');

      // Should have data rows
      expect(lines.length).toBeGreaterThan(1);

      // Should end with newline
      expect(csv.endsWith('\n')).toBe(true);
    });
  });
});
