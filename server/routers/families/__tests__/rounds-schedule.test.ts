import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import type { User } from "../../../../drizzle/schema";

// Per-table query results + captured writes drive the real-resolver tests.
const tableResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
const captured: Array<{ table: string; op: string; payload: unknown }> = [];
const rpcCalls: Array<{ name: string; args: unknown }> = [];
// rpcResults maps RPC name → return value so different RPCs can return different shapes.
const rpcResults: Record<string, unknown> = {};
// rpcErrors maps RPC name → an error to return (for the atomic RPCs that RAISE).
const rpcErrors: Record<string, { message: string }> = {};

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
      if (rpcErrors[name]) return { data: null, error: rpcErrors[name] };
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
  for (const k of Object.keys(rpcErrors)) delete rpcErrors[k];
  captured.length = 0; rpcCalls.length = 0;
  vi.clearAllMocks();
});

describe("rounds-schedule — auth", () => {
  it("rejects voluntario from createRound", async () => {
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("voluntario")));
    await expect(
      caller.createRound({ program_id: PROG, nombre: "Hoja de Firmas Mayo", slots: [{ slot_date: "2026-06-01", turno: "manana" }] }),
    ).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|admin|permission|10002/i);
  });
});

describe("rounds-schedule — createRound", () => {
  it("derives fecha_inicio=min(slot_date), passes creado_por STRING + slots to the atomic RPC", async () => {
    rpcResults["create_round_with_slots"] = "new-round-id";
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin", 42)));
    const res = await caller.createRound({
      program_id: PROG,
      nombre: "Hoja de Firmas Mayo",
      slots: [
        { slot_date: "2026-05-12", turno: "tarde" },
        { slot_date: "2026-05-05", turno: "manana" },
      ],
    });
    expect(res.id).toBe("new-round-id");
    const call = rpcCalls.find((c) => c.name === "create_round_with_slots");
    const args = call?.args as { p_round: Record<string, unknown>; p_slots: unknown[] };
    expect(args.p_round.creado_por).toBe("42");
    expect(typeof args.p_round.creado_por).toBe("string");
    expect(args.p_round.fecha_inicio).toBe("2026-05-05"); // earliest slot date
    expect(args.p_slots).toHaveLength(2);
  });

  it("rejects >10 distinct days (Zod)", async () => {
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    const slots = Array.from({ length: 11 }, (_, i) => ({
      slot_date: `2026-05-${String(i + 1).padStart(2, "0")}`,
      turno: "manana" as const,
    }));
    await expect(caller.createRound({ program_id: PROG, nombre: "R", slots })).rejects.toThrow(/10 d|máximo|BAD_REQUEST/i);
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

  it("maps RPC rows: parses familia_numero, passes total_miembros, derives es_fuera_madrid from CP", async () => {
    rpcResults["get_eligible_families_for_reparto"] = [
      { id: "famA", familia_numero: "7", total_miembros: 5, codigo_postal: "28004" }, // Madrid city
      { id: "famB", familia_numero: "12", total_miembros: 3, codigo_postal: "28801" }, // Alcalá → fuera
      { id: "famC", familia_numero: "13", total_miembros: 2, codigo_postal: null }, // unknown → false
    ];
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    const result = await caller.getEligibleFamilies({ program_id: PROG });
    expect(result).toEqual([
      { id: "famA", familia_numero: 7, total_miembros: 5, es_fuera_madrid: false },
      { id: "famB", familia_numero: 12, total_miembros: 3, es_fuera_madrid: true },
      { id: "famC", familia_numero: 13, total_miembros: 2, es_fuera_madrid: false },
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
    expect(result).toEqual([{ id: "famC", familia_numero: null, total_miembros: 2, es_fuera_madrid: false }]);
  });
});

describe("rounds-schedule — deleteRound", () => {
  it("soft-deletes a borrador round (sets deleted_at)", async () => {
    tableResults["delivery_rounds"] = { data: { id: "r1", estado: "borrador", nombre: "Test Round" }, error: null };
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    const res = await caller.deleteRound({ round_id: "11111111-1111-4111-8111-111111111111" });
    expect(res.deleted).toBe(true);
    const upd = captured.find((c) => c.table === "delivery_rounds" && c.op === "update");
    expect(upd).toBeDefined();
    expect((upd?.payload as Record<string, unknown>).deleted_at).toBeDefined();
  });

  it("allows deletion of an active round (spec: all estados allowed)", async () => {
    tableResults["delivery_rounds"] = { data: { id: "r2", estado: "activa", nombre: "Hoja_Test" }, error: null };
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    const res = await caller.deleteRound({ round_id: "11111111-1111-4111-8111-111111111112" });
    expect(res.deleted).toBe(true);
  });

  it("allows deletion of a closed round (spec: all estados allowed)", async () => {
    tableResults["delivery_rounds"] = { data: { id: "r3", estado: "cerrada", nombre: "Hoja_Test" }, error: null };
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    const res = await caller.deleteRound({ round_id: "11111111-1111-4111-8111-111111111113" });
    expect(res.deleted).toBe(true);
  });

  it("rejects voluntario from deleteRound", async () => {
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("voluntario")));
    await expect(
      caller.deleteRound({ round_id: "11111111-1111-4111-8111-111111111111" }),
    ).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|admin|permission|10002/i);
  });

  it("inserts an audit log row with actor_id and round snapshot", async () => {
    tableResults["delivery_rounds"] = { data: { id: "r1", estado: "borrador", nombre: "Hoja_Test" }, error: null };
    const adminUser = buildUser("admin", 42);
    const caller = roundsScheduleRouter.createCaller(buildCtx(adminUser));
    await caller.deleteRound({ round_id: "11111111-1111-4111-8111-111111111111" });
    const auditInsert = captured.find(
      (c) => c.table === "delivery_rounds_audit_log" && c.op === "insert",
    );
    expect(auditInsert).toBeDefined();
    const payload = auditInsert?.payload as Record<string, unknown>;
    expect(payload.action).toBe("delete_round");
    expect(payload.actor_id).toBe(adminUser.openId);
    expect(payload.round_nombre).toBe("Hoja_Test");
    expect(payload.round_estado).toBe("borrador");
  });

  it("does NOT insert audit log when round is not found", async () => {
    tableResults["delivery_rounds"] = { data: null, error: { message: "not found" } };
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(
      caller.deleteRound({ round_id: "11111111-1111-4111-8111-111111111119" }),
    ).rejects.toThrow(/NOT_FOUND|no encontrado/i);
    const auditInsert = captured.find(
      (c) => c.table === "delivery_rounds_audit_log" && c.op === "insert",
    );
    expect(auditInsert).toBeUndefined();
  });
});

describe("rounds-schedule — commitAssignments", () => {
  it("delegates to the atomic commit RPC (which locks, checks borrador, and activates)", async () => {
    rpcResults["commit_round_assignments"] = 2;
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    const res = await caller.commitAssignments({
      round_id: "11111111-1111-4111-8111-111111111111",
      assignments: [
        { family_id: "22222222-2222-4222-8222-222222222222", assigned_day: "2026-06-01", turno: "manana", day_slot: 1, expediente: "7", total_miembros: 5 },
      ],
    });
    expect(rpcCalls[0]?.name).toBe("commit_round_assignments");
    expect(res.count).toBe(2);
  });

  it("maps the RPC's 'ronda_ya_activada' raise to CONFLICT", async () => {
    rpcErrors["commit_round_assignments"] = { message: "ronda_ya_activada" };
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(
      caller.commitAssignments({
        round_id: "11111111-1111-4111-8111-111111111111",
        assignments: [
          { family_id: "22222222-2222-4222-8222-222222222222", assigned_day: "2026-06-01", turno: "manana", day_slot: 1, expediente: "7", total_miembros: 5 },
        ],
      }),
    ).rejects.toThrow(/activado|CONFLICT/i);
  });
});

describe("rounds-schedule — closeRound completion gate", () => {
  it("BLOCKS closing while any slot is still abierto", async () => {
    tableResults["delivery_round_slots"] = { data: [], error: null, count: 2 } as never;
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(
      caller.closeRound({ round_id: "11111111-1111-4111-8111-111111111111" }),
    ).rejects.toThrow(/Faltan|turno|CONFLICT/i);
  });

  it("ALLOWS closing when every slot is cerrado (0 open)", async () => {
    tableResults["delivery_round_slots"] = { data: [], error: null, count: 0 } as never;
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    const res = await caller.closeRound({ round_id: "11111111-1111-4111-8111-111111111111" });
    expect((res as Record<string, unknown>).estado).toBe("cerrada");
  });
});

describe("rounds-schedule — cerrarTurno", () => {
  const S = "44444444-4444-4444-8444-444444444444";
  it("delegates to the atomic cerrar_turno RPC with the slot id and actor", async () => {
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin", 9)));
    const res = await caller.cerrarTurno({ slot_id: S });
    expect(res.closed).toBe(true);
    const call = rpcCalls.find((c) => c.name === "cerrar_turno");
    expect(call).toBeDefined();
    const args = call?.args as Record<string, unknown>;
    expect(args.p_slot_id).toBe(S);
    expect(args.p_actor).toBe("9");
  });

  it("maps the RPC's 'turno_ya_cerrado' raise to CONFLICT", async () => {
    rpcErrors["cerrar_turno"] = { message: "turno_ya_cerrado" };
    const caller = roundsScheduleRouter.createCaller(buildCtx(buildUser("admin")));
    await expect(caller.cerrarTurno({ slot_id: S })).rejects.toThrow(/cerrado|CONFLICT/i);
  });
});
