import { describe, it, expect } from 'vitest';

/**
 * I2: Missing Data Minimization
 * volunteer_visible_fields controls which person fields are visible to volunteers
 * in the EnrolledPersonsTable.
 *
 * Rules:
 * - [] (empty) = no restrictions, show all columns
 * - ["nombre"] = only show nombre column for person data
 * - ["foto", "nombre"] = show foto + nombre
 *
 * Columns that can be restricted:
 * - foto (profile photo for visual identification)
 * - nombre (person name)
 * - notas (enrollment notes)
 * - fecha_inscripcion (enrollment date)
 * - estado (enrollment status) — always visible
 */

import { filterVisibleColumns } from '../utils/volunteerVisibility';

const ALL_COLS = ['foto', 'nombre', 'estado', 'fecha_inscripcion', 'notas'];

describe('I2: volunteer_visible_fields filtering', () => {
  describe('filterVisibleColumns', () => {
    it('should return all columns when volunteerVisibleFields is empty (no restrictions)', () => {
      const result = filterVisibleColumns(ALL_COLS, [], false);
      expect(result).toEqual(ALL_COLS);
    });

    it('should return all columns for admin regardless of volunteerVisibleFields', () => {
      const result = filterVisibleColumns(ALL_COLS, ['nombre'], true);
      expect(result).toEqual(ALL_COLS);
    });

    it('should filter columns for non-admin when volunteerVisibleFields is set', () => {
      const result = filterVisibleColumns(ALL_COLS, ['nombre', 'estado'], false);
      expect(result).toEqual(['nombre', 'estado']);
    });

    it('should always include estado column even if not in volunteerVisibleFields', () => {
      const result = filterVisibleColumns(ALL_COLS, ['nombre'], false);
      expect(result).toContain('estado');
      expect(result).toContain('nombre');
      expect(result).not.toContain('notas');
      expect(result).not.toContain('fecha_inscripcion');
    });

    it('should handle volunteerVisibleFields with unknown columns gracefully', () => {
      const result = filterVisibleColumns(ALL_COLS, ['nombre', 'unknown_field'], false);
      expect(result).toContain('nombre');
      expect(result).not.toContain('unknown_field');
    });

    it('should include foto column when listed in volunteerVisibleFields', () => {
      const result = filterVisibleColumns(ALL_COLS, ['foto', 'nombre'], false);
      expect(result).toContain('foto');
      expect(result).toContain('nombre');
      expect(result).not.toContain('notas');
    });

    it('should hide foto column for volunteers when not in volunteerVisibleFields', () => {
      const result = filterVisibleColumns(ALL_COLS, ['nombre', 'estado'], false);
      expect(result).not.toContain('foto');
    });
  });
});
