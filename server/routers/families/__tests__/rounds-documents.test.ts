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

const { storagePut } = vi.hoisted(() => ({ storagePut: vi.fn() }));
vi.mock("../../../storage", () => ({ storagePut }));

const { roundsDocumentsRouter } = await import("../rounds-documents");

function buildUser(role: User["role"], id = "test-user-1"): User {
  return { id, openId: `m${id}`, name: "T", email: "t@e.com", loginMethod: "manus", role,
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as unknown as User;
}
function ctx(u: User | null): TrpcContext {
  return { req: {} as never, res: {} as never, user: u, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never, correlationId: "t" };
}
const R = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  for (const k of Object.keys(tableResults)) delete tableResults[k];
  captured.length = 0; vi.clearAllMocks();
});

describe("rounds-documents — attachSignedActa (per-slot, RC-03/F184)", () => {
  const SLOT = "22222222-2222-4222-8222-222222222222";

  it("uploads the photo server-side into family-documents and records path + audit on the slot", async () => {
    tableResults["delivery_round_slots"] = { data: { id: SLOT, round_id: R }, error: null };
    storagePut.mockResolvedValue({ bucket: "family-documents", path: `actas-firmadas/${R}/${SLOT}.jpg` });
    const caller = roundsDocumentsRouter.createCaller(ctx(buildUser("admin", "test-user-7")));
    await caller.attachSignedActa({ round_id: R, slot_id: SLOT, base64: Buffer.from("acta-bytes").toString("base64") });

    expect(storagePut).toHaveBeenCalledWith(
      "family-documents",
      `actas-firmadas/${R}/${SLOT}.jpg`,
      Buffer.from("acta-bytes"),
      "image/jpeg",
    );
    const upd = captured.find((c) => c.table === "delivery_round_slots" && c.op === "update");
    const acta = upd?.payload.signed_acta as { url: string; by: string };
    expect(acta.url).toBe(`actas-firmadas/${R}/${SLOT}.jpg`);
    expect(acta.by).toBe("test-user-7");
  });

  it("rejects an empty payload without touching storage", async () => {
    tableResults["delivery_round_slots"] = { data: { id: SLOT, round_id: R }, error: null };
    const caller = roundsDocumentsRouter.createCaller(ctx(buildUser("admin")));
    await expect(caller.attachSignedActa({ round_id: R, slot_id: SLOT, base64: "" })).rejects.toThrow();
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("rejects voluntario (admin-only)", async () => {
    const caller = roundsDocumentsRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(
      caller.attachSignedActa({ round_id: R, slot_id: SLOT, base64: "eA==" }),
    ).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|admin|permission|10002/i);
  });
});
