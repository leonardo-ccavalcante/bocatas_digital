/**
 * useCheckin.transportError.test.tsx — F028 regression lock-in.
 *
 * navigator.onLine stays true on weak/captive networks, so a request that
 * dies in transit ("Failed to fetch") reaches onError while isOnline is
 * still true. The hook must queue the check-in offline instead of losing
 * it, and a genuine server 500 must surface generic Spanish text, never
 * raw DB/browser text (Spanish-only UI rule).
 *
 * tRPC is mocked at @/lib/trpc via the vi.hoisted pattern (mirrors
 * ManualSearchModal.a11y.test.tsx); the XState machine and zustand store
 * are real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

const { mockVerifyMutate, mockAnonMutate, mockSyncMutate } = vi.hoisted(() => ({
  mockVerifyMutate: vi.fn(),
  mockAnonMutate: vi.fn(),
  mockSyncMutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    checkin: {
      verifyAndInsert: { useMutation: () => ({ mutate: mockVerifyMutate }) },
      anonymousCheckin: { useMutation: () => ({ mutate: mockAnonMutate }) },
      syncOfflineQueue: { useMutation: () => ({ mutate: mockSyncMutate }) },
    },
  },
}));

vi.mock("@/lib/posthog", () => ({ capture: vi.fn() }));

import { useCheckin } from "../useCheckin";
import { useCheckinStore } from "../../store/useCheckinStore";
import type { CheckinPerson } from "../../machine/checkinMachine";

const LOCATION = "aaaaaaaa-1111-2222-3333-444444444444";
const PERSON_ID = "11111111-aaaa-bbbb-cccc-dddddddddddd";
const PERSON: CheckinPerson = {
  id: PERSON_ID,
  nombre: "David",
  apellidos: "Martín",
  fecha_nacimiento: null,
  foto_perfil_url: null,
  restricciones_alimentarias: null,
};

type MutationErrorOpts = {
  onError: (err: { message: string; data?: { code?: string } | null }) => void;
};

/** Drives the machine to `verifying` for a manual-search check-in and
 *  returns the options object passed to verifyAndInsert.mutate. */
function startNamedCheckin(result: { current: ReturnType<typeof useCheckin> }) {
  act(() => {
    result.current.send({ type: "SET_LOCATION", locationId: LOCATION });
  });
  act(() => {
    result.current.send({ type: "MANUAL_VERIFY", personId: PERSON_ID, person: PERSON });
  });
  expect(mockVerifyMutate).toHaveBeenCalledTimes(1);
  return mockVerifyMutate.mock.calls[0][1] as MutationErrorOpts;
}

beforeEach(() => {
  vi.clearAllMocks();
  useCheckinStore.getState().clearQueue();
  useCheckinStore.getState().setIsSyncing(false);
});

afterEach(() => {
  cleanup();
});

describe("useCheckin — transport errors while navigator.onLine is true (F028)", () => {
  it("queues the check-in offline when the request dies in transit", () => {
    const { result } = renderHook(() => useCheckin());
    expect(result.current.isOnline).toBe(true); // jsdom default

    const opts = startNamedCheckin(result);

    // Browser fetch failure: TRPCClientError with NO server-sent data.
    act(() => {
      opts.onError({ message: "Failed to fetch", data: null });
    });

    expect(result.current.state.value).toBe("offline");
    const queue = useCheckinStore.getState().offlineQueue;
    expect(queue).toHaveLength(1);
    expect(queue[0].personId).toBe(PERSON_ID);
    expect(queue[0].metodo).toBe("manual_busqueda");
  });

  it("shows generic Spanish text for a server 500 instead of raw DB text", () => {
    const { result } = renderHook(() => useCheckin());
    const opts = startNamedCheckin(result);

    act(() => {
      opts.onError({
        message:
          'Error al registrar asistencia: duplicate key value violates unique constraint "attendances_pkey"',
        data: { code: "INTERNAL_SERVER_ERROR" },
      });
    });

    expect(result.current.state.value).toBe("error");
    expect(result.current.state.context.errorMessage).toBe(
      "No se pudo registrar el check-in. Inténtalo de nuevo."
    );
    // A real server response is NOT an offline situation: nothing queued.
    expect(useCheckinStore.getState().offlineQueue).toHaveLength(0);
  });
});
