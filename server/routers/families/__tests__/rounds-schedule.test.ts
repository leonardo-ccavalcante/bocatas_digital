import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import type { User } from "../../../../drizzle/schema";

// Per-table query results + captured writes drive the real-resolver tests.
const tableResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
const captured: Array<{ table: string; op: string; payload: unknown }> = [];
const rpcCalls: Array<{ name: string; args: unknown }> = [];
// rpcResults maps RPC name → return value so different RPCs can return different shapes.
const rpcResults: Record<string, unknown> = {};

function makeBuilder(table: string) {
  let write: Record<string, unknown> | null = null;
  const result = () =>
    write
      ? { data: { id: `${table}-id`, ...write }, error: null }
      : (tableResults[table] ?? { data: [], error: null });
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (p: Record<string, unknown>) => { write = p; captured.push({ table, op: "insert", payload: p }); return b; },
    update: (p: Record<string, unknown>) => { write = p; captured.push({ table, op: "update", payload: p }); return b; },
    delete: () => b,
    eq: () => b, in: () => b, is: () => b, not: () => b, order: () => b,
    single: async () => result(),
    maybeSingle: async () => result(),
    then: (resolve: (v: unknown) => unknown) => resolve(result()),
  };
  return b;
}

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => makeBuilder(table),
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      const result = rpcResults[name] ?? [];
      return { data: result, error: null };
    },
  }),
}));

// Import AFTER the mock is registered.
const { roundsScheduleRouter } = await import("../rounds-schedule");

function buildUser(role: User["role"], id = 1): User {
  return { id, openId: `manus-${id}`, name: "T", email: "t@e.com", loginMethod: "manus", role,
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as User;
}
function buildCtx(user: User | null): TrpcContext {
  return { req: {} as never, res: {} as never, user,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never, correlationId: "t" };
}
const PROG = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  for (const k of Object.keys(tableResults)) delete tableResults[k];
  for (const k of Object.keys(rpcResults)) delete rpcResults[k];
  captured.length = 0; rpcCalls.length = 0;
  vi.clearAllMocks();
});

describe("rounds-schedule — auth", () => {
  it("rejects voluntario from createRound", async () => {
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("voluntario")));
    await expect(
      caller.createRound({ program_id: PROG, nombre: "Hoja de Firmas Mayo", fecha_inicio: "2026-06-01", dias_reparto: 3 }),
    ).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|admin|permission|10002/i);
  });
});

describe("rounds-schedule — createRound", () => {
  it("stores creado_por as a STRING (Manus numeric id) — 22P02 regression", async () => {
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin", 42)));
    await caller.createRound({ program_id: PROG, nombre: "Hoja de Firmas Mayo", fecha_inicio: "2026-06-01", dias_reparto: 3 });
    const insert = captured.find((c) => c.table === "delivery_rounds" && c.op === "insert");
    const payload = insert?.payload as Record<string, unknown>;
    expect(payload.creado_por).toBe("42");
    expect(typeof payload.creado_por).toBe("string");
    expect(payload.estado).toBe("borrador");
  });
});

describe("rounds-schedule — getEligibleFamilies (PRE-1, RPC-based)", () => {
  it("calls get_eligible_families_for_reparto RPC with the program_id", async () => {
    rpcResults["get_eligible_families_for_reparto"] = [];
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    await caller.getEligibleFamilies({ program_id: PROG });
    expect(rpcCalls[0]?.name).toBe("get_eligible_families_for_reparto");
    expect((rpcCalls[0]?.args as Record<string, unknown>).p_program_id).toBe(PROG);
  });

  it("maps RPC rows: parses familia_numero string→number and passes total_miembros through", async () => {
    rpcResults["get_eligible_families_for_reparto"] = [
      { id: "famA", familia_numero: "7", total_miembros: 5 },
      { id: "famB", familia_numero: "12", total_miembros: 3 },
    ];
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    const result = await caller.getEligibleFamilies({ program_id: PROG });
    expect(result).toEqual([
      { id: "famA", familia_numero: 7, total_miembros: 5 },
      { id: "famB", familia_numero: 12, total_miembros: 3 },
    ]);
  });

  it("returns [] when RPC returns empty array (no enrolled families)", async () => {
    rpcResults["get_eligible_families_for_reparto"] = [];
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    expect(await caller.getEligibleFamilies({ program_id: PROG })).toEqual([]);
  });

  it("handles null familia_numero gracefully", async () => {
    rpcResults["get_eligible_families_for_reparto"] = [
      { id: "famC", familia_numero: null, total_miembros: 2 },
    ];
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    const result = await caller.getEligibleFamilies({ program_id: PROG });
    expect(result).toEqual([{ id: "famC", familia_numero: null, total_miembros: 2 }]);
  });
});

describe("rounds-schedule — commitAssignments", () => {
  it("calls the commit RPC and activates the round", async () => {
    tableResults["delivery_rounds"] = { data: { id: "r1", estado: "borrador" }, error: null };
    rpcResults["commit_round_assignments"] = 2;
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    const res = await caller.commitAssignments({
      round_id: "11111111-1111-4111-8111-111111111111",
      assignments: [
        { family_id: "22222222-2222-4222-8222-222222222222", assigned_day: "2026-06-01", day_slot: 1, expediente: "7", total_miembros: 5 },
      ],
    });
    expect(rpcCalls[0]?.name).toBe("commit_round_assignments");
    expect(res.count).toBe(2);
    expect(captured.some((c) => c.table === "delivery_rounds" && c.op === "update" && (c.payload as Record<string, unknown>).estado === "activa")).toBe(true);
  });
});
