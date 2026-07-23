import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import type { User } from "../../../../drizzle/schema";

const tableResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
const captured: Array<{ table: string; op: string; payload: Record<string, unknown> }> = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const rpcErrors: Record<string, { message: string }> = {};

function makeBuilder(table: string) {
  let write: Record<string, unknown> | null = null;
  const result = () =>
    write ? { data: { id: `${table}-id`, ...write }, error: null } : (tableResults[table] ?? { data: [], error: null });
  const b: Record<string, unknown> = {
    select: () => b,
    update: (p: Record<string, unknown>) => { write = p; captured.push({ table, op: "update", payload: p }); return b; },
    eq: () => b, single: async () => result(), maybeSingle: async () => result(),
    then: (r: (v: unknown) => unknown) => r(result()),
  };
  return b;
}

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (t: string) => makeBuilder(t),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (rpcErrors[name]) return { data: null, error: rpcErrors[name] };
      return { data: null, error: null };
    },
  }),
}));
vi.mock("../reparto-notify", () => ({ notifyRepartoChange: vi.fn() }));

const { roundsContactoRouter } = await import("../rounds-contacto");

function buildUser(role: User["role"], id = 1): User {
  return { id, openId: `m${id}`, name: "T", email: "t@e.com", loginMethod: "manus", role,
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as User;
}
function ctx(u: User | null): TrpcContext {
  return { req: {} as never, res: {} as never, user: u,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never, correlationId: "t" };
}
const A = "11111111-1111-4111-8111-111111111111";
const R = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  for (const k of Object.keys(tableResults)) delete tableResults[k];
  for (const k of Object.keys(rpcErrors)) delete rpcErrors[k];
  captured.length = 0; rpcCalls.length = 0; vi.clearAllMocks();
});

describe("rounds-contacto — rescheduleAssignment (pending-only)", () => {
  it("maps the RPC's asignacion_finalizada raise to CONFLICT", async () => {
    tableResults["delivery_round_assignments"] = { data: { id: A, family_id: "famA", round_id: R, assigned_day: "2026-06-01", turno: "manana" }, error: null };
    rpcErrors["move_assignment_to_open_slot"] = { message: "asignacion_finalizada" };
    const caller = roundsContactoRouter.createCaller(ctx(buildUser("admin")));
    await expect(caller.rescheduleAssignment({ assignment_id: A, new_day: "2026-06-02", new_turno: "tarde" }))
      .rejects.toThrow(/resuelta|CONFLICT/i);
  });

  it("delegates the move to the atomic RPC with the new day + turno", async () => {
    tableResults["delivery_round_assignments"] = { data: { id: A, family_id: "famA", round_id: R, assigned_day: "2026-06-01", turno: "manana" }, error: null };
    const caller = roundsContactoRouter.createCaller(ctx(buildUser("admin")));
    const res = await caller.rescheduleAssignment({ assignment_id: A, new_day: "2026-06-02", new_turno: "tarde" });
    const call = rpcCalls.find((c) => c.name === "move_assignment_to_open_slot");
    expect(call?.args.p_new_day).toBe("2026-06-02");
    expect(res.turno).toBe("tarde");
  });

  it("rejects voluntario", async () => {
    const caller = roundsContactoRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(caller.rescheduleAssignment({ assignment_id: A, new_day: "2026-06-02", new_turno: "tarde" }))
      .rejects.toThrow(/FORBIDDEN|admin|permission|10002/i);
  });
});

describe("rounds-contacto — setContactoFamilia", () => {
  const s1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const s2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("stores up to 2 preferred slot ids + estado_contacto (slots validated ∈ round)", async () => {
    tableResults["delivery_round_assignments"] = { data: { round_id: R }, error: null };
    tableResults["delivery_round_slots"] = { data: [{ id: s1 }, { id: s2 }], error: null };
    const caller = roundsContactoRouter.createCaller(ctx(buildUser("admin")));
    await caller.setContactoFamilia({ assignment_id: A, estado_contacto: "confirmada", preferred_slot_ids: [s1, s2] });
    const upd = captured.find((c) => c.op === "update");
    expect(upd?.payload.preferred_slot_ids).toEqual([s1, s2]);
    expect(upd?.payload.estado_contacto).toBe("confirmada");
  });

  it("rejects a preferred slot that does not belong to the round", async () => {
    tableResults["delivery_round_assignments"] = { data: { round_id: R }, error: null };
    tableResults["delivery_round_slots"] = { data: [{ id: s1 }], error: null }; // s2 not in round
    const caller = roundsContactoRouter.createCaller(ctx(buildUser("admin")));
    await expect(caller.setContactoFamilia({ assignment_id: A, estado_contacto: "confirmada", preferred_slot_ids: [s1, s2] }))
      .rejects.toThrow(/no pertenece|BAD_REQUEST/i);
  });

  it("a renuncia marks the family ausente (attended=false, no slot)", async () => {
    tableResults["delivery_round_assignments"] = { data: { round_id: R }, error: null };
    const caller = roundsContactoRouter.createCaller(ctx(buildUser("admin")));
    await caller.setContactoFamilia({ assignment_id: A, estado_contacto: "renuncia" });
    const upd = captured.find((c) => c.op === "update");
    expect(upd?.payload.attended).toBe(false);
    expect(upd?.payload.attended_slot_id).toBeNull();
    expect(upd?.payload.preferred_slot_ids).toEqual([]); // renuncia clears preferred
  });

  it("rejects a renuncia carrying preferred days (Zod)", async () => {
    const caller = roundsContactoRouter.createCaller(ctx(buildUser("admin")));
    await expect(caller.setContactoFamilia({
      assignment_id: A, estado_contacto: "renuncia", renuncia: true,
      preferred_slot_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    })).rejects.toThrow(/renuncia|BAD_REQUEST/i);
  });
});
