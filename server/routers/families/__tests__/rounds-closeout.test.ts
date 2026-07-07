import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import type { User } from "../../../../drizzle/schema";

const tableResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
const captured: Array<{ table: string; op: string; payload: Record<string, unknown> }> = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const rpcErrors: Record<string, { message: string }> = {};

function makeBuilder(table: string) {
  let write: Record<string, unknown> | null = null;
  let inIds: string[] | null = null;
  // .single()/.maybeSingle() expect one object; an awaited (then) query expects
  // an array — for a write scoped by .in(ids) we echo those ids back as rows so
  // a bulk update's .select() returns the matched count.
  const singleResult = () =>
    write ? { data: { id: `${table}-id`, ...write }, error: null } : (tableResults[table] ?? { data: [], error: null });
  const listResult = () =>
    write && inIds ? { data: inIds.map((id) => ({ id })), error: null } : singleResult();
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (p: Record<string, unknown>) => { write = p; captured.push({ table, op: "insert", payload: p }); return b; },
    update: (p: Record<string, unknown>) => { write = p; captured.push({ table, op: "update", payload: p }); return b; },
    delete: () => b, eq: () => b,
    in: (_col: string, ids: string[]) => { inIds = Array.isArray(ids) ? ids : null; return b; },
    is: () => b, not: () => b, order: () => b, limit: () => b, or: () => b, lte: () => b,
    single: async () => singleResult(),
    maybeSingle: async () => singleResult(),
    then: (resolve: (v: unknown) => unknown) => resolve(listResult()),
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

const { roundsCloseoutRouter } = await import("../rounds-closeout");

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
const P = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  for (const k of Object.keys(tableResults)) delete tableResults[k];
  for (const k of Object.keys(rpcErrors)) delete rpcErrors[k];
  captured.length = 0; rpcCalls.length = 0; vi.clearAllMocks();
});

describe("rounds-closeout — markAttendance", () => {
  it("appends one entry to undo_log capturing the previous value", async () => {
    tableResults["delivery_round_assignments"] = { data: { id: A, round_id: R, attended: null, undo_log: [] }, error: null };
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario", 9)));
    await caller.markAttendance({ assignment_id: A, attended: true });
    const upd = captured.find((c) => c.op === "update");
    const log = upd?.payload.undo_log as Array<{ prev: unknown; by: string }>;
    expect(log).toHaveLength(1);
    expect(log[0].prev).toBeNull();
    expect(log[0].by).toBe("9");
    expect(upd?.payload.attended).toBe(true);
  });
});

describe("rounds-closeout — undoAttendance", () => {
  it("restores the previous value from the undo_log", async () => {
    tableResults["delivery_round_assignments"] = {
      data: { id: A, round_id: R, attended: true, undo_log: [{ prev: null, at: "x", by: "9" }] }, error: null };
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario")));
    await caller.undoAttendance({ assignment_id: A });
    const upd = captured.find((c) => c.op === "update");
    expect(upd?.payload.attended).toBeNull();
  });

  it("throws BAD_REQUEST when there is nothing to undo", async () => {
    tableResults["delivery_round_assignments"] = { data: { id: A, round_id: R, attended: null, undo_log: [] }, error: null };
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(caller.undoAttendance({ assignment_id: A })).rejects.toThrow(/deshacer|BAD_REQUEST/i);
  });
});

describe("rounds-closeout — resolveAssignment", () => {
  it("returns not_in_program when the person belongs to no family", async () => {
    tableResults["familia_miembros"] = { data: null, error: null };
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario")));
    const r = await caller.resolveAssignment({ round_id: R, person_id: P, current_day: "2026-06-01", current_turno: "manana" });
    expect(r.status).toBe("not_in_program");
  });
});

