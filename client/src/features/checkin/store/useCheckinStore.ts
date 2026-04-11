/**
 * useCheckinStore.ts — Zustand store for check-in offline queue persistence.
 *
 * The XState machine manages in-memory state.
 * This store persists the offline queue to localStorage so it survives page reloads.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OfflineQueueItem } from "../machine/checkinMachine";

interface CheckinStoreState {
  offlineQueue: OfflineQueueItem[];
  isSyncing: boolean;

  // Actions
  enqueue: (item: Omit<OfflineQueueItem, "clientId" | "queuedAt">) => string;
  dequeue: (clientIds: string[]) => void;
  setIsSyncing: (syncing: boolean) => void;
  clearQueue: () => void;
}

export const useCheckinStore = create<CheckinStoreState>()(
  persist(
    (set) => ({
      offlineQueue: [],
      isSyncing: false,

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
    }),
    {
      name: "bocatas-checkin-offline-queue",
      version: 1,
    }
  )
);
