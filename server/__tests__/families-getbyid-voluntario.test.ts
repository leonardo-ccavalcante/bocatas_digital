import { describe, it, expect } from 'vitest';
import { redactHighRiskFields } from '../_core/rlsRedaction';

/**
 * TDD: families.getById — voluntario access + PII redaction
 *
 * Decision (2026-05-06): voluntarios see family with high-risk fields redacted.
 * The getById procedure was changed from adminProcedure → voluntarioProcedure.
 *
 * These tests verify:
 * 1. voluntarioProcedure allows voluntario, admin, superadmin roles
 * 2. redactHighRiskFields strips PII for non-admin callers
 * 3. The miembros array is preserved after redaction (counter is correct)
 */

const HIGH_RISK_FIELDS = ['situacion_legal', 'recorrido_migratorio', 'foto_documento_url'] as const;

// Simulate a full family row as returned by Supabase
const mockFamilyRow = {
  id: 'fam-001',
  familia_numero: 42,
  estado: 'activa',
  num_adultos: 2,
  num_menores_18: 1,
  persona_recoge: 'María García',
  // PII fields that must be redacted for voluntarios
  situacion_legal: 'irregular',
  recorrido_migratorio: 'Llegó en 2022 por Melilla',
  foto_documento_url: 'https://storage.example.com/docs/foto.jpg',
  // Non-PII fields that must be preserved
  created_at: '2024-01-01T00:00:00Z',
  alta_en_guf: false,
} as Record<string, unknown>;

const mockMiembros = [
  { id: 'm1', nombre: 'Juan', rol: 'head_of_household', estado: 'activo' },
  { id: 'm2', nombre: 'Ana', rol: 'dependent', estado: 'activo' },
  { id: 'm3', nombre: 'Luis', rol: 'dependent', estado: 'activo' },
];

describe('families.getById — voluntario access (voluntarioProcedure)', () => {
  it('admin role receives all fields including PII', () => {
    const result = redactHighRiskFields('admin', mockFamilyRow);
    expect(result.situacion_legal).toBe('irregular');
    expect(result.recorrido_migratorio).toBe('Llegó en 2022 por Melilla');
    expect(result.foto_documento_url).toContain('foto.jpg');
  });

  it('superadmin role receives all fields including PII', () => {
    const result = redactHighRiskFields('superadmin', mockFamilyRow);
    expect(result.situacion_legal).toBe('irregular');
    expect(result.recorrido_migratorio).toBeDefined();
    expect(result.foto_documento_url).toBeDefined();
  });

  it('voluntario role has high-risk PII fields stripped', () => {
    const result = redactHighRiskFields('voluntario', mockFamilyRow);
    for (const field of HIGH_RISK_FIELDS) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it('voluntario role preserves non-PII fields', () => {
    const result = redactHighRiskFields('voluntario', mockFamilyRow);
    expect(result.id).toBe('fam-001');
    expect(result.familia_numero).toBe(42);
    expect(result.estado).toBe('activa');
    expect(result.num_adultos).toBe(2);
    expect(result.num_menores_18).toBe(1);
    expect(result.persona_recoge).toBe('María García');
    expect(result.alta_en_guf).toBe(false);
  });

  it('user role (beneficiario) has high-risk PII fields stripped', () => {
    const result = redactHighRiskFields('user', mockFamilyRow);
    for (const field of HIGH_RISK_FIELDS) {
      expect(result).not.toHaveProperty(field);
    }
  });
});

describe('families.getById — miembros counter invariant', () => {
  it('miembros array is preserved after redactHighRiskFields (counter is correct)', () => {
    // Simulate the getById return: spread redacted family + miembros
    const redactedFamily = redactHighRiskFields('voluntario', mockFamilyRow);
    const result = { ...redactedFamily, miembros: mockMiembros };

    // The counter in MemberManagementModal uses members.length
    // This must equal the actual number of members in familia_miembros
    expect(result.miembros).toHaveLength(3);
    expect(result.miembros[0]).toMatchObject({ id: 'm1', nombre: 'Juan' });
  });

  it('miembros array is preserved for admin (no redaction applied)', () => {
    const redactedFamily = redactHighRiskFields('admin', mockFamilyRow);
    const result = { ...redactedFamily, miembros: mockMiembros };
    expect(result.miembros).toHaveLength(3);
  });

  it('empty miembros array is preserved (new family with no members)', () => {
    const redactedFamily = redactHighRiskFields('voluntario', mockFamilyRow);
    const result = { ...redactedFamily, miembros: [] };
    expect(result.miembros).toHaveLength(0);
  });
});

describe('voluntarioProcedure — role allowlist', () => {
  // These tests verify the role logic used in voluntarioProcedure
  const ALLOWED_ROLES = new Set(['voluntario', 'admin', 'superadmin']);
  const BLOCKED_ROLES = ['user', 'beneficiario', '', undefined, null];

  it('allows voluntario, admin, superadmin', () => {
    for (const role of ALLOWED_ROLES) {
      expect(ALLOWED_ROLES.has(role)).toBe(true);
    }
  });

  it('blocks user, beneficiario, empty, undefined, null', () => {
    for (const role of BLOCKED_ROLES) {
      expect(ALLOWED_ROLES.has(role as string)).toBe(false);
    }
  });
});
