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
  // clientIds whose LAST sync attempt failed (server returned status:"error"
  // or the whole batch errored). They stay in offlineQueue so a later flush can
  // retry them, but are tracked here so the UI can surface them instead of
  // counting them as ordinary pending-offline items (POS-03).
  failedClientIds: string[];
  isSyncing: boolean;
  locationId: string | null;
  programa: CheckinPrograma;

  // Actions
  enqueue: (item: Omit<OfflineQueueItem, "clientId" | "queuedAt">) => string;
  dequeue: (clientIds: string[]) => void;
  markFailed: (clientIds: string[]) => void;
  clearFailed: (clientIds: string[]) => void;
  setIsSyncing: (syncing: boolean) => void;
  clearQueue: () => void;
  setLocationId: (locationId: string | null) => void;
  setPrograma: (programa: CheckinPrograma) => void;
}

export const useCheckinStore = create<CheckinStoreState>()(
  persist(
    (set) => ({
      offlineQueue: [],
      failedClientIds: [],
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
        // A synced item is no longer queued OR failed.
        set((state) => ({
          offlineQueue: state.offlineQueue.filter(
            (item) => !clientIds.includes(item.clientId)
          ),
          failedClientIds: state.failedClientIds.filter(
            (id) => !clientIds.includes(id)
          ),
        }));
      },

      markFailed: (clientIds) => {
        set((state) => ({
          failedClientIds: Array.from(
            new Set([...state.failedClientIds, ...clientIds])
          ),
        }));
      },

      clearFailed: (clientIds) => {
        set((state) => ({
          failedClientIds: state.failedClientIds.filter(
            (id) => !clientIds.includes(id)
          ),
        }));
      },

      setIsSyncing: (syncing) => set({ isSyncing: syncing }),

      clearQueue: () => set({ offlineQueue: [], failedClientIds: [] }),

      setLocationId: (locationId) => set({ locationId }),

      setPrograma: (programa) => set({ programa }),
    }),
    {
      name: "bocatas-checkin-store",
      version: 4,
      // XState/immer boundary
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      migrate: (state: any, version: number) => {
        // Clean up invalid locationId from old versions
        if (version < 3 && state.locationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(state.locationId)) {
          state.locationId = null;
        }
        // v4 (POS-03): failed-sync tracking added; older state has no such field.
        if (version < 4 && !Array.isArray(state.failedClientIds)) {
          state.failedClientIds = [];
        }
        return state;
      },
    }
  )
);
