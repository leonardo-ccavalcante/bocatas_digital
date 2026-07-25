// MYTHOS: MYT-129B
//
// gh #129: setContactoFamilia (rounds-contacto.ts) and the n8n inbound handler
// (reparto-contacto-inbound.ts) hand-roll the SAME "apply a contacto outcome"
// write (estado_contacto + preferred_slot_ids, with a renuncia clearing
// preferred and stamping ausente) in two places. They already diverged once —
// the renuncia-clears-preferred bug fixed in #125 — because there was no
// single source of truth for this logic.
//
// This test does NOT re-test either router (those are covered by
// rounds-contacto.test.ts and reparto-contacto-inbound.test.ts, which must stay
// green and unmodified). It pins the CONTRACT of the shared helper the fix_hint
// asks for: applyContactoOutcome(db, {assignmentId, estado, preferredSlotIds,
// actor}), living at server/routers/families/contacto-outcome.ts, so a future
// edit to one call site can no longer silently re-diverge from the other.
//
// RED (documented defect): the shared helper does not exist yet — the
// duplication is still live in both files. This test fails at import time
// until server/routers/families/contacto-outcome.ts exports it.
import { describe, it, expect, beforeEach, vi } from "vitest";

const captured: Array<{ table: string; payload: Record<string, unknown>; eqCalls: Array<[string, unknown]> }> = [];

function makeBuilder(table: string) {
  const eqCalls: Array<[string, unknown]> = [];
  const b: Record<string, unknown> = {
    update: (p: Record<string, unknown>) => {
      captured.push({ table, payload: p, eqCalls });
      return b;
    },
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return b;
    },
    then: (r: (v: unknown) => unknown) => r({ data: null, error: null }),
  };
  return b;
}

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }),
}));

const { applyContactoOutcome } = await import("../contacto-outcome");
const { createAdminClient } = await import("../../../../client/src/lib/supabase/server");

const A = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  captured.length = 0;
});

describe("applyContactoOutcome shared helper — MYT-129B (gh #129)", () => {
  it("a renuncia clears preferred_slot_ids and stamps ausente, even if the caller still passes stale preferred ids (the #125 bug, pinned once at the shared source)", async () => {
    const db = createAdminClient();
    await applyContactoOutcome(db, {
      assignmentId: A,
      estado: "renuncia",
      preferredSlotIds: ["slot-1", "slot-2"],
      actor: "user-123",
    });
    const upd = captured.find((c) => c.table === "delivery_round_assignments");
    expect(upd?.payload.estado_contacto).toBe("renuncia");
    expect(upd?.payload.preferred_slot_ids).toEqual([]);
    expect(upd?.payload.attended).toBe(false);
    expect(upd?.payload.attended_slot_id).toBeNull();
    expect(upd?.payload.attended_by).toBe("user-123");
    expect(upd?.eqCalls).toContainEqual(["id", A]);
  });

  it("a non-renuncia outcome keeps the given preferred_slot_ids and never touches the attended fields", async () => {
    const db = createAdminClient();
    await applyContactoOutcome(db, {
      assignmentId: A,
      estado: "confirmada",
      preferredSlotIds: ["slot-1"],
      actor: "user-123",
    });
    const upd = captured.find((c) => c.table === "delivery_round_assignments");
    expect(upd?.payload.estado_contacto).toBe("confirmada");
    expect(upd?.payload.preferred_slot_ids).toEqual(["slot-1"]);
    expect(upd?.payload).not.toHaveProperty("attended");
    expect(upd?.payload).not.toHaveProperty("attended_slot_id");
  });
});
