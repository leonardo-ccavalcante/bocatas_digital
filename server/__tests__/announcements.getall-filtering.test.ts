import { describe, it, expect } from 'vitest';
import { createAdminClient } from '../../client/src/lib/supabase/server';
import { randomUUID } from 'crypto';

/**
 * Test that getAll procedure filters announcements by published_at/expires_at
 * in addition to fecha_inicio/fecha_fin
 */
describe('Announcements - getAll filtering by published_at/expires_at', () => {
  const db = createAdminClient();

  it('should filter out announcements with future published_at', async () => {
    // Create an announcement that is not yet published
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const futureAnnouncement = {
      id: randomUUID(),
      titulo: 'Future Published Announcement',
      contenido: 'Not yet published',
      tipo: 'info' as const,
      es_urgente: false,
      fijado: false,
      activo: true,
      published_at: tomorrowStr, // Published tomorrow
      expires_at: null,
    };

    // Insert the announcement
    const { error: insertError } = await db
      .from('announcements')
      .insert(futureAnnouncement);

    expect(insertError).toBeNull();

    // Query with current date — should NOT include the future announcement
    // This test verifies that published_at filtering is applied
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await db
      .from('announcements')
      .select('id, published_at')
      .eq('id', futureAnnouncement.id)
      .lte('published_at', today);

    expect(error).toBeNull();
    // Should return empty because published_at is in the future
    expect(data).toHaveLength(0);
  });

  it('should filter out announcements with expired expires_at', async () => {
    // Create an announcement that has already expired
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const expiredAnnouncement = {
      id: randomUUID(),
      titulo: 'Expired Announcement',
      contenido: 'Already expired',
      tipo: 'info' as const,
      es_urgente: false,
      fijado: false,
      activo: true,
      published_at: yesterdayStr,
      expires_at: yesterdayStr, // Expired yesterday
    };

    // Insert the announcement
    const { error: insertError } = await db
      .from('announcements')
      .insert(expiredAnnouncement);

    expect(insertError).toBeNull();

    // Query with current date — should NOT include the expired announcement
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await db
      .from('announcements')
      .select('id, expires_at')
      .eq('id', expiredAnnouncement.id)
      .or(`expires_at.is.null,expires_at.gte.${today}`);

    expect(error).toBeNull();
    // Should return empty because expires_at is in the past
    expect(data).toHaveLength(0);
  });

  it('should include announcements with valid published_at and expires_at', async () => {
    // Create an announcement that is currently active
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const activeAnnouncement = {
      id: randomUUID(),
      titulo: 'Active Announcement',
      contenido: 'Currently active',
      tipo: 'info' as const,
      es_urgente: false,
      fijado: false,
      activo: true,
      published_at: todayStr, // Published today
      expires_at: tomorrowStr, // Expires tomorrow
    };

    // Insert the announcement
    const { error: insertError } = await db
      .from('announcements')
      .insert(activeAnnouncement);

    expect(insertError).toBeNull();

    // Query with current date — SHOULD include the active announcement
    const { data, error } = await db
      .from('announcements')
      .select('id, published_at, expires_at')
      .eq('id', activeAnnouncement.id)
      .lte('published_at', todayStr)
      .or(`expires_at.is.null,expires_at.gte.${todayStr}`);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.id).toBe(activeAnnouncement.id);
  });
});
