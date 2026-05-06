/**
 * useCheckinStore.ts — Zustand store for check-in offline queue persistence.
 *
 * The XState machine manages in-memory state.
 * This store persists:
 *   - offline queue to localStorage (survives page reloads)
 *   - locationId and programa (user preferences)
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OfflineQueueItem, CheckinPrograma } from "../machine/checkinMachine";

interface CheckinStoreState {
  offlineQueue: OfflineQueueItem[];
  isSyncing: boolean;
  locationId: string | null;
  programa: CheckinPrograma;

  // Actions
  enqueue: (item: Omit<OfflineQueueItem, "clientId" | "queuedAt">) => string;
  dequeue: (clientIds: string[]) => void;
  setIsSyncing: (syncing: boolean) => void;
  clearQueue: () => void;
  setLocationId: (locationId: string | null) => void;
  setPrograma: (programa: CheckinPrograma) => void;
}

export const useCheckinStore = create<CheckinStoreState>()(
  persist(
    (set) => ({
      offlineQueue: [],
      isSyncing: false,
      locationId: null,
      programa: "comedor",

      enqueue: (item) => {
        const clientId = crypto.randomUUID();
        const queuedAt = new Date().toISOString();
        set((state) => ({
          offlineQueue: [
            ...state.offlineQueue,
            { ...item, clientId, queuedAt },
          ],
        }));
        return clientId;
      },

      dequeue: (clientIds) => {
        set((state) => ({
          offlineQueue: state.offlineQueue.filter(
            (item) => !clientIds.includes(item.clientId)
          ),
        }));
      },

      setIsSyncing: (syncing) => set({ isSyncing: syncing }),

      clearQueue: () => set({ offlineQueue: [] }),

      setLocationId: (locationId) => set({ locationId }),

      setPrograma: (programa) => set({ programa }),
    }),
    {
      name: "bocatas-checkin-store",
      version: 3,
      // XState/immer boundary
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      migrate: (state: any, version: number) => {
        // Clean up invalid locationId from old versions
        if (version < 3 && state.locationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(state.locationId)) {
          state.locationId = null;
        }
        return state;
      },
    }
  )
);
