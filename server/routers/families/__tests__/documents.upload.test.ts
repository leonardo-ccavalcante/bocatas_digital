/**
 * RC-03: family documents must be written into the PRIVATE family-documents
 * bucket SERVER-SIDE. families.uploadFamilyDocument receives the bytes as
 * base64 and performs the storage write itself (service role, ADR-0002) —
 * the browser never touches Supabase Storage, and the old two-step
 * client-side upload + rollback dance disappears.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import type { User } from "../../../../drizzle/schema";

const tableResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

function makeBuilder(table: string) {
  const result = () => tableResults[table] ?? { data: [], error: null };
  const b: Record<string, unknown> = {
    select: () => b, insert: () => b, update: () => b, delete: () => b,
    eq: () => b, in: () => b, is: () => b, not: () => b, order: () => b, limit: () => b,
    single: async () => result(), maybeSingle: async () => result(),
    then: (resolve: (v: unknown) => unknown) => resolve(result()),
  };
  return b;
}

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (t: string) => makeBuilder(t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: { id: "doc-1", ...args }, error: null };
    },
  }),
}));

const { storagePut } = vi.hoisted(() => ({ storagePut: vi.fn() }));
vi.mock("../../../storage", () => ({ storagePut }));
vi.mock("../../../db", () => ({ getDb: async () => null }));
vi.mock("../../../services/docxToPdf", () => ({
  convertDocxToPdf: vi.fn(),
  LibreOfficeUnavailableError: class LibreOfficeUnavailableError extends Error {},
}));

const { documentsRouter } = await import("../documents");

function buildUser(role: User["role"], id = "test-user-1"): User {
  return { id, openId: `m${id}`, name: "T", email: "t@e.com", loginMethod: "manus", role,
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as unknown as User;
}
function ctx(u: User | null): TrpcContext {
  return { req: {} as never, res: {} as never, user: u, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never, correlationId: "t" };
}

const FAM = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  for (const k of Object.keys(tableResults)) delete tableResults[k];
  rpcCalls.length = 0; vi.clearAllMocks();
});

describe("families.uploadFamilyDocument — server-side storage write (RC-03)", () => {
  it("uploads the bytes to family-documents server-side, then writes the row via the RPC", async () => {
    storagePut.mockResolvedValue({ bucket: "family-documents", path: `${FAM}/-1/padron_municipal/1.pdf` });
    const caller = documentsRouter.createCaller(ctx(buildUser("admin", "u7")));
    const res = await caller.uploadFamilyDocument({
      family_id: FAM,
      member_index: -1,
      documento_tipo: "padron_municipal",
      documento_url: `${FAM}/-1/padron_municipal/1.pdf`,
      base64: Buffer.from("pdf-bytes").toString("base64"),
      content_type: "application/pdf",
    });

    expect(storagePut).toHaveBeenCalledWith(
      "family-documents",
      `${FAM}/-1/padron_municipal/1.pdf`,
      Buffer.from("pdf-bytes"),
      "application/pdf",
    );
    const rpc = rpcCalls.find((c) => c.fn === "upload_family_document");
    expect(rpc?.args).toMatchObject({
      p_family_id: FAM,
      p_documento_url: `${FAM}/-1/padron_municipal/1.pdf`,
      p_verified_by: "u7",
    });
    expect(res).toBeDefined();
  });

  it("rejects a payload without file bytes (base64 is required) and never touches storage", async () => {
    const caller = documentsRouter.createCaller(ctx(buildUser("admin")));
    await expect(
      // @ts-expect-error — the old client shape without base64 must no longer validate
      caller.uploadFamilyDocument({ family_id: FAM, member_index: -1, documento_tipo: "padron_municipal", documento_url: "x" })
    ).rejects.toThrow();
    expect(storagePut).not.toHaveBeenCalled();
  });
});
