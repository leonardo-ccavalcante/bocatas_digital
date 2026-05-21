/**
 * feedHelpers.test.ts — Unit tests for the pure feed-partition helpers.
 *
 * Uses a fixed `now` date so results are fully deterministic.
 * NOW = 2026-05-20T12:00:00Z (Wednesday)
 */

import { describe, it, expect } from "vitest";
import {
  getDaysDiff,
  getTimeBucket,
  partitionFeed,
  type FeedItem,
  type TimeBucket,
} from "../feedHelpers";

// Fixed reference time: 2026-05-20 12:00:00 UTC
const NOW = new Date("2026-05-20T12:00:00Z");

// ─── getTimeBucket ─────────────────────────────────────────────────────────────

describe("getTimeBucket", () => {
  it('returns "Hoy" for an item created today (same calendar day)', () => {
    // Same day, earlier time
    const result = getTimeBucket("2026-05-20T08:00:00Z", NOW);
    expect(result).toBe<TimeBucket>("Hoy");
  });

  it('returns "Hoy" for an item created at the very start of today', () => {
    const result = getTimeBucket("2026-05-20T00:00:01Z", NOW);
    expect(result).toBe<TimeBucket>("Hoy");
  });

  it('returns "Esta semana" for an item created yesterday', () => {
    const result = getTimeBucket("2026-05-19T18:30:00Z", NOW);
    expect(result).toBe<TimeBucket>("Esta semana");
  });

  it('returns "Esta semana" for an item created 6 days ago', () => {
    const result = getTimeBucket("2026-05-14T09:00:00Z", NOW);
    expect(result).toBe<TimeBucket>("Esta semana");
  });

  it('returns "Anteriores" for an item created exactly 7 days ago', () => {
    const result = getTimeBucket("2026-05-13T12:00:00Z", NOW);
    expect(result).toBe<TimeBucket>("Anteriores");
  });

  it('returns "Anteriores" for an item created 2 weeks ago', () => {
    const result = getTimeBucket("2026-05-06T09:00:00Z", NOW);
    expect(result).toBe<TimeBucket>("Anteriores");
  });

  it('returns "Anteriores" for an item created 1 month ago', () => {
    const result = getTimeBucket("2026-04-20T09:00:00Z", NOW);
    expect(result).toBe<TimeBucket>("Anteriores");
  });
});

// ─── getTimeBucket — future-date + boundary tests ──────────────────────────────

describe("getTimeBucket (boundary + future)", () => {
  it('returns "Hoy" for a future date (tomorrow)', () => {
    const tomorrow = "2026-05-21T08:00:00Z";
    expect(getTimeBucket(tomorrow, NOW)).toBe<TimeBucket>("Hoy");
  });

  it('returns "Hoy" for today midnight (exact boundary)', () => {
    const todayMidnight = "2026-05-20T00:00:00Z";
    expect(getTimeBucket(todayMidnight, NOW)).toBe<TimeBucket>("Hoy");
  });

  it('returns "Esta semana" for exactly 6 days ago', () => {
    const sixDaysAgo = "2026-05-14T09:00:00Z";
    expect(getTimeBucket(sixDaysAgo, NOW)).toBe<TimeBucket>("Esta semana");
  });

  it('returns "Anteriores" for exactly 7 days ago', () => {
    const sevenDaysAgo = "2026-05-13T12:00:00Z";
    expect(getTimeBucket(sevenDaysAgo, NOW)).toBe<TimeBucket>("Anteriores");
  });
});

// ─── getDaysDiff ────────────────────────────────────────────────────────────────

describe("getDaysDiff", () => {
  it("returns 0 for today", () => {
    expect(getDaysDiff("2026-05-20T08:00:00Z", NOW)).toBe(0);
  });

  it("returns negative for a future date (tomorrow = -1)", () => {
    expect(getDaysDiff("2026-05-21T10:00:00Z", NOW)).toBe(-1);
  });

  it("returns 1 for yesterday", () => {
    expect(getDaysDiff("2026-05-19T18:30:00Z", NOW)).toBe(1);
  });

  it("returns 7 for exactly 7 days ago", () => {
    expect(getDaysDiff("2026-05-13T12:00:00Z", NOW)).toBe(7);
  });
});

