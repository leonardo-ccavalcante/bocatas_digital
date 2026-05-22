import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import type { User } from "../../../../drizzle/schema";

const tableResults: Record<string, { data: unknown; error: { message: string } | null }> = {};

function makeBuilder(table: string) {
  const result = () => tableResults[table] ?? { data: [], error: null };
  const b: Record<string, unknown> = {
    select: () => b, eq: () => b, in: () => b, is: () => b, order: () => b, limit: () => b,
    single: async () => result(),
    maybeSingle: async () => result(),
    then: (resolve: (v: unknown) => unknown) => resolve(result()),
  };
  return b;
}

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (t: string) => makeBuilder(t),
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://signed/acta.jpg" }, error: null }) }) },
  }),
}));

const extractActaSignatures = vi.fn();
vi.mock("../../../_core/acta-ocr", () => ({ extractActaSignatures: (...a: unknown[]) => extractActaSignatures(...a) }));

const { roundsOcrRouter } = await import("../rounds-ocr");

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
  extractActaSignatures.mockReset();
  vi.clearAllMocks();
});

describe("rounds-ocr — proposeActaCloseout (read-only, OCR→match→propose)", () => {
  it("matches OCR rows to the roster by expediente and pre-selects confident signatures", async () => {
    tableResults["delivery_rounds"] = { data: { signed_actas: { "2026-06-01": { url: "actas/x.jpg" } } }, error: null };
    tableResults["delivery_round_assignments"] = { data: [{ id: "a1", family_id: "f1", expediente: "101" }], error: null };
    tableResults["familia_miembros"] = { data: [{ familia_id: "f1", relacion: "parent", created_at: "x", person_id: "p1" }], error: null };
    tableResults["persons"] = { data: [{ id: "p1", nombre: "Maria", apellidos: "G", numero_documento: null, telefono: null }], error: null };
    extractActaSignatures.mockResolvedValue({ success: true, rows: [{ expediente: "101", signed: true, confidence: 0.95 }], extractionConfidence: 0.9, warnings: [] });

    const caller = roundsOcrRouter.createCaller(ctx(buildUser("voluntario")));
    const res = await caller.proposeActaCloseout({ round_id: R, assigned_day: "2026-06-01" });

    expect(res.proposal.attendedAutoIds).toEqual(["a1"]);
    expect(res.proposal.rows[0].nombre).toBe("Maria G");
    expect(extractActaSignatures).toHaveBeenCalledWith("https://signed/acta.jpg");
  });

  it("errors clearly when no signed-acta photo is stored for the day", async () => {
    tableResults["delivery_rounds"] = { data: { signed_actas: {} }, error: null };
    const caller = roundsOcrRouter.createCaller(ctx(buildUser("voluntario")));
    await expect(caller.proposeActaCloseout({ round_id: R, assigned_day: "2026-06-01" }))
      .rejects.toThrow(/fotograf|acta|NOT_FOUND/i);
  });
});
