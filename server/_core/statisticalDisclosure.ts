/**
 * statisticalDisclosure.ts — Shared statistical-disclosure-control (SDC) helper.
 *
 * ONE policy, reused everywhere (Karpathy: no parallel suppression mechanisms).
 * The simple per-cell k-anonymity floor (count < K_ANONYMITY_FLOOR → null) is
 * NECESSARY but NOT SUFFICIENT when the same report ALSO publishes an exact
 * grand total over the same row set. themis (RGPD review, CAS-05 follow-up)
 * showed the floor is DEFEATED by *differencing*:
 *
 *   total = 12, visible distritos sum to 10, ONE distrito suppressed
 *     → suppressed = 12 − 10 = 2   (exact recovery of the hidden count)
 *
 * and even with TWO suppressed cells the sum can FORCE each value:
 *
 *   K = 3 (a suppressed cell is therefore ≥1 and ≤2)
 *   two cells suppressed, suppressed sum S = total − Σ(visible):
 *     S = 2 → only {1,1}  → both cells forced  → recovered
 *     S = 4 → only {2,2}  → both cells forced  → recovered
 *     S = 3 → {1,2} or {2,1} → neither forced  → SAFE
 *
 * This module applies COMPLEMENTARY (secondary) suppression: after the primary
 * floor, if the suppressed cells are uniquely recoverable from the published
 * total, it suppresses additional smallest-visible cells until the suppressed
 * set is no longer uniquely recoverable.
 *
 * No I/O, no Supabase imports — pure functions, unit-tested in
 * server/__tests__/reports/statistical-disclosure.test.ts.
 */

import { K_ANONYMITY_FLOOR } from "./mapaAggregation";

/** A labelled count cell going into suppression. */
export interface SdcCell<L = string> {
  label: L;
  count: number;
}

/** A labelled count cell after suppression — null means "suppressed (<3)". */
export interface SuppressedCell<L = string> {
  label: L;
  /** null when suppressed (primary floor OR complementary). */
  count: number | null;
}

/**
 * Enumerate the number of integer compositions of `sum` into exactly `n`
 * ordered parts, each part in the inclusive domain [lo, hi], AND report
 * whether every part position is FORCED to a single value across all
 * compositions.
 *
 * "Forced" is the re-identification signal: if a cell can only take one
 * value given the published total, that cell is recovered even though it was
 * blanked. We cap enumeration defensively (suppressed sets are tiny in
 * practice — counts < K per cell) but the recursion is bounded by sum anyway.
 */
function compositionAnalysis(
  n: number,
  sum: number,
  lo: number,
  hi: number,
): { count: number; anyForced: boolean } {
  if (n === 0) {
    // The empty composition is "valid" only for sum 0.
    return { count: sum === 0 ? 1 : 0, anyForced: false };
  }

  // perPosition[i] = set of distinct values position i takes across all valid
  // compositions. A position is forced iff its set has exactly one value.
  const perPosition: Array<Set<number>> = Array.from(
    { length: n },
    () => new Set<number>(),
  );
  let total = 0;

  const current: number[] = [];
  function recurse(pos: number, remaining: number): void {
    if (pos === n) {
      if (remaining === 0) {
        total += 1;
        for (let i = 0; i < n; i++) perPosition[i].add(current[i]);
      }
      return;
    }
    // Prune: leave room for the remaining (n - pos - 1) positions at ≥ lo each
    // and ≤ hi each.
    const positionsLeftAfter = n - pos - 1;
    const minHere = Math.max(lo, remaining - positionsLeftAfter * hi);
    const maxHere = Math.min(hi, remaining - positionsLeftAfter * lo);
    for (let v = minHere; v <= maxHere; v++) {
      current[pos] = v;
      recurse(pos + 1, remaining - v);
    }
  }
  recurse(0, sum);

  const anyForced =
    total > 0 && perPosition.some((s) => s.size === 1);
  return { count: total, anyForced };
}

