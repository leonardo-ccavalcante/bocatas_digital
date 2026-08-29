/**
 * useCheckin.ts — Main hook that bridges the XState machine with tRPC calls.
 *
 * Usage:
 *   const { state, send, isOnline, offlineCount } = useCheckin();
 */
import { useActor } from "@xstate/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { capture } from "@/lib/posthog";
import { checkinMachine } from "../machine/checkinMachine";
import type { CheckinPrograma, CheckinMetodo } from "../machine/checkinMachine";
import { useCheckinStore } from "../store/useCheckinStore";
import { categorizeSyncResults } from "./syncResults";

// ── Error classification (F028) ──────────────────────────────────────────────
// navigator.onLine stays true on weak signal / captive portals, so a request
// that dies in transit reaches onError while `isOnline` is still true. A tRPC
// client error that carries no server-sent `data` never got a server response
// (browser "Failed to fetch", DNS failure, aborted socket) — treat it exactly
// like being offline and queue the check-in instead of losing it.
type CheckinClientError = { message: string; data?: { code?: string } | null };

function isTransportError(err: CheckinClientError): boolean {
  return err.data == null;
}

// Spanish-only UI: never surface raw DB/browser text to the volunteer.
// Non-500 server errors (BAD_REQUEST, NOT_FOUND…) already carry Spanish
// messages written by our routers, so pass those through.
function checkinErrorMessage(err: CheckinClientError): string {
  return err.data?.code === "INTERNAL_SERVER_ERROR"
    ? "No se pudo registrar el check-in. Inténtalo de nuevo."
    : err.message;
}

export function useCheckin() {
  const [state, send] = useActor(checkinMachine);
  const { offlineQueue, failedClientIds, enqueue, dequeue, markFailed, setIsSyncing, isSyncing } =
    useCheckinStore();
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

    // Shared by the navigator-offline paths AND the transport-error fallbacks
    // (F028): enqueue locally and move the machine to the queued-offline state.
    const queueOffline = (queuedPersonId: string | null, metodo: CheckinMetodo) => {
      const clientId = enqueue({ personId: queuedPersonId, locationId, programa, metodo, isDemoMode });
      send({
        type: "OFFLINE",
        queueItem: {
          clientId,
          personId: queuedPersonId,
          locationId,
          programa,
          metodo,
          isDemoMode,
          queuedAt: new Date().toISOString(),
        },
      });
    };

    // Anonymous check-in (no personId)
    if (!personId) {
      if (!isOnline) {
        queueOffline(null, "conteo_anonimo");
        return;
      }

      anonymousMutation.mutate(
        { locationId, programa, isDemoMode },
        {
          onSuccess: () => {
            if (!isDemoMode) capture("checkin_completed", { method: "anonymous" });
            send({ type: "RESULT", result: { status: "registered", restriccionesAlimentarias: null } });
          },
          onError: (err) => {
            if (isTransportError(err)) queueOffline(null, "conteo_anonimo");
            else send({ type: "ERROR", message: checkinErrorMessage(err) });
          },
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
      queueOffline(personId, metodo);
      return;
    }

    // Pass the raw QR string when it came from a QR scan so the server
    // can verify the HMAC signature. Manual-search and demo paths omit
    // qrValue: demo QR payloads are unsigned seed values, and manual
    // search never produces a signed QR string.
    const qrValue =
      !isDemoMode && state.context.rawQrValue
        ? state.context.rawQrValue
        : undefined;
    verifyMutation.mutate(
      { personId, locationId, programa, metodo, isDemoMode, qrValue },
      {
        onSuccess: (result) => {
          if (!isDemoMode) {
            capture("checkin_completed", {
              method: metodo === "qr_scan" ? "qr" : "manual",
            });
          }
          send({ type: "RESULT", result });
        },
        onError: (err) => {
          // "Failed to fetch" while navigator.onLine is still true (weak
          // signal, captive portal, server unreachable) must queue, not
          // lose the check-in (F028).
          if (!isOnline || isTransportError(err)) queueOffline(personId, metodo);
          else send({ type: "ERROR", message: checkinErrorMessage(err) });
        },
      }
    );
  }, [state, isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-flush offline queue when back online ──────────────────────────────
  useEffect(() => {
    if (!isOnline || offlineQueue.length === 0 || isSyncing) return;

    setIsSyncing(true);
    const attemptedIds = offlineQueue.map((item) => item.clientId);
    syncMutation.mutate(offlineQueue, {
      onSuccess: (results) => {
        // POS-03: settled (synced/duplicate) items leave the queue; "error"
        // items are recorded as failed so the volunteer sees them instead of
        // them silently looking like ordinary pending-offline items.
        const { settled, failed } = categorizeSyncResults(results);
        if (settled.length > 0) dequeue(settled);
        if (failed.length > 0) markFailed(failed);
        setIsSyncing(false);
      },
      onError: () => {
        // Whole-batch failure: every attempted item failed this round. Surface
        // them; they remain queued and are retried on the next flush.
        markFailed(attemptedIds);
        setIsSyncing(false);
      },
    });
  }, [isOnline, offlineQueue.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    state,
    send,
    isOnline,
    offlineCount: offlineQueue.length,
    failedCount: failedClientIds.length,
    isSyncing,
  };
}
