/**
 * Service worker update handler — wires vite-plugin-pwa "needRefresh"
 * event to a sonner toast that lets the user reload on demand.
 *
 * Called once from main.tsx. Does nothing in dev (PWA disabled in
 * vite.config.ts devOptions).
 */
import { toast } from "sonner";

export async function registerSwUpdateToast(): Promise<void> {
  if (import.meta.env.DEV) return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // virtual:pwa-register is provided by vite-plugin-pwa.
  // The dynamic import isolates the dependency from the dev path.
  const { registerSW } = await import("virtual:pwa-register");

  const updateSW = registerSW({
    onNeedRefresh() {
      toast.message("Nueva versión disponible", {
        description: "Toca para actualizar la aplicación.",
        duration: Infinity,
        action: {
          label: "Actualizar",
          onClick: () => {
            void updateSW(true);
          },
        },
      });
    },
    onRegisteredSW(swUrl, registration) {
      // Polling: re-check for SW updates every 60 minutes (production cadence).
      if (registration) {
        setInterval(() => void registration.update(), 60 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      // Silent: SW failure should never block the app shell.
      // eslint-disable-next-line no-console
      console.warn("[sw] registration failed", error);
    },
  });
}
