import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Location {
  id: string;
  nombre: string;
  tipo: string;
}

export interface PendingCheckin {
  id: string;
  personId: string | null;
  locationId: string;
  programa: string;
  timestamp: number;
  synced: boolean;
}

interface AppState {
  // Sede seleccionada — persiste entre sesiones
  selectedLocation: Location | null;
  setSelectedLocation: (location: Location | null) => void;

  // Cola offline de check-ins pendientes de sincronizar
  pendingQueue: PendingCheckin[];
  addPendingCheckin: (checkin: Omit<PendingCheckin, "id" | "synced">) => void;
  markSynced: (id: string) => void;
  clearSynced: () => void;

  // Sidebar collapsed state
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedLocation: null,
      setSelectedLocation: (location) => set({ selectedLocation: location }),

      pendingQueue: [],
      addPendingCheckin: (checkin) =>
        set((state) => ({
          pendingQueue: [
            ...state.pendingQueue,
            { ...checkin, id: crypto.randomUUID(), synced: false },
          ],
        })),
      markSynced: (id) =>
        set((state) => ({
          pendingQueue: state.pendingQueue.map((c) =>
            c.id === id ? { ...c, synced: true } : c
          ),
        })),
      clearSynced: () =>
        set((state) => ({
          pendingQueue: state.pendingQueue.filter((c) => !c.synced),
        })),

      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: "bocatas-app-store",
      partialize: (state) => ({
        selectedLocation: state.selectedLocation,
        pendingQueue: state.pendingQueue,
      }),
    }
  )
);
