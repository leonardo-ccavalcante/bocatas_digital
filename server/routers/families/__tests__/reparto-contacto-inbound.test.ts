import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";

const tableResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
const captured: Array<{ table: string; payload: Record<string, unknown> }> = [];

function makeBuilder(table: string) {
  let payload: Record<string, unknown> | null = null;
  const read = () => tableResults[table] ?? { data: null, error: null };
  const b: Record<string, unknown> = {
    select: () => b, eq: () => b, order: () => b,
    update: (p: Record<string, unknown>) => { payload = p; captured.push({ table, payload: p }); return b; },
    maybeSingle: async () => read(),
    then: (r: (v: unknown) => unknown) => r(payload ? { data: null, error: null } : read()),
  };
  return b;
}

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }),
}));

const { handleRepartoContactoInbound } = await import("../reparto-contacto-inbound");

function makeRes() {
  const state = { statusCode: 0, body: null as unknown };
  const res = {
    status(c: number) { state.statusCode = c; return res; },
    json(o: unknown) { state.body = o; return res; },
    _state: state,
  };
  return res as unknown as Response & { _state: typeof state };
}
function req(body: unknown): Request {
  return { body, get: () => undefined } as unknown as Request;
}

const ROUND = "0be9a17e-0000-4000-8000-000000000010";
const S1 = "0be9a17e-0000-4000-8000-000000000021";

beforeEach(() => {
  for (const k of Object.keys(tableResults)) delete tableResults[k];
  captured.length = 0;
});

describe("reparto-contacto-inbound handler (auth handled upstream by middleware)", () => {
  it("rejects an invalid body with 400 and NEVER echoes the body (PII wall)", async () => {
    const res = makeRes();
    // familia_numero + round_id present in body would be PII-adjacent; a bad body
    // (missing round_id) must not be reflected back.
    await handleRepartoContactoInbound(req({ familia_numero: 9001, telefono: "600123456" }), res);
    expect(res._state.statusCode).toBe(400);
    expect(JSON.stringify(res._state.body)).not.toContain("600123456");
    expect(JSON.stringify(res._state.body)).not.toContain("9001");
  });

  it("happy path: resolves familia_numero + first-slot-per-date, defaults estado 'confirmada'", async () => {
    tableResults["families"] = { data: { id: "famX" }, error: null };
    tableResults["delivery_round_assignments"] = { data: { id: "asgX", reschedule_log: [] }, error: null };
    tableResults["delivery_round_slots"] = { data: [{ id: S1, slot_date: "2026-08-10" }], error: null };
    const res = makeRes();
    await handleRepartoContactoInbound(
      req({ round_id: ROUND, familia_numero: 9001, preferred_dates: ["2026-08-10"] }), res);
    expect(res._state.statusCode).toBe(200);
    const upd = captured.find((c) => c.table === "delivery_round_assignments");
    expect(upd?.payload.preferred_slot_ids).toEqual([S1]);
    expect(upd?.payload.estado_contacto).toBe("confirmada");
  });

  it("renuncia CLEARS preferred_slot_ids and marks the family absent", async () => {
    tableResults["families"] = { data: { id: "famX" }, error: null };
    tableResults["delivery_round_assignments"] = { data: { id: "asgX", reschedule_log: [] }, error: null };
    const res = makeRes();
    await handleRepartoContactoInbound(
      req({ round_id: ROUND, family_id: "0be9a17e-0000-4000-8000-0000000000aa", estado_contacto: "renuncia" }), res);
    expect(res._state.statusCode).toBe(200);
    const upd = captured.find((c) => c.table === "delivery_round_assignments");
    expect(upd?.payload.preferred_slot_ids).toEqual([]); // not left stale
    expect(upd?.payload.attended).toBe(false);
    expect(upd?.payload.attended_slot_id).toBeNull();
  });

  it("404 when the family cannot be resolved", async () => {
    tableResults["families"] = { data: null, error: null };
    const res = makeRes();
    await handleRepartoContactoInbound(req({ round_id: ROUND, familia_numero: 99999 }), res);
    expect(res._state.statusCode).toBe(404);
  });
});
