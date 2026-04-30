import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Integration Tests
 * 
 * Verify that entregas, entregas_batch, and families tables
 * are accessible in Supabase PostgreSQL and can be queried.
 */

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials for tests');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

describe('Supabase Tables Integration', () => {
  describe('Table Accessibility', () => {
    it('entregas table should be queryable', async () => {
      const { data, error } = await supabase
        .from('entregas')
        .select('*', { count: 'exact' })
        .limit(0);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('entregas_batch table should be queryable', async () => {
      const { data, error } = await supabase
        .from('entregas_batch')
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

  describe('Entregas Table Schema', () => {
    it('should have required entregas columns', async () => {
      const { data, error } = await supabase
        .from('entregas')
        .select('id, familia_id, fecha')
        .limit(1);

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
    });

    it('should retrieve entregas by familia_id', async () => {
      // First get a family
      const { data: families } = await supabase
        .from('families')
        .select('id')
        .limit(1);

      if (families && families.length > 0) {
        const familiaId = families[0].id;

        const { data, error } = await supabase
          .from('entregas')
          .select('*')
          .eq('familia_id', familiaId);

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
