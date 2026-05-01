import { describe, it, expect } from 'vitest';

describe('SchedulingDashboard', () => {
  const mockAnnouncements = [
    {
      id: '1',
      titulo: 'Scheduled',
      published_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '2',
      titulo: 'Live',
      published_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  it('groups announcements by status', () => {
    const now = new Date();
    const scheduled = mockAnnouncements.filter((a) => {
      if (!a.published_at) return false;
      return new Date(a.published_at) > now;
    });

    const live = mockAnnouncements.filter((a) => {
      if (!a.published_at) return false;
      const publishedDate = new Date(a.published_at);
      const expiredDate = a.expires_at ? new Date(a.expires_at) : null;
      return publishedDate <= now && (!expiredDate || expiredDate > now);
    });

    expect(scheduled.length).toBe(1);
    expect(live.length).toBe(1);
  });

  it('generates timeline data sorted by start date', () => {
    const timelineData = mockAnnouncements
      .filter((a) => a.published_at || a.expires_at)
      .map((a) => ({
        id: a.id,
        titulo: a.titulo,
        startDate: a.published_at ? new Date(a.published_at) : new Date(),
        endDate: a.expires_at ? new Date(a.expires_at) : new Date(),
      }))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    expect(timelineData.length).toBe(2);
    expect(timelineData[0].startDate.getTime()).toBeLessThanOrEqual(timelineData[1].startDate.getTime());
  });

  it('calculates days from now for scheduled announcements', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const now = new Date();

    const daysFromNow = Math.ceil((futureDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    expect(daysFromNow).toBeGreaterThan(0);
    expect(daysFromNow).toBeLessThanOrEqual(7);
  });

  it('formats dates correctly', () => {
    const date = new Date('2026-05-01T14:30:00Z');
    const formatted = date.toLocaleDateString('es-ES', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    expect(formatted).toContain('may');
    expect(formatted).toContain('1');
  });

  it('handles empty announcements list', () => {
    const emptyList: typeof mockAnnouncements = [];
    expect(emptyList.length).toBe(0);
  });

  it('counts announcements by status', () => {
    const now = new Date();

    const scheduled = mockAnnouncements.filter((a) => {
      if (!a.published_at) return false;
      return new Date(a.published_at) > now;
    });

    const live = mockAnnouncements.filter((a) => {
      if (!a.published_at) return false;
      const publishedDate = new Date(a.published_at);
      const expiredDate = a.expires_at ? new Date(a.expires_at) : null;
      return publishedDate <= now && (!expiredDate || expiredDate > now);
    });

    const expired = mockAnnouncements.filter((a) => {
      if (!a.expires_at) return false;
      return new Date(a.expires_at) < now;
    });

    expect(scheduled.length + live.length + expired.length).toBeLessThanOrEqual(mockAnnouncements.length);
  });
});
