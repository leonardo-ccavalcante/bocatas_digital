import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import type { User } from "../../../../drizzle/schema";

const tableResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
const captured: Array<{ table: string; op: string; payload: Record<string, unknown> }> = [];

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
  createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }),
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
  captured.length = 0; vi.clearAllMocks();
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
    const r = await caller.resolveAssignment({ round_id: R, person_id: P, current_day: "2026-06-01" });
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
    const rows = await caller.getAssignmentsForDay({ round_id: R, assigned_day: "2026-06-01" });
    expect(rows[0].nombre_titular).toBe("Maria García");
    const keys = Object.keys(rows[0]);
    expect(keys).not.toContain("dni");
    expect(keys).not.toContain("numero_documento");
    expect(keys).not.toContain("telefono");
  });
});
