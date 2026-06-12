/**
 * syncResults.test.ts — POS-03 regression for the flush-result categorizer.
 *
 * Bug: the auto-flush onSuccess kept only synced/duplicate clientIds and
 * dropped "error" results on the floor — failed check-ins were never recorded
 * and so never surfaced to the volunteer.
 *
 * categorizeSyncResults must route every "error" result into `failed` (and
 * never into `settled`), so the hook can mark them and the badge can show them.
 *
 * MYTHOS: POS-03
 */
import { describe, it, expect } from "vitest";
import { categorizeSyncResults } from "../syncResults";

describe("categorizeSyncResults", () => {
  it("routes synced + duplicate to settled, error to failed", () => {
    const { settled, failed } = categorizeSyncResults([
      { clientId: "a", status: "synced" },
      { clientId: "b", status: "duplicate" },
      { clientId: "c", status: "error" },
      { clientId: "d", status: "error" },
    ]);
    expect(settled).toEqual(["a", "b"]);
    expect(failed).toEqual(["c", "d"]);
  });

  it("never drops an error result (the POS-03 bug)", () => {
    const results = [
      { clientId: "x", status: "error" as const },
      { clientId: "y", status: "synced" as const },
    ];
    const { settled, failed } = categorizeSyncResults(results);
    // Every input clientId is accounted for in exactly one bucket.
    expect([...settled, ...failed].sort()).toEqual(["x", "y"]);
    expect(failed).toContain("x");
  });

  it("handles an all-error batch", () => {
    const { settled, failed } = categorizeSyncResults([
      { clientId: "a", status: "error" },
      { clientId: "b", status: "error" },
    ]);
    expect(settled).toEqual([]);
    expect(failed).toEqual(["a", "b"]);
  });
});
