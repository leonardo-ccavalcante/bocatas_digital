/**
 * checkin.searchPersons.tokens.test.ts — RC-06 (F027).
 *
 * The manual check-in search must find people by FULL name, in any word
 * order, ignoring accents and stray whitespace. Contract: normalise the
 * query (shared/nameSearch.ts), then AND one `.ilike("nombre_norm", %tok%)`
 * per token (chained .ilike() calls AND in PostgREST) — never the old
 * whole-string `.or(nombre.ilike…,apellidos.ilike…)`.
 *
 * Mocking pattern: persons.getAll-pagination.test.ts (vi.mock
 * createAdminClient; real resolver via createCaller).
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
import { checkinRouter } from "../checkin";

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
    correlationId: "checkin-searchpersons-tokens-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

type Chain = {
  select: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function searchChain(rows: unknown[]): Chain {
  const chain: Chain = {
    select: vi.fn(),
    is: vi.fn(),
    or: vi.fn(),
    ilike: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  chain.select.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.or.mockReturnValue(chain);
  chain.ilike.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("checkin.searchPersons — tokenised accent-insensitive search (RC-06)", () => {
  it("ANDs one nombre_norm ilike per normalised token for '  María  García '", async () => {
    const chain = searchChain([]);
    fromMock.mockReturnValueOnce(chain);

    const caller = checkinRouter.createCaller(voluntarioCtx());
    await caller.searchPersons({ query: "  María  García " });

    expect(fromMock).toHaveBeenCalledWith("persons_safe");
    expect(chain.ilike).toHaveBeenCalledTimes(2);
    expect(chain.ilike).toHaveBeenNthCalledWith(1, "nombre_norm", "%maria%");
    expect(chain.ilike).toHaveBeenNthCalledWith(2, "nombre_norm", "%garcia%");
    expect(chain.or).not.toHaveBeenCalled();
  });

  it("returns [] without querying when the input is whitespace-only", async () => {
    const caller = checkinRouter.createCaller(voluntarioCtx());
    // '   ' passes the zod min(3) guard but has zero tokens.
    const rows = await caller.searchPersons({ query: "   " });

    expect(rows).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
