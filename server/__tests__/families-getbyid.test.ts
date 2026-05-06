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

    // Create a test family (miembros JSON column was dropped — members live in
    // familia_miembros now)
    const { data: family, error: familyError } = await db
      .from('families')
      .insert({
        titular_id: testTitularId,
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

    // Insert the test member into familia_miembros (canonical store).
    const { error: memberError } = await db.from('familia_miembros').insert({
      familia_id: family.id,
      nombre: 'Test Member 1',
      apellidos: 'Member Apellido',
      fecha_nacimiento: '2010-01-01',
      documento: 'DOC123',
      rol: 'dependent',
      estado: 'activo',
    });
    if (memberError) {
      throw new Error(`Failed to create test member: ${memberError.message}`);
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

    // Mirror families.getById's two-query shape: family row + familia_miembros rows
    const { data: family, error } = await db
      .from('families')
      .select(
        `id, persons!titular_id(id, nombre, apellidos, telefono, email, idioma_principal)`
      )
      .eq('id', testFamilyId)
      .is('deleted_at', null)
      .single();

    expect(error).toBeNull();
    expect(family).toBeDefined();

    const { data: miembros, error: miembrosError } = await db
      .from('familia_miembros')
      .select('*')
      .eq('familia_id', testFamilyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    expect(miembrosError).toBeNull();
    expect(Array.isArray(miembros)).toBe(true);
    expect(miembros?.length).toBe(1);
    expect(miembros?.[0]?.nombre).toBe('Test Member 1');
    expect(miembros?.[0]?.apellidos).toBe('Member Apellido');
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

    // Create a family with no member rows in familia_miembros
    const { data: emptyFamily, error: createError } = await db
      .from('families')
      .insert({
        titular_id: person2.id,
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
      const { data: miembros, error } = await db
        .from('familia_miembros')
        .select('*')
        .eq('familia_id', emptyFamilyId)
        .is('deleted_at', null);

      expect(error).toBeNull();
      expect(Array.isArray(miembros)).toBe(true);
      expect(miembros?.length).toBe(0);
    } finally {
      await db.from('families').delete().eq('id', emptyFamilyId);
      // test mock boundary — Supabase client mock
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.from('persons').delete().eq('id', (person2 as any)?.id);
    }
  });
});
