import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Integration Tests
 *
 * Verify that deliveries and families tables are accessible
 * and can be queried. (entregas/entregas_batch were consolidated
 * into deliveries — see refactor commit ba7e2c2)
 */
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials for tests');
}
const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Supabase Tables Integration', () => {
  describe('Table Accessibility', () => {
    it('deliveries table should be queryable', async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('*', { count: 'exact' })
        .limit(0);
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('families table should be queryable', async () => {
      const { data, error } = await supabase
        .from('families')
        .select('*', { count: 'exact' })
        .limit(0);
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('Families Table Schema', () => {
    it('should have required family columns', async () => {
      const { data, error } = await supabase
        .from('families')
        .select('id, familia_numero, titular_id, estado')
        .limit(1);
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should have sin_guf and sin_informe_social columns', async () => {
      const { data, error } = await supabase
        .from('families')
        .select('sin_guf, sin_informe_social')
        .limit(1);
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should retrieve families by estado', async () => {
      const { data, error } = await supabase
        .from('families')
        .select('id, estado')
        .eq('estado', 'activa')
        .limit(5);
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('Deliveries Table Schema', () => {
    it('should have required deliveries columns', async () => {
      const { data, error } = await supabase
        .from('deliveries')
        .select('id, family_id, fecha_entrega')
        .limit(1);
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should retrieve deliveries by family_id', async () => {
      const { data: families } = await supabase
        .from('families')
        .select('id')
        .limit(1);
      if (families && families.length > 0) {
        const familyId = families[0].id;
        const { data, error } = await supabase
          .from('deliveries')
          .select('*')
          .eq('family_id', familyId);
        expect(error).toBeNull();
        expect(Array.isArray(data)).toBe(true);
      }
    });
  });

  describe('Data Integrity', () => {
    it('families should have at least one record', async () => {
      const { data, error, count } = await supabase
        .from('families')
        .select('*', { count: 'exact' })
        .limit(1);
      expect(error).toBeNull();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('sin_guf column should be boolean', async () => {
      const { data, error } = await supabase
        .from('families')
        .select('sin_guf')
        .limit(1);
      expect(error).toBeNull();
      if (data && data.length > 0) {
        expect(typeof data[0].sin_guf).toBe('boolean');
      }
    });

    it('sin_informe_social column should be boolean', async () => {
      const { data, error } = await supabase
        .from('families')
        .select('sin_informe_social')
        .limit(1);
      expect(error).toBeNull();
      if (data && data.length > 0) {
        expect(typeof data[0].sin_informe_social).toBe('boolean');
      }
    });
  });
});
