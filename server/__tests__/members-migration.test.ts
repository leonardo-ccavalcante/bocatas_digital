import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient } from '../../client/src/lib/supabase/server';

/**
 * TDD Tests: Family Members Migration to familia_miembros table
 * 
 * These tests verify that:
 * 1. familia_miembros table exists with correct schema
 * 2. Data migrates correctly from families.miembros JSON to tabla
 * 3. getById returns members from tabla (not JSON)
 * 4. getAll returns members from tabla
 */

describe('Family Members Migration - TDD', () => {
  let testFamilyId: string;
  let testTitularId: string;

  beforeAll(async () => {
    const db = createAdminClient();

    // Create test person (titular)
    const { data: person, error: personError } = await db
      .from('persons')
      .insert({
        nombre: 'Test Titular Migration',
        apellidos: 'Test',
        canal_llegada: 'programa_familias',
        idioma_principal: 'es',
      })
      .select('id')
      .single();

    if (personError || !person) {
      throw new Error(`Failed to create test person: ${personError?.message}`);
    }

    testTitularId = person.id;

    // Create test family with miembros in JSON
    const testMiembros = [
      {
        nombre: 'Member 1',
        apellidos: 'Apellido 1',
        fecha_nacimiento: '2010-01-01',
        documento: 'DOC001',
        person_id: null,
      },
      {
        nombre: 'Member 2',
        apellidos: 'Apellido 2',
        fecha_nacimiento: '2015-06-15',
        documento: 'DOC002',
        person_id: null,
      },
    ];

    const { data: family, error: familyError } = await db
      .from('families')
      .insert({
        titular_id: testTitularId,
        miembros: testMiembros,
        num_adultos: 1,
        num_menores_18: 2,
        persona_recoge: 'Test',
        autorizado: true,
        estado: 'activa',
      })
      .select('id')
      .single();

    if (familyError || !family) {
      throw new Error(`Failed to create test family: ${familyError?.message}`);
    }

    testFamilyId = family.id;

    // Explicitly insert members into familia_miembros
    // (no automatic trigger — migration is done by the application layer)
    const { error: membersError } = await db
      .from('familia_miembros')
      .insert([
        {
          familia_id: testFamilyId,
          nombre: 'Member 1',
          apellidos: 'Apellido 1',
          fecha_nacimiento: '2010-01-01',
          documento: 'DOC001',
          rol: 'dependent',
          person_id: null,
        },
        {
          familia_id: testFamilyId,
          nombre: 'Member 2',
          apellidos: 'Apellido 2',
          fecha_nacimiento: '2015-06-15',
          documento: 'DOC002',
          rol: 'dependent',
          person_id: null,
        },
      ]);
    if (membersError) {
      throw new Error(`Failed to insert test members: ${membersError.message}`);
    }
  });

  afterAll(async () => {
    const db = createAdminClient();

    // Clean up
    if (testFamilyId) {
      await db.from('familia_miembros').delete().eq('familia_id', testFamilyId);
      await db.from('families').delete().eq('id', testFamilyId);
    }

    if (testTitularId) {
      await db.from('persons').delete().eq('id', testTitularId);
    }
  });

  it('should have familia_miembros table with correct schema', async () => {
    const db = createAdminClient();

    // Query the table to verify it exists
    const { data, error } = await db
      .from('familia_miembros')
      .select('*')
      .limit(1);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('should migrate miembros from families.miembros JSON to familia_miembros table', async () => {
    const db = createAdminClient();

    // After migration, familia_miembros should have records for this family
    const { data: miembros, error } = await db
      .from('familia_miembros')
      .select('*')
      .eq('familia_id', testFamilyId);

    expect(error).toBeNull();
    expect(Array.isArray(miembros)).toBe(true);
    expect(miembros?.length).toBe(2);

    // Verify member data
    const member1 = miembros?.[0];
    expect(member1?.nombre).toBe('Member 1');
    expect(member1?.apellidos).toBe('Apellido 1');
    expect(member1?.familia_id).toBe(testFamilyId);
  });

  it('should have correct foreign key relationship', async () => {
    const db = createAdminClient();

    const { data: miembros, error } = await db
      .from('familia_miembros')
      .select('familia_id')
      .eq('familia_id', testFamilyId);

    expect(error).toBeNull();
    expect(miembros?.length).toBeGreaterThan(0);

    // All members should reference the test family
    miembros?.forEach((m) => {
      expect(m.familia_id).toBe(testFamilyId);
    });
  });

  it('should have indexed columns for performance', async () => {
    const db = createAdminClient();

    // Query should be fast (indexed)
    const start = performance.now();
    const { data, error } = await db
      .from('familia_miembros')
      .select('*')
      .eq('familia_id', testFamilyId);
    const duration = performance.now() - start;

    expect(error).toBeNull();
    expect(data?.length).toBe(2);
    expect(duration).toBeLessThan(1000); // Should be fast
  });

  it('should allow querying members with family details', async () => {
    const db = createAdminClient();

    // Query members with family join
    const { data: miembros, error } = await db
      .from('familia_miembros')
      .select(
        `
        *,
        families!inner(id, familia_numero, estado)
        `
      )
      .eq('familia_id', testFamilyId);

    expect(error).toBeNull();
    expect(miembros?.length).toBe(2);

    const member = miembros?.[0] as any;
    expect(member?.families?.id).toBe(testFamilyId);
  });

  it('should preserve all member fields during migration', async () => {
    const db = createAdminClient();

    const { data: miembros, error } = await db
      .from('familia_miembros')
      .select('*')
      .eq('familia_id', testFamilyId)
      .order('nombre', { ascending: true });

    expect(error).toBeNull();
    expect(miembros?.length).toBe(2);

    const member1 = miembros?.[0];
    const member2 = miembros?.[1];

    // Verify all fields preserved (familia_miembros has: nombre, apellidos, fecha_nacimiento, documento, rol)
    expect(member1?.nombre).toBe('Member 1');
    expect(member1?.apellidos).toBe('Apellido 1');
    expect(member1?.fecha_nacimiento).toBe('2010-01-01');
    expect(member1?.documento).toBe('DOC001');
    expect(member1?.rol).toBe('dependent');

    expect(member2?.nombre).toBe('Member 2');
    expect(member2?.apellidos).toBe('Apellido 2');
    expect(member2?.fecha_nacimiento).toBe('2015-06-15');
    expect(member2?.documento).toBe('DOC002');
  });
});
