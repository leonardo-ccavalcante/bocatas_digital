import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import type { User } from "../../../../drizzle/schema";

const tableResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
const captured: Array<{ table: string; op: string; payload: Record<string, unknown> }> = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const rpcResults: Record<string, unknown> = {};
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
      return { data: rpcResults[name] ?? null, error: null };
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
  for (const k of Object.keys(rpcResults)) delete rpcResults[k];
  for (const k of Object.keys(rpcErrors)) delete rpcErrors[k];
  captured.length = 0; rpcCalls.length = 0; vi.clearAllMocks();
});

const S = "44444444-4444-4444-8444-444444444444";

describe("rounds-closeout — markAttendance", () => {
  it("stamps attended_slot_id and appends one undo_log entry (prev + prev_slot_id)", async () => {
    tableResults["delivery_round_assignments"] = { data: { id: A, round_id: R, attended: null, attended_slot_id: null, undo_log: [] }, error: null };
    tableResults["delivery_round_slots"] = { data: { round_id: R }, error: null }; // slot∈round fence
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario", 9)));
    await caller.markAttendance({ assignment_id: A, slot_id: S, attended: true });
    const upd = captured.find((c) => c.op === "update");
    const log = upd?.payload.undo_log as Array<{ prev: unknown; prev_slot_id: unknown; by: string }>;
    expect(log).toHaveLength(1);
    expect(log[0].prev).toBeNull();
    expect(log[0].prev_slot_id).toBeNull();
    expect(log[0].by).toBe("9");
    expect(upd?.payload.attended).toBe(true);
    expect(upd?.payload.attended_slot_id).toBe(S);
  });
});

describe("rounds-closeout — undoAttendance", () => {
  it("restores attended AND attended_slot_id from the last undo entry", async () => {
    tableResults["delivery_round_assignments"] = {
      data: { id: A, round_id: R, attended: true, attended_slot_id: S, undo_log: [{ prev: null, prev_slot_id: null, at: "x", by: "9" }] }, error: null };
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario")));
    await caller.undoAttendance({ assignment_id: A });
    const upd = captured.find((c) => c.op === "update");
    expect(upd?.payload.attended).toBeNull();
    expect(upd?.payload.attended_slot_id).toBeNull();
  });

  it("throws BAD_REQUEST when there is nothing to undo", async () => {
    tableResults["delivery_round_assignments"] = { data: { id: A, round_id: R, attended: null, attended_slot_id: null, undo_log: [] }, error: null };
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(caller.undoAttendance({ assignment_id: A })).rejects.toThrow(/deshacer|BAD_REQUEST/i);
  });
});

describe("rounds-closeout — resolveAssignment (any open day is valid)", () => {
  it("returns not_in_program when the person belongs to no family", async () => {
    tableResults["delivery_round_slots"] = { data: { round_id: R, slot_date: "2026-06-01", turno: "manana" }, error: null };
    tableResults["familia_miembros"] = { data: [], error: null };
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario")));
    const r = await caller.resolveAssignment({ round_id: R, person_id: P, slot_id: S });
    expect(r.status).toBe("not_in_program");
  });

  it("a family suggested for another day still resolves to ready (es_dia_sugerido=false)", async () => {
    tableResults["delivery_round_slots"] = { data: { round_id: R, slot_date: "2026-06-02", turno: "manana" }, error: null };
    tableResults["familia_miembros"] = { data: [{ familia_id: "famA", created_at: "2026-01-01" }], error: null };
    tableResults["delivery_round_assignments"] = { data: { id: A, assigned_day: "2026-06-05", turno: "tarde", attended: null }, error: null };
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario")));
    const r = await caller.resolveAssignment({ round_id: R, person_id: P, slot_id: S });
    expect(r.status).toBe("ready");
    if (r.status === "ready") expect(r.es_dia_sugerido).toBe(false);
  });
});

describe("rounds-closeout — bulkMarkAttendance (atomic RPC)", () => {
  const RR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  it("delegates to the atomic bulk_mark_attendance RPC with the slot + actor", async () => {
    rpcResults["bulk_mark_attendance"] = 2;
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario", 5)));
    const res = await caller.bulkMarkAttendance({
      round_id: RR, slot_id: S,
      assignment_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      attended: true,
    });
    const call = rpcCalls.find((c) => c.name === "bulk_mark_attendance");
    expect(call?.args.p_slot_id).toBe(S);
    expect(call?.args.p_actor).toBe("5");
    expect(res.count).toBe(2);
  });

  it("maps the RPC's slot_ajeno raise to BAD_REQUEST", async () => {
    rpcErrors["bulk_mark_attendance"] = { message: "slot_ajeno" };
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(caller.bulkMarkAttendance({ round_id: RR, slot_id: S, assignment_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], attended: true }))
      .rejects.toThrow(/no pertenece|BAD_REQUEST/i);
  });

  it("rejects an empty batch (Zod)", async () => {
    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(caller.bulkMarkAttendance({ round_id: RR, slot_id: S, assignment_ids: [], attended: true }))
      .rejects.toThrow(/vac|empty|BAD_REQUEST/i);
  });
});

describe("rounds-closeout — getSlotRoster PII gate + carry-over ordering", () => {
  it("returns ALL pending smallest-first, name only (no DNI/phone)", async () => {
    tableResults["delivery_round_slots"] = { data: { id: S, round_id: R, slot_date: "2026-06-01", turno: "manana", estado: "abierto" }, error: null };
    tableResults["delivery_round_assignments"] = {
      data: [
        { id: "a-big", family_id: "famBig", assigned_day: "2026-06-02", turno: "manana", expediente: "10", total_miembros: 5, attended: null, attended_slot_id: null, estado_contacto: "pendiente" },
        { id: "a-small", family_id: "famSmall", assigned_day: "2026-06-01", turno: "manana", expediente: "2", total_miembros: 1, attended: null, attended_slot_id: null, estado_contacto: "pendiente" },
      ],
      error: null };
    tableResults["familia_miembros"] = { data: [
      { familia_id: "famBig", relacion: "parent", created_at: "2026-01-01", person_id: "pB" },
      { familia_id: "famSmall", relacion: "parent", created_at: "2026-01-01", person_id: "pS" },
    ], error: null };
    tableResults["persons"] = { data: [
      { id: "pB", nombre: "Big", apellidos: "Fam", numero_documento: "X1", telefono: "600" },
      { id: "pS", nombre: "Small", apellidos: "Fam", numero_documento: "X2", telefono: "601" },
    ], error: null };

    const caller = roundsCloseoutRouter.createCaller(ctx(buildUser("voluntario")));
    const res = await caller.getSlotRoster({ round_id: R, slot_id: S });
    expect(res.pending.map((p) => p.total_miembros)).toEqual([1, 5]); // smallest first
    expect(res.pending[0].es_sugerido).toBe(true); // famSmall suggested for this day
    expect(res.pending[1].es_sugerido).toBe(false);
    const keys = Object.keys(res.pending[0]);
    expect(keys).not.toContain("numero_documento");
    expect(keys).not.toContain("telefono");
    expect(res.pending[0].nombre_titular).toBe("Small Fam");
  });
});
