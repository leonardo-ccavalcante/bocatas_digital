/** @vitest-environment jsdom */
/**
 * useCheckinStore.persist.test.ts — F026 regression: the transient isSyncing
 * flag must never be persisted, and a legacy payload that DID persist
 * isSyncing:true (reload mid-flush) must rehydrate with isSyncing:false.
 * A stale true blocks every future flush — queued check-ins silently never
 * reach the server until the volunteer clears site data.
 *
 * jsdom on purpose: in the node environment localStorage does not exist when
 * the store module is imported, so zustand persist resolves no storage and
 * every persistence assertion would vacuously fail.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useCheckinStore } from "../useCheckinStore";

const STORAGE_KEY = "bocatas-checkin-store";
const LOCATION_A = "aaaaaaaa-1111-2222-3333-444444444444";
const PERSON_1 = "11111111-aaaa-bbbb-cccc-dddddddddddd";

// Exactly what a pre-v5 client left behind when the tab died mid-flush.
const LEGACY_V4_PAYLOAD = {
  state: {
    offlineQueue: [
      {
        clientId: "00000000-0000-0000-0000-000000000001",
        personId: PERSON_1,
        locationId: LOCATION_A,
        programa: "comedor",
        metodo: "qr_scan",
        isDemoMode: false,
        queuedAt: "2026-08-01T10:00:00.000Z",
      },
    ],
    failedClientIds: [],
    isSyncing: true,
    locationId: null,
    programa: "comedor",
  },
  version: 4,
};

beforeEach(() => {
  localStorage.clear();
  useCheckinStore.getState().clearQueue();
  useCheckinStore.getState().setIsSyncing(false);
});

describe("useCheckinStore persistence — transient isSyncing (F026)", () => {
  it("rehydrates a legacy mid-flush payload with isSyncing:false and the queue intact", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(LEGACY_V4_PAYLOAD));

    await useCheckinStore.persist.rehydrate();

    // The stale flag must not block future flushes; the queued item survives.
    expect(useCheckinStore.getState().isSyncing).toBe(false);
    expect(useCheckinStore.getState().offlineQueue).toHaveLength(1);
    expect(useCheckinStore.getState().offlineQueue[0].clientId).toBe(
      "00000000-0000-0000-0000-000000000001"
    );
  });

  it("never writes isSyncing to localStorage and stamps version 5", () => {
    // Any set() triggers a persist write; this one must not leak the flag.
    useCheckinStore.getState().setIsSyncing(true);

    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as {
      version?: number;
      state?: Record<string, unknown>;
    };
    expect(raw.state).toBeDefined();
    expect(Object.keys(raw.state ?? {})).not.toContain("isSyncing");
    expect(raw.version).toBe(5);

    useCheckinStore.getState().setIsSyncing(false);
  });
});
