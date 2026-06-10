/**
 * familyDocuments.listAllForProgram.test.ts
 *
 * Verifies that listAllForProgram is scoped to the provided programaId
 * and rejects input that omits it.
 *
 * Mocking pattern: vi.mock createAdminClient with a chainable fake query
 * builder — no live DB required (mirrors mapa-router.test.ts pattern).
 */

import { TRPCError } from "@trpc/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../_core/context";
import { Logger } from "../_core/logger";

// ─── Supabase mock — must precede router import ───────────────────────────────
const fromMock = vi.fn();

vi.mock("../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import AFTER mock
import { documentsRouter } from "../routers/families/documents";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function adminCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@bocatas.org",
    name: "Admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "test-list-all",
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// Build a minimal chainable Supabase query mock that terminates in a thenable.
// The actual chain used in listAllForProgram is:
//   .from(...).select(..., {count}).eq(...).not(...).eq(...).is(...).order(...).range(...)
// Each step returns `this`; the final await resolves the data/error/count.
function mockQueryChain(data: unknown[], count = 0, error: null | { message: string } = null) {
  const result = { data, error, count };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    then: (
      resolve: (v: typeof result) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  // Allow `chain.eq(...)` etc. to chain again
  for (const key of Object.keys(chain)) {
    if (key !== "then" && typeof (chain[key] as ReturnType<typeof vi.fn>).mockReturnThis === "function") {
      (chain[key] as ReturnType<typeof vi.fn>).mockReturnThis();
    }
  }
  return chain;
}

beforeEach(() => {
  fromMock.mockReset();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("families.listAllForProgram — programaId required (Fix 1 security)", () => {
  it("rejects input with missing programaId (Zod BAD_REQUEST)", async () => {
    const caller = documentsRouter.createCaller(adminCtx());
    await expect(
      // @ts-expect-error — intentionally omitting required programaId to verify Zod rejects it
      caller.listAllForProgram({ limit: 10, offset: 0 }),
    ).rejects.toThrow();
    // Supabase must not have been called
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID programaId (Zod BAD_REQUEST)", async () => {
    const caller = documentsRouter.createCaller(adminCtx());
    await expect(
      caller.listAllForProgram({ programaId: "not-a-uuid", limit: 10, offset: 0 }),
    ).rejects.toThrow();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("passes programaId through to the query chain (scoping)", async () => {
    const PROG_ID = "aaaabbbb-cccc-4ddd-8eee-ffff00001111";
    const chain = mockQueryChain([], 0);
    fromMock.mockReturnValueOnce(chain);

    const caller = documentsRouter.createCaller(adminCtx());
    await caller.listAllForProgram({ programaId: PROG_ID, limit: 10, offset: 0 });

    // The chain is called on "family_member_documents"
    expect(fromMock).toHaveBeenCalledWith("family_member_documents");

    // .eq() must have been called at some point with the program_document_types filter.
    // The router adds: .eq("program_document_types.programa_id", programaId)
    // We verify eq was called at all (the specific column arg confirms the scope wiring).
    const eqCalls = (chain.eq as ReturnType<typeof vi.fn>).mock.calls as [string, string][];
    const programaScopeCall = eqCalls.find(
      ([col, val]: [string, string]) =>
        col === "program_document_types.programa_id" && val === PROG_ID,
    );
    expect(programaScopeCall).toBeDefined();
  });

  it("excludes rows with tipo_id IS NULL (not(...,'is',null) in chain)", async () => {
    const PROG_ID = "aaaabbbb-cccc-4ddd-8eee-ffff00001112";
    const chain = mockQueryChain([], 0);
    fromMock.mockReturnValueOnce(chain);

    const caller = documentsRouter.createCaller(adminCtx());
    await caller.listAllForProgram({ programaId: PROG_ID, limit: 10, offset: 0 });

    // Verify the .not("tipo_id","is",null) guard is called
    const notCalls = (chain.not as ReturnType<typeof vi.fn>).mock.calls as [string, string, null][];
    const tipoIdNullGuard = notCalls.find(
      ([col, op]: [string, string, null]) => col === "tipo_id" && op === "is",
    );
    expect(tipoIdNullGuard).toBeDefined();
  });

  it("returns the rows and total from the DB response", async () => {
    const PROG_ID = "aaaabbbb-cccc-4ddd-8eee-ffff00001113";
    const fakeRow = { id: "doc-1", documento_tipo: "padron_municipal" };
    const chain = mockQueryChain([fakeRow], 1);
    fromMock.mockReturnValueOnce(chain);

    const caller = documentsRouter.createCaller(adminCtx());
    const result = await caller.listAllForProgram({ programaId: PROG_ID, limit: 10, offset: 0 });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("propagates DB errors as INTERNAL_SERVER_ERROR", async () => {
    const PROG_ID = "aaaabbbb-cccc-4ddd-8eee-ffff00001114";
    const errorChain = mockQueryChain([], 0, { message: "DB timeout" });
    fromMock.mockReturnValueOnce(errorChain);

    const caller = documentsRouter.createCaller(adminCtx());
    await expect(
      caller.listAllForProgram({ programaId: PROG_ID, limit: 10, offset: 0 }),
    ).rejects.toMatchObject({
      name: "TRPCError",
      code: "INTERNAL_SERVER_ERROR",
    } satisfies Partial<TRPCError>);
  });
});