/**
 * Is the suppressed set uniquely recoverable from the published total?
 *
 * Recoverable (UNSAFE) when:
 *   • fewer than 2 cells are suppressed (0 → nothing hidden but a lone visible
 *     row vs total still leaks; 1 → suppressed = total − Σ(visible) exactly), OR
 *   • ≥2 cells are suppressed but the suppressed sum admits <2 compositions, OR
 *   • ≥2 cells are suppressed and some cell is FORCED to a single value
 *     (e.g. K=3, two cells, S∈{2,4}).
 *
 * Each suppressed cell's true value lies in [1, K-1] (≥1 because it existed,
 * ≤K-1 because it was below the floor).
 */
function isUniquelyRecoverable(
  suppressedCount: number,
  suppressedSum: number,
  floor: number,
): boolean {
  if (suppressedCount < 2) return true;
  const { count, anyForced } = compositionAnalysis(
    suppressedCount,
    suppressedSum,
    1,
    floor - 1,
  );
  // <2 valid arrangements ⇒ the (multiset of) values is pinned; or any single
  // cell forced ⇒ that cell is individually recovered.
  return count < 2 || anyForced;
}

/**
 * Apply statistical disclosure control to a count table.
 *
 * Step 1 (primary): every cell with count < floor → null.
 * Step 2 (complementary): only meaningful when `publishedTotal` is provided AND
 *   it is the EXACT total of the same row set the table is built from. While the
 *   suppressed set is uniquely recoverable from that total, promote the
 *   smallest still-visible cell to suppressed. This widens the suppressed set
 *   until an attacker differencing against the total can no longer pin the
 *   hidden cells.
 *
 * When `publishedTotal` is undefined the function is a primary-floor-only no-op
 * for complementary suppression — but it STILL centralises the policy so every
 * report routes through one code path.
 *
 * Ordering of the returned cells matches the input order (callers sort after).
 */
export function applySdc<L>(
  cells: ReadonlyArray<SdcCell<L>>,
  options: { floor?: number; publishedTotal?: number } = {},
): SuppressedCell<L>[] {
  const floor = options.floor ?? K_ANONYMITY_FLOOR;

  // Track suppression as a boolean per index so we can grow the set.
  const suppressed = cells.map((c) => c.count < floor);

  if (options.publishedTotal !== undefined) {
    const total = options.publishedTotal;

    // Loop: while the currently-suppressed set is recoverable from the total,
    // suppress the smallest visible cell. Bounded by the number of cells.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const suppressedSum =
        total -
        cells.reduce((acc, c, i) => acc + (suppressed[i] ? 0 : c.count), 0);
      const suppressedCount = suppressed.filter(Boolean).length;

      // If nothing is suppressed, there is nothing to protect via differencing.
      if (suppressedCount === 0) break;

      if (!isUniquelyRecoverable(suppressedCount, suppressedSum, floor)) break;

      // Find the smallest still-visible cell to promote.
      let smallestIdx = -1;
      for (let i = 0; i < cells.length; i++) {
        if (suppressed[i]) continue;
        if (smallestIdx === -1 || cells[i].count < cells[smallestIdx].count) {
          smallestIdx = i;
        }
      }
      // No visible cell left to suppress — can't improve; stop (everything is
      // already hidden, which is the maximally-safe state).
      if (smallestIdx === -1) break;
      suppressed[smallestIdx] = true;
    }
  }

  return cells.map((c, i) => ({
    label: c.label,
    count: suppressed[i] ? null : c.count,
  }));
}

/**
 * Convenience: render a suppressed count as a self-documenting CSV/table label.
 * A blank cell invites a reader to backfill it; "<3" states the policy
 * explicitly. Used in the CSV export path so shared artifacts are unambiguous.
 */
export function formatSuppressedCount(count: number | null): string {
  return count === null ? "<3" : String(count);
}
