/**
 * checkinMachine.ts — XState v5 machine for QR Check-in (Epic B).
 *
 * States (8):
 *   idle         → waiting for QR scan or manual trigger
 *   scanning     → camera active, awaiting QR decode
 *   verifying    → API call in-flight (verifyAndInsert)
 *   registered   → success — person checked in
 *   duplicate    → person already checked in today
 *   not_found    → QR decoded but person not in DB
 *   error        → network / server error
 *   offline      → no network — queued locally
 *
 * Transitions:
 *   idle       → SCAN_START      → scanning
 *   idle       → MANUAL_TRIGGER  → idle (opens manual modal, external)
 *   idle       → ANONYMOUS       → verifying (anonymous check-in)
 *   scanning   → QR_DECODED      → verifying
 *   scanning   → CANCEL          → idle
 *   verifying  → RESULT          → registered | duplicate | not_found
 *   verifying  → ERROR           → error
 *   verifying  → OFFLINE         → offline
 *   registered → RESET           → idle (after auto-reset timeout)
 *   duplicate  → RESET           → idle
 *   not_found  → RESET           → idle
 *   error      → RESET           → idle
 *   offline    → RESET           → idle
 */
import { assign, createMachine } from "xstate";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckinPrograma =
  | "comedor"
  | "familia"
  | "formacion"
  | "atencion_juridica"
  | "voluntariado"
  | "acompanamiento";

export type CheckinMetodo = "qr_scan" | "manual_busqueda" | "conteo_anonimo";

export interface CheckinPerson {
  id: string;
  nombre: string;
  apellidos: string;
  fecha_nacimiento?: string | null;
  foto_perfil_url?: string | null;
  restricciones_alimentarias?: string | null;
}

export interface OfflineQueueItem {
  clientId: string;
  personId: string | null;
  locationId: string;
  programa: CheckinPrograma;
  metodo: CheckinMetodo;
  isDemoMode: boolean;
  queuedAt: string;
}

export interface CheckinContext {
  // Config
  locationId: string | null;
  programa: CheckinPrograma;
  isDemoMode: boolean;

  // Scan state
  rawQrValue: string | null;
  personId: string | null;
  person: CheckinPerson | null;

  // Result
  lastCheckinTime: string | null;
  restriccionesAlimentarias: string | null;

  // Error
  errorMessage: string | null;

  // Offline
  offlineQueue: OfflineQueueItem[];
}

export type CheckinEvent =
  | { type: "SCAN_START" }
  | { type: "CANCEL" }
  | { type: "QR_DECODED"; value: string }
  | { type: "MANUAL_VERIFY"; personId: string; person: CheckinPerson }
  | { type: "ANONYMOUS" }
  | {
      type: "RESULT";
      result:
        | { status: "registered"; restriccionesAlimentarias: string | null }
        | { status: "duplicate"; lastCheckinTime: string }
        | { status: "not_found" };
    }
  | { type: "ERROR"; message: string }
  | { type: "OFFLINE"; queueItem: OfflineQueueItem }
  | { type: "RESET" }
  | { type: "SET_LOCATION"; locationId: string }
  | { type: "SET_PROGRAMA"; programa: CheckinPrograma }
  | { type: "SET_DEMO_MODE"; isDemoMode: boolean }
  | { type: "FLUSH_QUEUE_SUCCESS"; clientIds: string[] };

// ─── Machine ──────────────────────────────────────────────────────────────────

