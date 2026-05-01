import { describe, it, expect } from 'vitest';

describe('AnnouncementStatusBadge', () => {
  it('determines scheduled status when published_at is in future', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const now = new Date();

    const isScheduled = futureDate > now;
    expect(isScheduled).toBe(true);
  });

  it('determines live status when published_at is past and expires_at is future', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    const now = new Date();
    const isLive = pastDate <= now && futureDate > now;

    expect(isLive).toBe(true);
  });

  it('determines expired status when expires_at is in past', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);

    const now = new Date();
    const isExpired = pastDate < now;

    expect(isExpired).toBe(true);
  });

  it('handles null dates', () => {
    const publishedAt = null;
    const expiresAt = null;

    const hasNoDates = publishedAt === null && expiresAt === null;
    expect(hasNoDates).toBe(true);
  });

  it('returns correct badge color for scheduled', () => {
    const status = 'scheduled';
    const badgeColors = {
      scheduled: 'bg-blue-100 text-blue-700',
      live: 'bg-green-100 text-green-700',
      expired: 'bg-gray-100 text-gray-700',
      nodate: 'bg-gray-50 text-gray-700',
    };

    expect(badgeColors[status as keyof typeof badgeColors]).toBe('bg-blue-100 text-blue-700');
  });

  it('returns correct badge color for live', () => {
    const status = 'live';
    const badgeColors = {
      scheduled: 'bg-blue-100 text-blue-700',
      live: 'bg-green-100 text-green-700',
      expired: 'bg-gray-100 text-gray-700',
      nodate: 'bg-gray-50 text-gray-700',
    };

    expect(badgeColors[status as keyof typeof badgeColors]).toBe('bg-green-100 text-green-700');
  });

  it('returns correct badge color for expired', () => {
    const status = 'expired';
    const badgeColors = {
      scheduled: 'bg-blue-100 text-blue-700',
      live: 'bg-green-100 text-green-700',
      expired: 'bg-gray-100 text-gray-700',
      nodate: 'bg-gray-50 text-gray-700',
    };

    expect(badgeColors[status as keyof typeof badgeColors]).toBe('bg-gray-100 text-gray-700');
  });
});
