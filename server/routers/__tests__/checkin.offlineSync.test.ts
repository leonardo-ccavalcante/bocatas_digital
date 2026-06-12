/**
 * checkin.offlineSync.test.ts — unit tests for the offline-sync pure helpers
 * extracted from checkin.ts.
 *
 * Covers the ARG-02 date derivation and the synced/duplicate/anonymous result
 * mapping (the "duplicate" branch is not reachable through the mocked-caller
 * test, which echoes every row back as inserted).
 *
 * MYTHOS: ARG-02
 */
import { describe, it, expect } from "vitest";
import {
  enrichOfflineItems,
  offlineAttendanceRows,
  offlineSyncResults,
  type OfflineSyncItem,
} from "../checkin.offlineSync";

function item(overrides: Partial<OfflineSyncItem> = {}): OfflineSyncItem {
  return {
    clientId: "c1",
    personId: "p1",
    locationId: "l1",
    programa: "comedor",
    metodo: "qr_scan",
    isDemoMode: false,
    queuedAt: "2020-01-15T23:55:00.000Z",
    ...overrides,
  };
}

describe("enrichOfflineItems", () => {
  it("derives checked_in_at + checked_in_date from queuedAt (cross-midnight)", () => {
    const [e] = enrichOfflineItems([item({ queuedAt: "2020-01-15T23:55:00.000Z" })]);
    expect(e.checkedInAt).toBe("2020-01-15T23:55:00.000Z");
    expect(e.checkedInDate).toBe("2020-01-15");
  });
});

describe("offlineAttendanceRows", () => {
  it("maps to attendance rows preserving es_demo + the derived timestamp/date", () => {
    const enriched = enrichOfflineItems([item({ isDemoMode: true })]);
    const [row] = offlineAttendanceRows(enriched);
    expect(row).toEqual({
      person_id: "p1",
      location_id: "l1",
      programa: "comedor",
      metodo: "qr_scan",
      es_demo: true,
      checked_in_at: "2020-01-15T23:55:00.000Z",
      checked_in_date: "2020-01-15",
    });
  });
});

describe("offlineSyncResults", () => {
  it("marks a named item synced when its key was inserted, duplicate otherwise", () => {
    const enriched = enrichOfflineItems([
      item({ clientId: "ins", personId: "pA" }),
      item({ clientId: "dup", personId: "pB" }),
    ]);
    // Only pA's key is in the inserted set → pB is a duplicate.
    const insertedKeys = new Set(["pA|l1|comedor|2020-01-15"]);
    const results = offlineSyncResults(enriched, insertedKeys);
    expect(results).toEqual([
      { clientId: "ins", status: "synced" },
      { clientId: "dup", status: "duplicate" },
    ]);
  });

  it("always marks anonymous (person_id null) items synced, regardless of keys", () => {
    const enriched = enrichOfflineItems([item({ clientId: "anon", personId: null })]);
    const results = offlineSyncResults(enriched, new Set());
    expect(results).toEqual([{ clientId: "anon", status: "synced" }]);
  });
});