describe("rounds-closeout — bulkMarkAttendance", () => {
  it("marks a batch of assignments attended in one update with the actor stamped", async () => {
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario", 5)));
    const res = await caller.bulkMarkAttendance({
      round_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      assignment_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      attended: true,
    });
    const upd = captured.find((c) => c.op === "update");
    expect(upd?.payload.attended).toBe(true);
    expect(upd?.payload.attended_by).toBe("5");
    expect(res.count).toBe(2); // count reflects rows matched within the round scope
  });

  it("rejects an empty batch", async () => {
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(caller.bulkMarkAttendance({ round_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", assignment_ids: [], attended: true }))
      .rejects.toThrow(/vac|empty|BAD_REQUEST/i);
  });
});

describe("rounds-closeout — getAssignmentsForDay PII gate", () => {
  it("never returns DNI or phone on the voluntario-facing roster", async () => {
    tableResults["delivery_round_assignments"] = {
      data: [{ id: A, family_id: "famA", assigned_day: "2026-06-01", day_slot: 1, expediente: "7", total_miembros: 5, attended: null, estado_contacto: "pendiente" }],
      error: null };
    tableResults["familia_miembros"] = { data: [{ familia_id: "famA", relacion: "parent", created_at: "2026-01-01", person_id: "pp" }], error: null };
    tableResults["persons"] = { data: [{ id: "pp", nombre: "Maria", apellidos: "García", numero_documento: "X123", telefono: "600" }], error: null };

    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario")));
    const rows = await caller.getAssignmentsForDay({ round_id: R, assigned_day: "2026-06-01", turno: "manana" });
    expect(rows[0].nombre_titular).toBe("Maria García");
    const keys = Object.keys(rows[0]);
    expect(keys).not.toContain("dni");
    expect(keys).not.toContain("numero_documento");
    expect(keys).not.toContain("telefono");
  });
});

describe("rounds-closeout — rescheduleAssignment guards the target slot", () => {
  it("rejects re-assigning into a CLOSED turno (RPC raises turno_destino_cerrado)", async () => {
    tableResults["delivery_round_assignments"] = { data: { id: A, family_id: "famA", round_id: R, assigned_day: "2026-06-01", turno: "manana" }, error: null };
    rpcErrors["move_assignment_to_open_slot"] = { message: "turno_destino_cerrado" };
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("admin")));
    await expect(
      caller.rescheduleAssignment({ assignment_id: A, new_day: "2026-06-02", new_turno: "tarde" }),
    ).rejects.toThrow(/cerrado|CONFLICT/i);
  });

  it("delegates the move to the atomic RPC with the new day+turno and resets attendance", async () => {
    tableResults["delivery_round_assignments"] = { data: { id: A, family_id: "famA", round_id: R, assigned_day: "2026-06-01", turno: "manana" }, error: null };
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("admin")));
    const res = await caller.rescheduleAssignment({ assignment_id: A, new_day: "2026-06-02", new_turno: "tarde" });
    const call = rpcCalls.find((c) => c.name === "move_assignment_to_open_slot");
    expect(call).toBeDefined();
    expect(call?.args.p_assignment_id).toBe(A);
    expect(call?.args.p_new_day).toBe("2026-06-02");
    expect(call?.args.p_new_turno).toBe("tarde");
    expect(res.assigned_day).toBe("2026-06-02");
    expect(res.turno).toBe("tarde");
    expect(res.estado_contacto).toBe("reprogramada");
  });
});

describe("rounds-closeout — reassignPending carries no-shows to OPEN slots after from_slot", () => {
  it("moves a pending family from a closed slot to a later open slot (true ordinals, no closed-slot reuse)", async () => {
    tableResults["delivery_rounds"] = { data: { estado: "activa" }, error: null };
    tableResults["delivery_round_slots"] = { data: [
      { slot_date: "2026-06-01", turno: "manana", cap: null, estado: "cerrado" },
      { slot_date: "2026-06-02", turno: "manana", cap: null, estado: "abierto" },
    ], error: null };
    tableResults["delivery_round_assignments"] = { data: [
      { id: A, family_id: "famA", expediente: "7", total_miembros: 3, assigned_day: "2026-06-01", turno: "manana" },
    ], error: null };
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("admin")));
    const res = await caller.reassignPending({ round_id: R, from_slot: { date: "2026-06-01", turno: "manana" } });
    expect(res.moved).toBe(1);
    const call = rpcCalls.find((c) => c.name === "move_assignment_to_open_slot");
    expect(call).toBeDefined();
    expect(call?.args.p_assignment_id).toBe(A);
    expect(call?.args.p_new_day).toBe("2026-06-02"); // the later OPEN slot
    expect(call?.args.p_new_turno).toBe("manana");
  });
});
