import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import type { User } from "../../../../drizzle/schema";

// Configurable per-table results + a storage/rpc spy.
const tableResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
const rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const uploads: Array<{ path: string }> = [];
const removed: string[] = [];

function makeBuilder(table: string) {
  const res = () => tableResults[table] ?? { data: null, error: null };
  const b: Record<string, unknown> = {
    select: () => b, eq: () => b, is: () => b, in: () => b,
    maybeSingle: async () => res(), single: async () => res(),
    then: (r: (v: unknown) => unknown) => r(res()),
  };
  return b;
}

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (t: string) => makeBuilder(t),
    storage: {
      from: () => ({
        upload: async (path: string) => { uploads.push({ path }); return { error: null }; },
        remove: async (paths: string[]) => { removed.push(...paths); return { error: null }; },
      }),
    },
    rpc: async () => rpcResult,
  }),
}));

const { roundsSignatureRouter } = await import("../rounds-signature");

function buildUser(role: User["role"], id = 5): User {
  return { id, openId: `m${id}`, name: "T", email: "t@e.com", loginMethod: "manus", role,
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as User;
}
function ctx(u: User | null): TrpcContext {
  return { req: { headers: {}, socket: {} } as never, res: {} as never, user: u,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never, correlationId: "t" };
}

const A = "11111111-1111-4111-8111-111111111111";
const SLOT = "22222222-2222-4222-8222-222222222222";
const SIGNER = "33333333-3333-4333-8333-333333333333";
// data:image/png;base64 of the 4 PNG magic bytes (valid) vs "ABCD" (invalid).
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const NOT_IMG = "data:image/png;base64,QUJDRA==";

beforeEach(() => {
  for (const k of Object.keys(tableResults)) delete tableResults[k];
  rpcResult.data = [{ audit_id: "aud-1", audit_signed_at: "2026-08-01T00:00:00Z" }];
  rpcResult.error = null;
  uploads.length = 0; removed.length = 0;
  process.env.REPARTO_FIRMA_ENABLED = "1";
  vi.clearAllMocks();
});
afterEach(() => { delete process.env.REPARTO_FIRMA_ENABLED; });

describe("rounds-signature — RGPD gate", () => {
  it("refuses with PRECONDITION_FAILED when REPARTO_FIRMA_ENABLED is unset", async () => {
    delete process.env.REPARTO_FIRMA_ENABLED;
    const caller = roundsSignatureRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(caller.recordRepartoSignature({ assignment_id: A, slot_id: SLOT, signer_person_id: SIGNER, signature_data_url: PNG }))
      .rejects.toThrow(/no está habilitada|PRECONDITION_FAILED/i);
    expect(uploads).toHaveLength(0); // gate stops before any side effect
  });

  it("getSignatureAudit is also gated", async () => {
    delete process.env.REPARTO_FIRMA_ENABLED;
    const caller = roundsSignatureRouter.createCaller(ctx(buildUser("admin")));
    await expect(caller.getSignatureAudit({ round_id: A })).rejects.toThrow(/PRECONDITION_FAILED|habilitada/i);
  });
});

describe("rounds-signature — IDOR guard", () => {
  it("FORBIDDEN when the signer is not a member of the assignment's family", async () => {
    tableResults["delivery_round_assignments"] = { data: { id: A, family_id: "famA" }, error: null };
    tableResults["familia_miembros"] = { data: null, error: null }; // signer NOT a member
    const caller = roundsSignatureRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(caller.recordRepartoSignature({ assignment_id: A, slot_id: SLOT, signer_person_id: SIGNER, signature_data_url: PNG }))
      .rejects.toThrow(/no pertenece|FORBIDDEN/i);
    expect(uploads).toHaveLength(0); // never uploads for an unauthorized signer
  });
});

describe("rounds-signature — image validation", () => {
  it("BAD_REQUEST when the bytes are not a real PNG/JPEG (magic-byte check)", async () => {
    tableResults["delivery_round_assignments"] = { data: { id: A, family_id: "famA" }, error: null };
    tableResults["familia_miembros"] = { data: { person_id: SIGNER }, error: null };
    tableResults["app_settings"] = { data: { value: "salt" }, error: null };
    const caller = roundsSignatureRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(caller.recordRepartoSignature({ assignment_id: A, slot_id: SLOT, signer_person_id: SIGNER, signature_data_url: NOT_IMG }))
      .rejects.toThrow(/inválido|BAD_REQUEST/i);
    expect(uploads).toHaveLength(0);
  });
});

describe("rounds-signature — RPC conflict mapping", () => {
  it("maps firma_conflicto to CONFLICT and cleans up the freshly-uploaded object", async () => {
    tableResults["delivery_round_assignments"] = { data: { id: A, family_id: "famA" }, error: null };
    tableResults["familia_miembros"] = { data: { person_id: SIGNER }, error: null };
    tableResults["app_settings"] = { data: { value: "salt" }, error: null };
    rpcResult.error = { message: "firma_conflicto" };
    const caller = roundsSignatureRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(caller.recordRepartoSignature({ assignment_id: A, slot_id: SLOT, signer_person_id: SIGNER, signature_data_url: PNG }))
      .rejects.toThrow(/firma distinta|CONFLICT/i);
    expect(uploads).toHaveLength(1);
    expect(removed).toHaveLength(1); // storage cleaned up after RPC failure
  });

  it("maps ya_atendida to CONFLICT (not a 500)", async () => {
    tableResults["delivery_round_assignments"] = { data: { id: A, family_id: "famA" }, error: null };
    tableResults["familia_miembros"] = { data: { person_id: SIGNER }, error: null };
    tableResults["app_settings"] = { data: { value: "salt" }, error: null };
    rpcResult.error = { message: "ya_atendida" };
    const caller = roundsSignatureRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(caller.recordRepartoSignature({ assignment_id: A, slot_id: SLOT, signer_person_id: SIGNER, signature_data_url: PNG }))
      .rejects.toThrow(/otro turno|CONFLICT/i);
  });
});