// ─── partitionFeed ─────────────────────────────────────────────────────────────

function makeItem(
  id: string,
  fijado: boolean,
  created_at: string
): FeedItem {
  return { id, fijado, created_at };
}

describe("partitionFeed", () => {
  it("places pinned items in the pinned array, not in any bucket", () => {
    const items: FeedItem[] = [
      makeItem("a", true, "2026-05-20T08:00:00Z"),
      makeItem("b", false, "2026-05-20T09:00:00Z"),
    ];
    const { pinned, buckets } = partitionFeed(items, NOW);

    expect(pinned).toHaveLength(1);
    expect(pinned[0].id).toBe("a");
    expect(buckets["Hoy"]).toHaveLength(1);
    expect(buckets["Hoy"][0].id).toBe("b");
  });

  it("puts a today item in the Hoy bucket", () => {
    const items: FeedItem[] = [
      makeItem("x", false, "2026-05-20T07:00:00Z"),
    ];
    const { buckets } = partitionFeed(items, NOW);
    expect(buckets["Hoy"]).toHaveLength(1);
    expect(buckets["Esta semana"]).toHaveLength(0);
    expect(buckets["Anteriores"]).toHaveLength(0);
  });

  it("puts a yesterday item in the Esta semana bucket", () => {
    const items: FeedItem[] = [
      makeItem("y", false, "2026-05-19T18:30:00Z"),
    ];
    const { buckets } = partitionFeed(items, NOW);
    expect(buckets["Esta semana"]).toHaveLength(1);
    expect(buckets["Hoy"]).toHaveLength(0);
  });

  it("puts a 7-day-old item in Anteriores bucket", () => {
    const items: FeedItem[] = [
      makeItem("z", false, "2026-05-13T12:00:00Z"),
    ];
    const { buckets } = partitionFeed(items, NOW);
    expect(buckets["Anteriores"]).toHaveLength(1);
  });

  it("handles an empty list without error", () => {
    const { pinned, buckets } = partitionFeed([], NOW);
    expect(pinned).toHaveLength(0);
    expect(buckets["Hoy"]).toHaveLength(0);
    expect(buckets["Esta semana"]).toHaveLength(0);
    expect(buckets["Anteriores"]).toHaveLength(0);
  });

  it("preserves item order within each bucket", () => {
    const items: FeedItem[] = [
      makeItem("first", false, "2026-05-20T11:00:00Z"),
      makeItem("second", false, "2026-05-20T10:00:00Z"),
    ];
    const { buckets } = partitionFeed(items, NOW);
    expect(buckets["Hoy"][0].id).toBe("first");
    expect(buckets["Hoy"][1].id).toBe("second");
  });

  it("handles all items pinned (buckets all empty)", () => {
    const items: FeedItem[] = [
      makeItem("p1", true, "2026-05-20T08:00:00Z"),
      makeItem("p2", true, "2026-05-19T08:00:00Z"),
    ];
    const { pinned, buckets } = partitionFeed(items, NOW);
    expect(pinned).toHaveLength(2);
    expect(buckets["Hoy"]).toHaveLength(0);
    expect(buckets["Esta semana"]).toHaveLength(0);
    expect(buckets["Anteriores"]).toHaveLength(0);
  });

  it("spreads items across multiple buckets correctly", () => {
    const items: FeedItem[] = [
      makeItem("today", false, "2026-05-20T09:00:00Z"),
      makeItem("week", false, "2026-05-17T09:00:00Z"),
      makeItem("old", false, "2026-04-01T09:00:00Z"),
      makeItem("pinned", true, "2026-05-20T10:00:00Z"),
    ];
    const { pinned, buckets } = partitionFeed(items, NOW);

    expect(pinned).toHaveLength(1);
    expect(pinned[0].id).toBe("pinned");
    expect(buckets["Hoy"]).toHaveLength(1);
    expect(buckets["Hoy"][0].id).toBe("today");
    expect(buckets["Esta semana"]).toHaveLength(1);
    expect(buckets["Esta semana"][0].id).toBe("week");
    expect(buckets["Anteriores"]).toHaveLength(1);
    expect(buckets["Anteriores"][0].id).toBe("old");
  });
});
