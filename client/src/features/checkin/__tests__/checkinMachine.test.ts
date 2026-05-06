/**
 * checkinMachine.test.ts — Unit tests for the XState v5 machine that drives
 * the QR check-in flow (Epic B).
 *
 * Coverage:
 *   - idle → scanning → registered (happy path)
 *   - idle → scanning → already (same-day same-service-point => "duplicate")
 *   - idle → scanning → not_found → manual search reset
 *   - scanning → networkError (verifying → error) and offline queueing
 */
import { describe, it, expect } from "vitest";
import { createActor } from "xstate";
import {
  checkinMachine,
  type CheckinPerson,
  type OfflineQueueItem,
} from "../machine/checkinMachine";

const VALID_UUID = "11111111-2222-3333-4444-555555555555";
const QR_VALUE = `bocatas://person/${VALID_UUID}`;
const LOCATION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const PERSON: CheckinPerson = {
  id: VALID_UUID,
  nombre: "Ana",
  apellidos: "García",
  fecha_nacimiento: null,
  foto_perfil_url: null,
  restricciones_alimentarias: null,
};

describe("checkinMachine — idle → scanning → registered", () => {
  it("transitions through scanning then verifying then registered on success", () => {
    const actor = createActor(checkinMachine).start();
    expect(actor.getSnapshot().value).toBe("idle");

    actor.send({ type: "SET_LOCATION", locationId: LOCATION_ID });
    actor.send({ type: "SCAN_START" });
    expect(actor.getSnapshot().value).toBe("scanning");

    actor.send({ type: "QR_DECODED", value: QR_VALUE });
    expect(actor.getSnapshot().value).toBe("verifying");
    expect(actor.getSnapshot().context.personId).toBe(VALID_UUID);
    expect(actor.getSnapshot().context.rawQrValue).toBe(QR_VALUE);

    actor.send({
      type: "RESULT",
      result: { status: "registered", restriccionesAlimentarias: "Vegano" },
    });
    expect(actor.getSnapshot().value).toBe("registered");
    expect(actor.getSnapshot().context.restriccionesAlimentarias).toBe("Vegano");

    actor.stop();
  });
});

describe("checkinMachine — idle → scanning → already (duplicate)", () => {
  it("routes to duplicate when result.status is duplicate (same-day same-service-point)", () => {
    const actor = createActor(checkinMachine).start();

    actor.send({ type: "SET_LOCATION", locationId: LOCATION_ID });
    actor.send({ type: "SCAN_START" });
    actor.send({ type: "QR_DECODED", value: QR_VALUE });
    actor.send({
      type: "RESULT",
      result: { status: "duplicate", lastCheckinTime: "12:34" },
    });

    expect(actor.getSnapshot().value).toBe("duplicate");
    expect(actor.getSnapshot().context.lastCheckinTime).toBe("12:34");

    actor.stop();
  });
});

describe("checkinMachine — idle → scanning → not_found → manualSearch", () => {
  it("routes to not_found and then back to idle (manual search entrypoint)", () => {
    const actor = createActor(checkinMachine).start();

    actor.send({ type: "SCAN_START" });
    actor.send({ type: "QR_DECODED", value: QR_VALUE });
    actor.send({ type: "RESULT", result: { status: "not_found" } });

    expect(actor.getSnapshot().value).toBe("not_found");

    // Manual search resumes from idle once the volunteer dismisses the result.
    actor.send({ type: "RESET" });
    expect(actor.getSnapshot().value).toBe("idle");

    // Manual verify path (search-by-name fallback) feeds back into verifying.
    actor.send({ type: "MANUAL_VERIFY", personId: VALID_UUID, person: PERSON });
    expect(actor.getSnapshot().value).toBe("verifying");
    expect(actor.getSnapshot().context.personId).toBe(VALID_UUID);
    expect(actor.getSnapshot().context.person).toEqual(PERSON);

    actor.stop();
  });
});

describe("checkinMachine — scanning → networkError → offlineQueued", () => {
  it("routes to error when ERROR is emitted and stores the message", () => {
    const actor = createActor(checkinMachine).start();

    actor.send({ type: "SCAN_START" });
    actor.send({ type: "QR_DECODED", value: QR_VALUE });
    actor.send({ type: "ERROR", message: "Network unavailable" });

    expect(actor.getSnapshot().value).toBe("error");
    expect(actor.getSnapshot().context.errorMessage).toBe("Network unavailable");

    actor.stop();
  });

  it("transitions verifying → offline and appends to the offlineQueue", () => {
    const actor = createActor(checkinMachine).start();

    actor.send({ type: "SET_LOCATION", locationId: LOCATION_ID });
    actor.send({ type: "SCAN_START" });
    actor.send({ type: "QR_DECODED", value: QR_VALUE });

    const queueItem: OfflineQueueItem = {
      clientId: "ffffffff-eeee-dddd-cccc-bbbbbbbbbbbb",
      personId: VALID_UUID,
      locationId: LOCATION_ID,
      programa: "comedor",
      metodo: "qr_scan",
      isDemoMode: false,
      queuedAt: "2026-05-06T10:00:00.000Z",
    };

    actor.send({ type: "OFFLINE", queueItem });

    const snapshot = actor.getSnapshot();
    expect(snapshot.value).toBe("offline");
    expect(snapshot.context.offlineQueue).toHaveLength(1);
    expect(snapshot.context.offlineQueue[0]).toEqual(queueItem);

    actor.stop();
  });
});
