/** @vitest-environment jsdom */
/**
 * useCheckin.flush.test.ts — F026/F033: offline-queue flush lifecycle.
 *
 * The sync mutation's callbacks MUST be registered at useMutation level:
 * TanStack v5 runs those even when the observing component unmounted
 * mid-flight (navigation during a flush). mutate()-level callbacks are
 * skipped on unmount, which used to leave isSyncing stuck at true and the
 * queue frozen forever. Also covers the manual retry path (retrySync) for
 * items whose last sync attempt failed. Same vi.hoisted + vi.mock pattern
 * as useMapaData.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

type SyncLifecycle = {
  onSuccess: (
    results: { clientId: string; status: "synced" | "duplicate" | "error" }[]
  ) => void;
  onError: (err: Error, attempted: { clientId: string }[]) => void;
  onSettled: () => void;
};

const { mockSyncMutate, mockSyncUseMutation, capturedOptions } = vi.hoisted(() => {
  const mockSyncMutate = vi.fn();
  const capturedOptions: { current: SyncLifecycle | undefined } = { current: undefined };
  const mockSyncUseMutation = vi.fn((options?: SyncLifecycle) => {
    capturedOptions.current = options;
    return { mutate: mockSyncMutate };
  });
  return { mockSyncMutate, mockSyncUseMutation, capturedOptions };
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    checkin: {
      verifyAndInsert: { useMutation: vi.fn(() => ({ mutate: vi.fn() })) },
      anonymousCheckin: { useMutation: vi.fn(() => ({ mutate: vi.fn() })) },
      syncOfflineQueue: { useMutation: mockSyncUseMutation },
    },
  },
}));

vi.mock("@/lib/posthog", () => ({ capture: vi.fn() }));

// Import AFTER mocks
import { useCheckin } from "../useCheckin";
import { useCheckinStore } from "../../store/useCheckinStore";

const LOCATION_A = "aaaaaaaa-1111-2222-3333-444444444444";
const PERSON_1 = "11111111-aaaa-bbbb-cccc-dddddddddddd";

function enqueueOne(): string {
  return useCheckinStore.getState().enqueue({
    personId: PERSON_1,
    locationId: LOCATION_A,
    programa: "comedor",
    metodo: "qr_scan",
    isDemoMode: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOptions.current = undefined;
  localStorage.clear();
  useCheckinStore.getState().clearQueue();
  useCheckinStore.getState().setIsSyncing(false);
});

afterEach(() => cleanup());

describe("useCheckin — flush lifecycle survives unmount (F026)", () => {
  it("registers callbacks at useMutation level and clears isSyncing after unmount", () => {
    const clientId = enqueueOne();
    const { unmount } = renderHook(() => useCheckin());

    // Mount flush fired with the queue as the ONLY argument — no
    // mutate()-level callbacks (those are skipped on unmount).
    expect(mockSyncMutate).toHaveBeenCalledTimes(1);
    expect(mockSyncMutate.mock.calls[0]).toHaveLength(1);
    expect(useCheckinStore.getState().isSyncing).toBe(true);

    // Volunteer navigates away while the request is in flight…
    unmount();

    // …and the server answers afterwards: mutation-level callbacks still run.
    const options = capturedOptions.current;
    expect(options).toBeDefined();
    act(() => {
      options?.onSuccess([{ clientId, status: "synced" }]);
      options?.onSettled();
    });

    expect(useCheckinStore.getState().isSyncing).toBe(false);
    expect(useCheckinStore.getState().offlineQueue).toHaveLength(0);
  });

  it("marks the whole batch failed on a transport error and unblocks isSyncing", () => {
    const clientId = enqueueOne();
    renderHook(() => useCheckin());
    expect(mockSyncMutate).toHaveBeenCalledTimes(1);

    act(() => {
      capturedOptions.current?.onError(new Error("HTTP 500"), [{ clientId }]);
      capturedOptions.current?.onSettled();
    });

    expect(useCheckinStore.getState().isSyncing).toBe(false);
    expect(useCheckinStore.getState().failedClientIds).toEqual([clientId]);
    // Failed items stay queued so a retry can re-send them.
    expect(useCheckinStore.getState().offlineQueue).toHaveLength(1);
  });
});

describe("useCheckin — manual retry (F033)", () => {
  it("retrySync re-flushes failed items that no automatic trigger would retry", () => {
    const clientId = enqueueOne();
    const { result } = renderHook(() => useCheckin());
    expect(mockSyncMutate).toHaveBeenCalledTimes(1);

    act(() => {
      capturedOptions.current?.onError(new Error("HTTP 500"), [{ clientId }]);
      capturedOptions.current?.onSettled();
    });

    // Queue length is unchanged, so the auto-flush effect must NOT re-fire
    // on its own (that would be a tight retry loop against a down server).
    expect(mockSyncMutate).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retrySync();
    });

    expect(mockSyncMutate).toHaveBeenCalledTimes(2);
    expect(mockSyncMutate.mock.calls[1][0]).toHaveLength(1);
  });
});
