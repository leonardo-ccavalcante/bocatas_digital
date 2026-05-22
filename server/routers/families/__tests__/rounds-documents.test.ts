import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import type { User } from "../../../../drizzle/schema";

const tableResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
const captured: Array<{ table: string; op: string; payload: Record<string, unknown> }> = [];

function makeBuilder(table: string) {
  let write: Record<string, unknown> | null = null;
  const result = () => (write ? { data: { id: `${table}-id`, ...write }, error: null } : (tableResults[table] ?? { data: [], error: null }));
  const b: Record<string, unknown> = {
    select: () => b,
    insert: (p: Record<string, unknown>) => { write = p; captured.push({ table, op: "insert", payload: p }); return b; },
    update: (p: Record<string, unknown>) => { write = p; captured.push({ table, op: "update", payload: p }); return b; },
    delete: () => b, eq: () => b, in: () => b, is: () => b, not: () => b, order: () => b, limit: () => b,
    single: async () => result(),
    maybeSingle: async () => result(),
    then: (resolve: (v: unknown) => unknown) => resolve(result()),
  };
  return b;
}

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }),
}));

const { roundsDocumentsRouter } = await import("../rounds-documents");

function buildUser(role: User["role"], id = 1): User {
  return { id, openId: `m${id}`, name: "T", email: "t@e.com", loginMethod: "manus", role,
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as User;
}
function ctx(u: User | null): TrpcContext {
  return { req: {} as never, res: {} as never, user: u, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never, correlationId: "t" };
}
const R = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  for (const k of Object.keys(tableResults)) delete tableResults[k];
  captured.length = 0; vi.clearAllMocks();
});

describe("rounds-documents — attachSignedActa (T-Doc-3)", () => {
  it("records the signed-acta path + audit (by/at) under the day key, preserving other days", async () => {
    tableResults["delivery_rounds"] = { data: { signed_actas: { "2026-06-01": { url: "old", by: "1", at: "x" } } }, error: null };
    const caller = roundsDocumentsRouter.createCaller(ctx(buildUser("admin", 7)));
    await caller.attachSignedActa({ round_id: R, assigned_day: "2026-06-08", documento_url: "actas-firmadas/r/2026-06-08.jpg" });

    const upd = captured.find((c) => c.op === "update");
    const map = upd?.payload.signed_actas as Record<string, { url: string; by: string }>;
    expect(map["2026-06-08"].url).toBe("actas-firmadas/r/2026-06-08.jpg");
    expect(map["2026-06-08"].by).toBe("7");
    expect(map["2026-06-01"]).toBeDefined(); // existing day preserved
  });

  it("rejects voluntario (admin-only)", async () => {
    const caller = roundsDocumentsRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(
      caller.attachSignedActa({ round_id: R, assigned_day: "2026-06-08", documento_url: "x" }),
    ).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|admin|permission|10002/i);
  });
});
