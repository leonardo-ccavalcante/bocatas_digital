/**
 * persons.search.tokens.test.ts — RC-06 (F065).
 *
 * persons.search must match full names in ANY word order and ignore accents:
 * each token of the normalised query becomes one AND'ed
 * `.ilike("nombre_norm", …)` filter, replacing the old whole-string
 * `.or(nombre.ilike…,apellidos.ilike…)`.
 *
 * Mocking pattern: persons.getAll-pagination.test.ts.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

const fromMock = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

vi.mock("../../storage", () => ({
  signPathField: vi.fn(async () => undefined),
  AVATAR_BUCKET: "avatars",
}));

// Import AFTER vi.mock is registered.
import { crudRouter } from "../persons/crud";

function voluntarioCtx(): TrpcContext {
  const user: NonNullable<TrpcContext["user"]> = {
    id: "test-user-1",
    openId: "test-voluntario",
    email: "voluntario@bocatas.org",
    name: "voluntario",
    loginMethod: "manus",
    role: "voluntario",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "persons-search-tokens-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

type Chain = {
  select: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function searchChain(rows: unknown[]): Chain {
  const chain: Chain = {
    select: vi.fn(),
    is: vi.fn(),
    or: vi.fn(),
    ilike: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  chain.select.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.or.mockReturnValue(chain);
  chain.ilike.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("persons.search — tokenised accent-insensitive search (RC-06)", () => {
  it("matches word-order-independently: 'López  García' → AND of %lopez% and %garcia%", async () => {
    const chain = searchChain([]);
    fromMock.mockReturnValueOnce(chain);

    const caller = crudRouter.createCaller(voluntarioCtx());
    await caller.search({ query: " López  García " });

    expect(fromMock).toHaveBeenCalledWith("persons");
    expect(chain.ilike).toHaveBeenCalledTimes(2);
    expect(chain.ilike).toHaveBeenNthCalledWith(1, "nombre_norm", "%lopez%");
    expect(chain.ilike).toHaveBeenNthCalledWith(2, "nombre_norm", "%garcia%");
    expect(chain.or).not.toHaveBeenCalled();
  });

  it("returns [] without querying when the input is whitespace-only", async () => {
    const caller = crudRouter.createCaller(voluntarioCtx());
    // '  ' passes the zod min(2) guard but has zero tokens.
    const rows = await caller.search({ query: "  " });

    expect(rows).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
