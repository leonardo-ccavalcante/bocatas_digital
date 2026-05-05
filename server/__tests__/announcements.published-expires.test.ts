import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient } from '../../client/src/lib/supabase/server';
import type { Database } from '../../client/src/lib/database.types';
import { randomUUID } from 'crypto';

describe('Announcements - published_at/expires_at columns', () => {
  const db = createAdminClient();

  it('should have published_at and expires_at columns in database.types', async () => {
    // This test verifies the TypeScript types include the new columns
    // The actual database migration will be verified by the next test
    
    // Type check: if this compiles, the columns exist in the type definition
    type AnnouncementRow = Database['public']['Tables']['announcements']['Row'];
    
    // These should not cause TypeScript errors
    const testRow: Partial<AnnouncementRow> = {
      published_at: '2026-05-01T00:00:00Z',
      expires_at: '2026-05-02T00:00:00Z',
    };
    
    expect(testRow.published_at).toBeDefined();
    expect(testRow.expires_at).toBeDefined();
  });

  it('should allow creating announcement with published_at and expires_at', async () => {
    const publishedDate = '2026-05-01';
    const expiresDate = '2026-05-02';
    
    const testData = {
      id: randomUUID(),
      titulo: 'Test Announcement',
      contenido: 'Test content',
      tipo: 'info' as const,
      es_urgente: false,
      fijado: false,
      activo: true,
      published_at: publishedDate,
      expires_at: expiresDate,
    };

    const { data, error } = await db
      .from('announcements')
      .insert(testData)
      .select();

    // If columns don't exist, this will fail with a column not found error
    if (error) {
      console.error('Insert error:', error);
      // This is expected if columns don't exist yet - the test will fail
      // which is correct for TDD (RED phase)
      expect(error).toBeNull();
    } else {
      expect(data).toBeDefined();
      // Columns are stored as DATE type (not TIMESTAMP), so they come back as YYYY-MM-DD
      expect(data?.[0]?.published_at).toBe(publishedDate);
      expect(data?.[0]?.expires_at).toBe(expiresDate);
    }
  });

  it('should filter announcements by published_at and expires_at in getAll', async () => {
    // Create test announcements with different published_at/expires_at (as DATE strings YYYY-MM-DD)
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const yesterday = new Date(today.getTime() - 86400000);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const tomorrow = new Date(today.getTime() + 86400000);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const futureId = randomUUID();
    const expiredId = randomUUID();
    const activeId = randomUUID();
    
    const testAnnouncements = [
      {
        id: futureId,
        titulo: 'Future announcement',
        contenido: 'Not yet published',
        tipo: 'info' as const,
        published_at: tomorrowStr,
        expires_at: null,
      },
      {
        id: expiredId,
        titulo: 'Expired announcement',
        contenido: 'Already expired',
        tipo: 'info' as const,
        published_at: yesterdayStr,
        expires_at: yesterdayStr,
      },
      {
        id: activeId,
        titulo: 'Active announcement',
        contenido: 'Currently active',
        tipo: 'info' as const,
        published_at: yesterdayStr,
        expires_at: tomorrowStr,
      },
    ];

    // Insert test data
    const { error: insertError } = await db
      .from('announcements')
      .insert(testAnnouncements);

    if (insertError) {
      console.error('Insert error:', insertError);
      expect(insertError).toBeNull();
      return;
    }

    // Query announcements visible at current time
    // Filter: published_at <= today AND (expires_at IS NULL OR expires_at >= today)
    const { data, error: queryError } = await db
      .from('announcements')
      .select('id, titulo, published_at, expires_at')
      .lte('published_at', todayStr)
      .or(`expires_at.is.null,expires_at.gte.${todayStr}`);

    if (queryError) {
      console.error('Query error:', queryError);
      expect(queryError).toBeNull();
      return;
    }

    // Should only return the active announcement (and any others that match the filter)
    const activeIds = data?.map(a => a.id) || [];
    expect(activeIds).toContain(activeId); // Active
    expect(activeIds).not.toContain(futureId); // Future (not yet published)
    expect(activeIds).not.toContain(expiredId); // Expired
  });
});
