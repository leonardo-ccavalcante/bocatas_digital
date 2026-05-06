import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateFamiliesCSVWithMembers } from '../csvExportWithMembers';
import { GUF_REFERENCE_FAMILIES } from './_fixtures/guf-reference-data';

/**
 * B.3.1 — GUF format pin (byte-equal).
 *
 * The fixture is currently GENERATED from the current exporter (not yet
 * validated against Espe/Sole's authoritative GUF reference template).
 * Once the real Banco de Alimentos template is committed to
 * `tests/fixtures/guf-reference.csv` (replacing the generated one), this
 * test becomes a hard format pin: any drift in column order, header text,
 * or escaping rules turns it red and forces a conscious update.
 *
 * TODO(Espe/Sole): Replace `tests/fixtures/guf-reference.csv` with the
 * authoritative GUF template before B.3 exit.
 */
describe('GUF CSV format (byte-equal pin)', () => {
  const fixturePath = resolve(
    process.cwd(),
    'tests/fixtures/guf-reference.csv'
  );

  function readFixtureBody(): string {
    const raw = readFileSync(fixturePath, 'utf-8');
    // Strip leading comment lines (starting with '#') so the test compares
    // only the CSV payload. Comment lines describe provenance and are not
    // part of the format contract.
    const lines = raw.split('\n');
    const firstNonComment = lines.findIndex((l) => !l.startsWith('#'));
    if (firstNonComment === -1) return '';
    return lines.slice(firstNonComment).join('\n');
  }

  it('current exporter output matches reference fixture byte-for-byte', () => {
    const exported = generateFamiliesCSVWithMembers(
      GUF_REFERENCE_FAMILIES,
      'update'
    );
    const referenceBody = readFixtureBody();

    expect(exported).toBe(referenceBody);
  });

  it('header column order is locked', () => {
    const referenceBody = readFixtureBody();
    const headerLine = referenceBody.split('\n')[0];

    // Lock exact header text + order. If the exporter changes a column name
    // or reorders, this assertion catches it before the byte-equal check.
    expect(headerLine).toBe(
      [
        'familia_id',
        'familia_numero',
        'nombre_familia',
        'contacto_principal',
        'telefono',
        'direccion',
        'estado',
        'fecha_creacion',
        'miembros_count',
        'docs_identidad',
        'padron_recibido',
        'justificante_recibido',
        'consent_bocatas',
        'consent_banco_alimentos',
        'informe_social',
        'informe_social_fecha',
        'alta_en_guf',
        'fecha_alta_guf',
        'guf_verified_at',
        'miembro_id',
        'familia_id',
        'miembro_nombre',
        'miembro_rol',
        'miembro_relacion',
        'miembro_fecha_nacimiento',
        'miembro_estado',
      ].join(',')
    );
  });

  it('fixture provenance comment is present until Espe/Sole template is committed', () => {
    const raw = readFileSync(fixturePath, 'utf-8');
    expect(raw.startsWith('# GENERATED FROM CURRENT EXPORTER')).toBe(true);
  });
});
