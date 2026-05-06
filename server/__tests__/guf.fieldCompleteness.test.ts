import { describe, it, expect } from 'vitest';
import { generateFamiliesCSVWithMembers } from '../csvExportWithMembers';

/**
 * B.3.3 — Field completeness for ACTIVE families.
 *
 * Required columns (must be non-empty for every active family row in
 * 'update' export mode). Derived from the EXPORT_FIELDS.update.family list
 * in `server/csvExportWithMembers.ts`, narrowed to the columns Bocatas /
 * Banco de Alimentos must always have populated to operate:
 *
 *   - familia_id
 *   - familia_numero
 *   - nombre_familia
 *   - contacto_principal
 *   - telefono
 *   - estado
 *   - fecha_creacion
 *   - miembros_count
 *
 * Columns that are legitimately nullable for active families (kept OUT of
 * this list intentionally, document here so the next maintainer knows):
 *   - direccion           (may be unknown for newly registered families)
 *   - informe_social_fecha (only set when informe_social = true)
 *   - alta_en_guf         (boolean — false is a legitimate value)
 *   - fecha_alta_guf      (null when alta_en_guf = false)
 *   - guf_verified_at     (null until first verification)
 *   - boolean compliance flags (false is legitimate)
 */

const REQUIRED_COLUMNS_FOR_ACTIVE = [
  'familia_id',
  'familia_numero',
  'nombre_familia',
  'contacto_principal',
  'telefono',
  'estado',
  'fecha_creacion',
  'miembros_count',
] as const;

interface CompletenessFamily {
  id: string;
  familia_numero: string;
  nombre_familia: string;
  contacto_principal: string;
  telefono: string;
  direccion: string;
  estado: string;
  fecha_creacion: string;
  miembros_count: number;
  docs_identidad: boolean;
  padron_recibido: boolean;
  justificante_recibido: boolean;
  consent_bocatas: boolean;
  consent_banco_alimentos: boolean;
  informe_social: boolean;
  informe_social_fecha: string | null;
  alta_en_guf: boolean;
  fecha_alta_guf: string | null;
  guf_verified_at: string | null;
}

interface CompletenessMember {
  id: string;
  familia_id: string;
  nombre: string;
  rol: string;
  relacion: string | null;
  fecha_nacimiento: string | null;
  estado: string;
}

function makeActiveFamily(
  i: number
): { family: CompletenessFamily; members: CompletenessMember[] } {
  const id = `${i.toString(16).padStart(8, '0')}-0000-4000-8000-${i
    .toString(16)
    .padStart(12, '0')}`;
  return {
    family: {
      id,
      familia_numero: `FC-${i.toString().padStart(3, '0')}`,
      nombre_familia: `Familia ${i}`,
      contacto_principal: `Contacto ${i}`,
      telefono: `+34-600-${i.toString().padStart(3, '0')}-001`,
      direccion: '',
      estado: 'activo',
      fecha_creacion: '2026-01-01',
      miembros_count: 1,
      docs_identidad: false,
      padron_recibido: false,
      justificante_recibido: false,
      consent_bocatas: true,
      consent_banco_alimentos: false,
      informe_social: false,
      informe_social_fecha: null,
      alta_en_guf: false,
      fecha_alta_guf: null,
      guf_verified_at: null,
    },
    members: [
      {
        id: `${i.toString(16).padStart(8, '0')}-aaaa-4000-8000-${i
          .toString(16)
          .padStart(12, '0')}`,
        familia_id: id,
        nombre: `Titular ${i}`,
        rol: 'titular',
        relacion: null,
        fecha_nacimiento: null,
        estado: 'activo',
      },
    ],
  };
}

function parseHeader(csv: string): string[] {
  const firstLine = csv.split('\n')[0];
  return firstLine.split(',');
}

function parseRow(csv: string, rowIndex: number): string[] {
  // RFC 4180 aware splitter for a single line — needed because some columns
  // contain quoted commas. Walk the string respecting double-quote escapes.
  const lines: string[] = [];
  let current = '';
  let insideQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      if (insideQuotes && csv[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
      current += ch;
    } else if (ch === '\n' && !insideQuotes) {
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);

  const line = lines[rowIndex];
  if (!line) return [];

  const fields: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === ',' && !inQ) {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

describe('GUF CSV field completeness (active families)', () => {
  it('all required columns are non-empty for every active family in update mode', () => {
    const families = Array.from({ length: 10 }, (_, idx) =>
      makeActiveFamily(idx + 1)
    );
    const csv = generateFamiliesCSVWithMembers(families, 'update');
    const header = parseHeader(csv);

    // Build a map from required column name to its (first) header index.
    // Note: the CSV has `familia_id` twice (once for family, once as the
    // member-row foreign key). The first occurrence is the family-level value
    // — that is what we want for completeness.
    const requiredIndices = new Map<string, number>();
    for (const col of REQUIRED_COLUMNS_FOR_ACTIVE) {
      const idx = header.indexOf(col);
      expect(idx, `header must contain "${col}"`).toBeGreaterThanOrEqual(0);
      requiredIndices.set(col, idx);
    }

    const totalLines = csv.split('\n').filter((l) => l.length > 0).length;
    expect(totalLines).toBeGreaterThan(1);

    // Walk every data row (skip header).
    for (let rowIndex = 1; rowIndex < totalLines; rowIndex++) {
      const fields = parseRow(csv, rowIndex);
      for (const col of REQUIRED_COLUMNS_FOR_ACTIVE) {
        const colIdx = requiredIndices.get(col);
        if (colIdx === undefined) continue;
        const value = fields[colIdx];
        expect(
          value,
          `Row ${rowIndex + 1}, column "${col}" must be non-empty (got "${value}")`
        ).toBeDefined();
        expect(
          (value ?? '').trim().length,
          `Row ${rowIndex + 1}, column "${col}" must be non-empty (got "${value}")`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('documents the required-column contract', () => {
    // This test exists to make the required list visible in test output.
    // If the contract changes, the maintainer must update both the constant
    // above and this assertion deliberately.
    expect(REQUIRED_COLUMNS_FOR_ACTIVE).toEqual([
      'familia_id',
      'familia_numero',
      'nombre_familia',
      'contacto_principal',
      'telefono',
      'estado',
      'fecha_creacion',
      'miembros_count',
    ]);
  });
});
