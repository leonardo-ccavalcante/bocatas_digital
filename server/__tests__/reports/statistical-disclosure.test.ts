/**
 * statistical-disclosure.test.ts — RED→GREEN tests for the shared SDC helper.
 *
 * themis (RGPD review, CAS-05 follow-up) found the simple per-cell floor is
 * DEFEATED by *differencing* when an exact grand total is co-published over the
 * same row set. These tests perform that differencing recovery and assert it
 * now FAILS — i.e. complementary (secondary) suppression has widened the
 * suppressed set so the hidden cells can no longer be uniquely recovered.
 *
 * The attacker model in every test:
 *   suppressed_sum = published_total − Σ(visible cells)
 *   recovered iff: exactly 1 cell suppressed (value = suppressed_sum), OR
 *                  the suppressed_sum forces each suppressed cell to one value.
 */

import { describe, it, expect } from "vitest";

import { K_ANONYMITY_FLOOR } from "../../_core/mapaAggregation";
import {
  applySdc,
  formatSuppressedCount,
  type SdcCell,
} from "../../_core/statisticalDisclosure";

// ─── attacker oracle ─────────────────────────────────────────────────────────

/**
 * Given the original cells, the published total, and the suppressed output,
 * return the set of labels whose true count an attacker can UNIQUELY recover by
 * differencing. Empty set ⇒ the publication resists differencing.
 */
function uniquelyRecoverableLabels(
  original: ReadonlyArray<SdcCell>,
  publishedTotal: number,
  output: ReadonlyArray<{ label: string; count: number | null }>,
): string[] {
  const floor = K_ANONYMITY_FLOOR;
  const suppressedLabels = output.filter((c) => c.count === null).map((c) => c.label);
  const visibleSum = output.reduce((a, c) => a + (c.count ?? 0), 0);
  const suppressedSum = publishedTotal - visibleSum;

  if (suppressedLabels.length === 1) {
    // The lone hidden cell equals the residual exactly.
    return suppressedLabels;
  }

  // Enumerate all assignments of the suppressed cells in [1, floor-1] summing
  // to suppressedSum; a label is recovered iff it takes one value in all of them.
  const n = suppressedLabels.length;
  const lo = 1;
  const hi = floor - 1;
  const perPos: Array<Set<number>> = Array.from({ length: n }, () => new Set<number>());
  const cur: number[] = [];
  let valid = 0;
  (function rec(pos: number, rem: number) {
    if (pos === n) {
      if (rem === 0) {
        valid += 1;
        for (let i = 0; i < n; i++) perPos[i].add(cur[i]);
      }
      return;
    }
    for (let v = lo; v <= hi; v++) {
      if (v > rem) break;
      cur[pos] = v;
      rec(pos + 1, rem - v);
    }
  })(0, suppressedSum);

  if (valid === 0) return []; // inconsistent → no recovery (shouldn't happen)
  const recovered: string[] = [];
  for (let i = 0; i < n; i++) {
    if (perPos[i].size === 1) recovered.push(suppressedLabels[i]);
  }
  return recovered;
}

// ─── 1. primary floor still applies ──────────────────────────────────────────

describe("applySdc — primary floor", () => {
  it("blanks cells below the floor and passes ≥floor through", () => {
    const out = applySdc([
      { label: "a", count: 5 },
      { label: "b", count: 2 },
      { label: "c", count: 1 },
    ]);
    const m = new Map(out.map((c) => [c.label, c.count]));
    expect(m.get("a")).toBe(5);
    expect(m.get("b")).toBeNull();
    expect(m.get("c")).toBeNull();
  });

  it("no published total ⇒ complementary suppression is a no-op", () => {
    const out = applySdc([
      { label: "a", count: 5 },
      { label: "b", count: 4 },
    ]);
    expect(out).toEqual([
      { label: "a", count: 5 },
      { label: "b", count: 4 },
    ]);
  });
});

// ─── 2. BLOCKER 1 — differencing recovery now FAILS ──────────────────────────

describe("applySdc — defeats differencing (themis BLOCKER 1)", () => {
  it("single suppressed distrito is NOT recoverable from the total (was: exact recovery)", () => {
    // total = 12; visible {chamberi:5, centro:5} = 10; retiro=2 suppressed.
    // Naive floor: suppressed = 12 − 10 = 2 → recovered. SDC must widen.
    const cells: SdcCell[] = [
      { label: "chamberi", count: 5 },
      { label: "centro", count: 5 },
      { label: "retiro", count: 2 },
    ];
    const total = 12;
    const out = applySdc(cells, { publishedTotal: total });

    const recovered = uniquelyRecoverableLabels(cells, total, out);
    expect(recovered).toEqual([]); // attacker recovers NOTHING
    // retiro must still be hidden, and at least one more cell joined it.
    expect(out.find((c) => c.label === "retiro")?.count).toBeNull();
    expect(out.filter((c) => c.count === null).length).toBeGreaterThanOrEqual(2);
  });

  it("two suppressed cells with suppressed-sum=2 ({1,1}) are forced — SDC widens", () => {
    // total=12; visible {a:10}; b=1,c=1 suppressed; S=2 → only {1,1}, both forced.
    const cells: SdcCell[] = [
      { label: "a", count: 10 },
      { label: "b", count: 1 },
      { label: "c", count: 1 },
    ];
    const total = 12;
    const out = applySdc(cells, { publishedTotal: total });
    expect(uniquelyRecoverableLabels(cells, total, out)).toEqual([]);
  });

  it("two suppressed cells with suppressed-sum=4 ({2,2}) are forced — SDC widens", () => {
    // total=14; visible {a:10}; b=2,c=2 suppressed; S=4 → only {2,2}, both forced.
    const cells: SdcCell[] = [
      { label: "a", count: 10 },
      { label: "b", count: 2 },
      { label: "c", count: 2 },
    ];
    const total = 14;
    const out = applySdc(cells, { publishedTotal: total });
    expect(uniquelyRecoverableLabels(cells, total, out)).toEqual([]);
  });

  it("two suppressed cells with suppressed-sum=3 ({1,2}/{2,1}) are already SAFE — no over-suppression", () => {
    // total=13; visible {a:10}; b=1,c=2 suppressed; S=3 → {1,2} or {2,1}, neither forced.
    const cells: SdcCell[] = [
      { label: "a", count: 10 },
      { label: "b", count: 1 },
      { label: "c", count: 2 },
    ];
    const total = 13;
    const out = applySdc(cells, { publishedTotal: total });
    expect(uniquelyRecoverableLabels(cells, total, out)).toEqual([]);
    // a stays visible — we must NOT over-suppress a safe table.
    expect(out.find((c) => c.label === "a")?.count).toBe(10);
  });

  it("table with no small cells is untouched even with a total", () => {
    const cells: SdcCell[] = [
      { label: "a", count: 7 },
      { label: "b", count: 5 },
    ];
    const out = applySdc(cells, { publishedTotal: 12 });
    expect(out).toEqual([
      { label: "a", count: 7 },
      { label: "b", count: 5 },
    ]);
  });
});

// ─── 3. self-documenting label ───────────────────────────────────────────────

describe("formatSuppressedCount", () => {
  it("renders null as the explicit <3 marker", () => {
    expect(formatSuppressedCount(null)).toBe("<3");
  });
  it("renders a real count verbatim", () => {
    expect(formatSuppressedCount(7)).toBe("7");
  });
});