export const checkinMachine = createMachine(
  {
    id: "checkin",
    types: {} as { context: CheckinContext; events: CheckinEvent },
    context: {
      locationId: null,
      programa: "comedor",
      isDemoMode: false,
      rawQrValue: null,
      personId: null,
      person: null,
      lastCheckinTime: null,
      restriccionesAlimentarias: null,
      errorMessage: null,
      offlineQueue: [],
    },
    initial: "idle",
    states: {
      idle: {
        on: {
          SCAN_START: { target: "scanning" },
          MANUAL_VERIFY: {
            target: "verifying",
            actions: assign({
              personId: ({ event }) => event.personId,
              person: ({ event }) => event.person,
              rawQrValue: null,
            }),
          },
          ANONYMOUS: { target: "verifying" },
          SET_LOCATION: {
            actions: assign({ locationId: ({ event }) => event.locationId }),
          },
          SET_PROGRAMA: {
            actions: assign({ programa: ({ event }) => event.programa }),
          },
          SET_DEMO_MODE: {
            actions: assign({ isDemoMode: ({ event }) => event.isDemoMode }),
          },
          FLUSH_QUEUE_SUCCESS: {
            actions: assign({
              offlineQueue: ({ context, event }) =>
                context.offlineQueue.filter(
                  (item) => !event.clientIds.includes(item.clientId)
                ),
            }),
          },
        },
      },

      scanning: {
        on: {
          QR_DECODED: {
            target: "verifying",
            actions: assign({
              rawQrValue: ({ event }) => event.value,
              personId: ({ event }) => {
                // QR format: "bocatas://person/{uuid}" or just the UUID
                const match = event.value.match(
                  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
                );
                return match ? match[1] : null;
              },
              person: null,
            }),
          },
          CANCEL: { target: "idle" },
          SET_LOCATION: {
            actions: assign({ locationId: ({ event }) => event.locationId }),
          },
          SET_PROGRAMA: {
            actions: assign({ programa: ({ event }) => event.programa }),
          },
          SET_DEMO_MODE: {
            actions: assign({ isDemoMode: ({ event }) => event.isDemoMode }),
          },
        },
      },

      verifying: {
        on: {
          RESULT: [
            {
              guard: ({ event }) => event.result.status === "registered",
              target: "registered",
              actions: assign({
                restriccionesAlimentarias: ({ event }) =>
                  event.result.status === "registered"
                    ? event.result.restriccionesAlimentarias
                    : null,
                errorMessage: null,
              }),
            },
            {
              guard: ({ event }) => event.result.status === "duplicate",
              target: "duplicate",
              actions: assign({
                lastCheckinTime: ({ event }) =>
                  event.result.status === "duplicate"
                    ? event.result.lastCheckinTime
                    : null,
                errorMessage: null,
              }),
            },
            {
              guard: ({ event }) => event.result.status === "not_found",
              target: "not_found",
              actions: assign({ errorMessage: null }),
            },
          ],
          ERROR: {
            target: "error",
            actions: assign({ errorMessage: ({ event }) => event.message }),
          },
          OFFLINE: {
            target: "offline",
            actions: assign({
              offlineQueue: ({ context, event }) => [
                ...context.offlineQueue,
                event.queueItem,
              ],
            }),
          },
        },
      },

      registered: {
        on: {
          RESET: { target: "idle", actions: "clearResult" },
        },
        after: {
          AUTO_RESET_DELAY: { target: "idle", actions: "clearResult" },
        },
      },

      duplicate: {
        on: {
          RESET: { target: "idle", actions: "clearResult" },
        },
        after: {
          AUTO_RESET_DELAY: { target: "idle", actions: "clearResult" },
        },
      },

      not_found: {
        on: {
          RESET: { target: "idle", actions: "clearResult" },
        },
        after: {
          AUTO_RESET_DELAY: { target: "idle", actions: "clearResult" },
        },
      },

      error: {
        on: {
          RESET: { target: "idle", actions: "clearResult" },
        },
        after: {
          AUTO_RESET_DELAY: { target: "idle", actions: "clearResult" },
        },
      },

      offline: {
        on: {
          RESET: { target: "idle", actions: "clearResult" },
        },
        after: {
          AUTO_RESET_DELAY: { target: "idle", actions: "clearResult" },
        },
      },
    },
  },
  {
    actions: {
      clearResult: assign({
        rawQrValue: null,
        personId: null,
        person: null,
        lastCheckinTime: null,
        restriccionesAlimentarias: null,
        errorMessage: null,
      }),
    },
    delays: {
      AUTO_RESET_DELAY: 4000, // 4 seconds auto-reset after result
    },
  }
);

export type CheckinState = typeof checkinMachine;
