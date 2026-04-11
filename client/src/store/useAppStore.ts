import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Location {
  id: string;
  nombre: string;
  tipo: string;
}

interface AppState {
  // Sede seleccionada — persiste entre sesiones
  selectedLocation: Location | null;
  setSelectedLocation: (location: Location | null) => void;

  // Sidebar collapsed state
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedLocation: null,
      setSelectedLocation: (location) => set({ selectedLocation: location }),

      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: "bocatas-app-store",
      partialize: (state) => ({
        selectedLocation: state.selectedLocation,
      }),
    }
  )
);
