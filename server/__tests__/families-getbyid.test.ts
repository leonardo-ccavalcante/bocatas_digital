import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient } from '../../client/src/lib/supabase/server';
import type { Database } from '../../client/src/lib/database.types';

/**
 * TDD Test: families.getById should return miembros array
 * 
 * Bug: Dashboard shows "Total miembros: 1" but modal shows "Miembros Actuales (0)"
 * Root cause: getById query uses `*` without explicitly selecting `miembros` JSON array
 * 
 * This test verifies that when a family with members is fetched, the miembros array is returned
 */

describe('families.getById - miembros array', () => {
  let testFamilyId: string;
  let testTitularId: string;

  beforeAll(async () => {
    const db = createAdminClient();

    // Create a test person (titular)
    const { data: person, error: personError } = await db
      .from('persons')
      .insert({
        nombre: 'Test Titular',
        apellidos: 'Test Apellido',
        canal_llegada: 'programa_familias',
        idioma_principal: 'es',
      })
      .select('id')
      .single();

    if (personError || !person) {
      throw new Error(`Failed to create test person: ${personError?.message}`);
    }

    testTitularId = person.id;

    // Create a test family with miembros array
    const testMiembros = [
      {
        nombre: 'Test Member 1',
        apellidos: 'Member Apellido',
        fecha_nacimiento: '2010-01-01',
        documento: 'DOC123',
        person_id: null,
      },
    ];

    const { data: family, error: familyError } = await db
      .from('families')
      .insert({
        titular_id: testTitularId,
        miembros: testMiembros,
        num_adultos: 1,
        num_menores_18: 1,
        persona_recoge: 'Test Person',
        autorizado: true,
        estado: 'activa',
      })
      .select('id')
      .single();

    if (familyError || !family) {
      throw new Error(`Failed to create test family: ${familyError?.message}`);
    }

    testFamilyId = family.id;
  });

  afterAll(async () => {
    const db = createAdminClient();

    // Clean up: delete test family and person
    if (testFamilyId) {
      await db.from('families').delete().eq('id', testFamilyId);
    }

    if (testTitularId) {
      await db.from('persons').delete().eq('id', testTitularId);
    }
  });

  it('should return miembros array when fetching family by id', async () => {
    const db = createAdminClient();

    // This is the exact query from families.getById procedure
    const { data: family, error } = await db
      .from('families')
      .select(
        `*, persons!titular_id(id, nombre, apellidos, telefono, email, idioma_principal)`
      )
      .eq('id', testFamilyId)
      .is('deleted_at', null)
      .single();

    // Verify no error
    expect(error).toBeNull();
    expect(family).toBeDefined();

    // CRITICAL: miembros array should be returned
    expect(family?.miembros).toBeDefined();
    expect(Array.isArray(family?.miembros)).toBe(true);
    expect((family?.miembros as unknown[])?.length).toBe(1);

    // Verify member data
    const member = (family?.miembros as unknown[])?.[0] as Record<string, unknown>;
    expect(member?.nombre).toBe('Test Member 1');
    expect(member?.apellidos).toBe('Member Apellido');
  });

  it('should have miembros array not null even if empty', async () => {
    const db = createAdminClient();

    // Create a second test person for this family
    const { data: person2, error: personError2 } = await db
      .from('persons')
      .insert({
        nombre: 'Test Titular 2',
        apellidos: 'Test Apellido 2',
        canal_llegada: 'programa_familias',
        idioma_principal: 'es',
      })
      .select('id')
      .single();

    if (personError2 || !person2) {
      throw new Error(`Failed to create second test person: ${personError2?.message}`);
    }

    // Create a family with empty miembros array
    const { data: emptyFamily, error: createError } = await db
      .from('families')
      .insert({
        titular_id: person2.id,
        miembros: [],
        num_adultos: 1,
        num_menores_18: 0,
        persona_recoge: 'Test Person',
        autorizado: true,
        estado: 'activa',
      })
      .select('id')
      .single();

    if (createError || !emptyFamily) {
      throw new Error(`Failed to create empty family: ${createError?.message}`);
    }

    const emptyFamilyId = emptyFamily.id;

    try {
      // Fetch with same query
      const { data: family, error } = await db
        .from('families')
        .select(
          `*, persons!titular_id(id, nombre, apellidos, telefono, email, idioma_principal)`
        )
        .eq('id', emptyFamilyId)
        .is('deleted_at', null)
        .single();

      expect(error).toBeNull();
      expect(family?.miembros).toBeDefined();
      expect(Array.isArray(family?.miembros)).toBe(true);
      expect((family?.miembros as unknown[])?.length).toBe(0);
    } finally {
      // Clean up
      await db.from('families').delete().eq('id', emptyFamilyId);
      await db.from('persons').delete().eq('id', (person2 as any)?.id);
    }
  });
});
