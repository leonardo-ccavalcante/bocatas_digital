/**
 * useCheckin.ts — Main hook that bridges the XState machine with tRPC calls.
 *
 * Usage:
 *   const { state, send, isOnline, offlineCount } = useCheckin();
 */
import { useActor } from "@xstate/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { checkinMachine } from "../machine/checkinMachine";
import type { CheckinPrograma, CheckinMetodo } from "../machine/checkinMachine";
import { useCheckinStore } from "../store/useCheckinStore";

export function useCheckin() {
  const [state, send] = useActor(checkinMachine);
  const { offlineQueue, enqueue, dequeue, setIsSyncing, isSyncing } = useCheckinStore();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  const verifyMutation = trpc.checkin.verifyAndInsert.useMutation();
  const anonymousMutation = trpc.checkin.anonymousCheckin.useMutation();
  const syncMutation = trpc.checkin.syncOfflineQueue.useMutation();

  // ── Reactive online/offline listener ───────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ── Trigger API call when entering verifying state ─────────────────────────
  const prevStateRef = useRef<string | null>(null);
  useEffect(() => {
    const currentState = state.value as string;
    if (currentState !== "verifying" || prevStateRef.current === "verifying") {
      prevStateRef.current = currentState;
      return;
    }
    prevStateRef.current = currentState;

    const { locationId, programa, isDemoMode, personId } = state.context;

    // Validate locationId is a valid UUID
    if (!locationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locationId)) {
      send({ type: "ERROR", message: "Selecciona una sede válida antes de hacer check-in." });
      return;
    }

    // Anonymous check-in (no personId)
    if (!personId) {
      if (!isOnline) {
        const clientId = enqueue({
          personId: null,
          locationId,
          programa,
          metodo: "conteo_anonimo",
          isDemoMode,
        });
        send({
          type: "OFFLINE",
          queueItem: {
            clientId,
            personId: null,
            locationId,
            programa,
            metodo: "conteo_anonimo",
            isDemoMode,
            queuedAt: new Date().toISOString(),
          },
        });
        return;
      }

      anonymousMutation.mutate(
        { locationId, programa, isDemoMode },
        {
          onSuccess: () => send({ type: "RESULT", result: { status: "registered", restriccionesAlimentarias: null } }),
          onError: (err) => send({ type: "ERROR", message: err.message }),
        }
      );
      return;
    }

    // Named check-in
    const metodo: CheckinMetodo = state.context.rawQrValue ? "qr_scan" : "manual_busqueda";

    // Validate personId is a valid UUID before proceeding
    if (!personId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(personId)) {
      send({ type: "ERROR", message: "Código QR inválido. Intenta de nuevo o usa búsqueda manual." });
      return;
    }

    if (!isOnline) {
      const clientId = enqueue({ personId, locationId, programa, metodo, isDemoMode });
      send({
        type: "OFFLINE",
        queueItem: {
          clientId,
          personId,
          locationId,
          programa,
          metodo,
          isDemoMode,
          queuedAt: new Date().toISOString(),
        },
      });
      return;
    }

    verifyMutation.mutate(
      { personId, locationId, programa, metodo, isDemoMode },
      {
        onSuccess: (result) => send({ type: "RESULT", result }),
        onError: (err) => {
          if (!isOnline) {
            const clientId = enqueue({ personId, locationId, programa, metodo, isDemoMode });
            send({
              type: "OFFLINE",
              queueItem: {
                clientId,
                personId,
                locationId,
                programa,
                metodo,
                isDemoMode,
                queuedAt: new Date().toISOString(),
              },
            });
          } else {
            send({ type: "ERROR", message: err.message });
          }
        },
      }
    );
  }, [state, isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-flush offline queue when back online ──────────────────────────────
  useEffect(() => {
    if (!isOnline || offlineQueue.length === 0 || isSyncing) return;

    setIsSyncing(true);
    syncMutation.mutate(offlineQueue, {
      onSuccess: (results) => {
        const synced = results
          .filter((r) => r.status === "synced" || r.status === "duplicate")
          .map((r) => r.clientId);
        dequeue(synced);
        setIsSyncing(false);
      },
      onError: () => setIsSyncing(false),
    });
  }, [isOnline, offlineQueue.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    state,
    send,
    isOnline,
    offlineCount: offlineQueue.length,
    isSyncing,
  };
}
