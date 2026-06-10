/**
 * Regression test for Bug #8c/8d:
 * createAdminClient() and createUserImpersonationClient() were using
 * process.env.VITE_SUPABASE_URL (undefined in Node.js server context)
 * instead of process.env.SUPABASE_URL.
 *
 * VITE_ prefixed env vars are only injected into the browser bundle by Vite;
 * they are NOT available in process.env on the server side.
 *
 * This test verifies that the clients are created with the CORRECT URL
 * by inspecting the `supabaseUrl` property exposed by the Supabase client.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const CORRECT_URL = 'https://correct.supabase.co';
const WRONG_URL = 'https://wrong-vite.supabase.co';

describe('Supabase server.ts — correct env var usage (Bug #8c/8d)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createAdminClient', () => {
    it('uses SUPABASE_URL (not VITE_SUPABASE_URL) as the client URL', async () => {
      // Arrange: SUPABASE_URL is the correct server-side var; VITE_SUPABASE_URL is the wrong one
      process.env.SUPABASE_URL = CORRECT_URL;
      process.env.VITE_SUPABASE_URL = WRONG_URL; // should be ignored
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      // Act
      const { createAdminClient } = await import('../../client/src/lib/supabase/server');
      const client = createAdminClient() as unknown as { supabaseUrl: string };

      // Assert: must use SUPABASE_URL, not VITE_SUPABASE_URL
      expect(client.supabaseUrl).toBe(CORRECT_URL);
      expect(client.supabaseUrl).not.toBe(WRONG_URL);
    });

    it('uses SUPABASE_URL even when VITE_SUPABASE_URL is absent', async () => {
      // Arrange: only SUPABASE_URL is set (realistic server environment)
      process.env.SUPABASE_URL = CORRECT_URL;
      delete process.env.VITE_SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      // Act
      const { createAdminClient } = await import('../../client/src/lib/supabase/server');
      const client = createAdminClient() as unknown as { supabaseUrl: string };

      // Assert
      expect(client.supabaseUrl).toBe(CORRECT_URL);
    });

    it('throws when SUPABASE_URL is absent (Supabase v2 requires a valid URL)', async () => {
      // Arrange: neither URL is set — Supabase v2 throws "supabaseUrl is required."
      delete process.env.SUPABASE_URL;
      delete process.env.VITE_SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

      // Act & Assert: Supabase v2 validates the URL and throws if empty
      const { createAdminClient } = await import('../../client/src/lib/supabase/server');
      expect(() => createAdminClient()).toThrow();
    });
  });

  describe('createUserImpersonationClient', () => {
    it('uses SUPABASE_URL (not VITE_SUPABASE_URL) as the client URL', async () => {
      // Arrange
      process.env.SUPABASE_URL = CORRECT_URL;
      process.env.VITE_SUPABASE_URL = WRONG_URL; // should be ignored
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.VITE_SUPABASE_ANON_KEY = 'wrong-anon-key'; // should be ignored
      process.env.SUPABASE_JWT_SECRET = 'a'.repeat(32); // 32-char secret for HS256

      // Act
      const { createUserImpersonationClient } = await import('../../client/src/lib/supabase/server');
      const client = await createUserImpersonationClient('actor-123', 'admin') as unknown as { supabaseUrl: string };

      // Assert: must use SUPABASE_URL, not VITE_SUPABASE_URL
      expect(client.supabaseUrl).toBe(CORRECT_URL);
      expect(client.supabaseUrl).not.toBe(WRONG_URL);
    });

    it('uses SUPABASE_ANON_KEY (not VITE_SUPABASE_ANON_KEY)', async () => {
      // Arrange
      process.env.SUPABASE_URL = CORRECT_URL;
      process.env.SUPABASE_ANON_KEY = 'correct-anon-key';
      process.env.VITE_SUPABASE_ANON_KEY = 'wrong-anon-key'; // should be ignored
      process.env.SUPABASE_JWT_SECRET = 'b'.repeat(32);

      // Act
      const { createUserImpersonationClient } = await import('../../client/src/lib/supabase/server');
      const client = await createUserImpersonationClient('actor-123', 'admin') as unknown as { supabaseKey: string };

      // Assert: must use SUPABASE_ANON_KEY, not VITE_SUPABASE_ANON_KEY
      expect(client.supabaseKey).toBe('correct-anon-key');
      expect(client.supabaseKey).not.toBe('wrong-anon-key');
    });
  });
});
