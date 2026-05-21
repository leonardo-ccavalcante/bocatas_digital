/**
 * feedHelpers.ts — Pure, side-effect-free helpers for the Novedades feed.
 *
 * All functions accept a `now` parameter so they are fully deterministic in
 * unit tests — no `new Date()` calls inside.
 *
 * Exported for:
 *  - Novedades.tsx (feed partition + bucketing)
 *  - __tests__/feedHelpers.test.ts (unit tests)
 */

/** Minimal shape required by the helpers — a subset of the announcement row */
export interface FeedItem {
  id: string;
  fijado: boolean;
  created_at: string;
}

export type TimeBucket = "Hoy" | "Esta semana" | "Anteriores";

export interface BucketedFeed<T extends FeedItem> {
  pinned: T[];
  buckets: Record<TimeBucket, T[]>;
}

const BUCKET_ORDER: TimeBucket[] = ["Hoy", "Esta semana", "Anteriores"];

/**
 * Compute the integer calendar-day difference between `createdAtIso` and `now`.
 *
 * Return value semantics (mirrors `todayMidnight - itemMidnight`):
 *   - 0   → same calendar day as now  ("today")
 *   - > 0 → item is in the past (positive = days ago)
 *   - < 0 → item is in the future
 *
 * Pure and deterministic: no `new Date()` calls inside.
 * Exported so NovedadItem.tsx can reuse it in `formatRelativeDate`.
 */
export function getDaysDiff(createdAtIso: string, now: Date): number {
  const todayMidnight = new Date(now);
  todayMidnight.setUTCHours(0, 0, 0, 0);

  const itemMidnight = new Date(createdAtIso);
  itemMidnight.setUTCHours(0, 0, 0, 0);

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (todayMidnight.getTime() - itemMidnight.getTime()) / msPerDay
  );
}

/**
 * Assign an item to a time bucket based on `created_at` vs `now`.
 *
 * Rules:
 *   - Today or future (daysDiff ≤ 0)  →  "Hoy"
 *   - Within the previous 6 calendar days (1 ≤ daysDiff ≤ 6)  →  "Esta semana"
 *   - Older (daysDiff ≥ 7)  →  "Anteriores"
 */
export function getTimeBucket(createdAt: string, now: Date): TimeBucket {
  const daysDiff = getDaysDiff(createdAt, now);

  // Future items (daysDiff < 0) and today (daysDiff === 0) both belong to "Hoy"
  if (daysDiff <= 0) return "Hoy";
  if (daysDiff <= 6) return "Esta semana";
  return "Anteriores";
}

/**
 * Partition items into pinned (top section) and time-bucketed groups.
 *
 * Pinned items are excluded from the bucket groups — they live in their own
 * "Anclados" section above.
 */
export function partitionFeed<T extends FeedItem>(
  items: T[],
  now: Date
): BucketedFeed<T> {
  const pinned: T[] = [];
  const buckets: Record<TimeBucket, T[]> = {
    Hoy: [],
    "Esta semana": [],
    Anteriores: [],
  };

  for (const item of items) {
    if (item.fijado) {
      pinned.push(item);
    } else {
      const bucket = getTimeBucket(item.created_at, now);
      buckets[bucket].push(item);
    }
  }

  return { pinned, buckets };
}

/** Ordered list of bucket labels for rendering (constant order: Hoy first). */
export { BUCKET_ORDER };
