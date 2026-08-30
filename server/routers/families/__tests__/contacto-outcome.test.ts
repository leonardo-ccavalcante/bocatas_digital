// MYTHOS: MYT-129B (gh #129)
//
// Shared "apply a contacto outcome" write, used by BOTH the admin mutation
// (rounds-contacto.ts's setContactoFamilia) and the n8n inbound webhook
// (reparto-contacto-inbound.ts). Before this file existed the two call sites
// hand-rolled the same write independently and already diverged once — the
// renuncia-clears-preferred bug fixed in #125. Pinning the derivation here
// means a future edit to one call site can no longer silently re-diverge from
// the other.
//
// F185 (gh #129): a renuncia stamps attended=false, and ContactoFamiliaDialog
// promises "puede revertirse volviendo a registrar el contacto" — so a
// non-renuncia outcome recorded over a stored 'renuncia' MUST reset the
// attended fields to NULL. getSlotRoster lists pending = attended IS NULL and
// attended_here by attended_slot_id, so without the reset the family is
// listed and counted nowhere on any day.
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
      previousEstado: "confirmada",
    });
    const upd = captured.find((c) => c.table === "delivery_round_assignments");
    expect(upd?.payload.estado_contacto).toBe("renuncia");
    expect(upd?.payload.preferred_slot_ids).toEqual([]);
    expect(upd?.payload.attended).toBe(false);
    expect(upd?.payload.attended_slot_id).toBeNull();
    expect(upd?.payload.attended_by).toBe("user-123");
    expect(upd?.eqCalls).toContainEqual(["id", A]);
  });

  it("a non-renuncia outcome over a non-renuncia estado keeps the given preferred_slot_ids and never touches the attended fields", async () => {
    const db = createAdminClient();
    await applyContactoOutcome(db, {
      assignmentId: A,
      estado: "confirmada",
      preferredSlotIds: ["slot-1"],
      actor: "user-123",
      previousEstado: "pendiente",
    });
    const upd = captured.find((c) => c.table === "delivery_round_assignments");
    expect(upd?.payload.estado_contacto).toBe("confirmada");
    expect(upd?.payload.preferred_slot_ids).toEqual(["slot-1"]);
    expect(upd?.payload).not.toHaveProperty("attended");
    expect(upd?.payload).not.toHaveProperty("attended_slot_id");
  });

  it("re-registering contact over a stored renuncia resets attended/attended_slot_id/attended_at/attended_by to NULL so the family is pending again (F185, gh #129)", async () => {
    const db = createAdminClient();
    await applyContactoOutcome(db, {
      assignmentId: A,
      estado: "confirmada",
      preferredSlotIds: ["slot-1"],
      actor: "user-123",
      previousEstado: "renuncia",
    });
    const upd = captured.find((c) => c.table === "delivery_round_assignments");
    expect(upd?.payload.estado_contacto).toBe("confirmada");
    expect(upd?.payload.preferred_slot_ids).toEqual(["slot-1"]);
    expect(upd?.payload.attended).toBeNull();
    expect(upd?.payload.attended_slot_id).toBeNull();
    expect(upd?.payload.attended_at).toBeNull();
    expect(upd?.payload.attended_by).toBeNull();
  });
});
