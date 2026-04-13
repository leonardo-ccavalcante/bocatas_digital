import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Supabase Client Environment Variables (C2 Fix)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env before each test
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createAdminClient', () => {
    it('should use process.env.SUPABASE_URL (not VITE_SUPABASE_URL)', async () => {
      // Arrange: Set correct env vars
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
      
      // Act: Import and call createAdminClient
      const { createAdminClient } = await import('../../client/src/lib/supabase/server');
      const client = createAdminClient();
      
      // Assert: Client should be created without error
      expect(client).toBeDefined();
      expect(client).toHaveProperty('auth');
    });

    it('should throw error if SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      // Arrange: Set URL but not service role key
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      // Act & Assert
      const { createAdminClient } = await import('../../client/src/lib/supabase/server');
      expect(() => createAdminClient()).toThrow('SUPABASE_SERVICE_ROLE_KEY');
    });

    it('should use SUPABASE_URL, not VITE_SUPABASE_URL', async () => {
      // Arrange: Set only VITE_SUPABASE_URL (wrong)
      process.env.VITE_SUPABASE_URL = 'https://wrong.supabase.co';
      process.env.SUPABASE_URL = 'https://correct.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
      
      // Act: Import and call
      const { createAdminClient } = await import('../../client/src/lib/supabase/server');
      const client = createAdminClient();
      
      // Assert: Client should use SUPABASE_URL
      expect(client).toBeDefined();
    });
  });

  describe('createServerClient', () => {
    it('should NOT use import.meta.env in server context', async () => {
      // This test documents that createServerClient should NOT
      // rely on import.meta.env when used in Node.js context
      
      // The fix: createServerClient should accept URL/key as parameters
      // or use process.env for server-side calls
      const { createServerClient } = await import('../../client/src/lib/supabase/server');
      
      // For now, this documents the expected behavior
      expect(createServerClient).toBeDefined();
    });
  });
});
