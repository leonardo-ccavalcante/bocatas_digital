/**
 * getAll-pagination.test.ts — families.getAll unbounded dataset (MYT-80-ATL04).
 *
 * gh #80: families.getAll builds its query with no .limit()/.range() anywhere
 * in the chain (server/routers/families/crud.ts around line 76: the query is
 * awaited directly at `.order("familia_numero", ...)` with no cap applied
 * first). Every call returns the ENTIRE families table. As the table grows
 * this is an unbounded payload — and FamiliasList.tsx renders it with a plain
 * .map() with no virtualization.
 *
 * Fix (retrocompatible): accept optional { limit, offset } input and apply a
 * generous default cap (e.g. 500) when omitted, so the server never returns
 * an unbounded payload again. The response stays a bare array — no `total`/
 * exact count is added here: no caller consumes it today, and superjson (the
 * app's actual tRPC transformer, server/_core/trpc.ts) strips non-index
 * properties from arrays over the wire, so an Object.assign(data, { total })
 * shim can never reach a real client (only an in-process createCaller test
 * would see it — a false-green). Exact `total` is DEFERRED-E5; when needed,
 * follow the wrapped-shape convention already used by
 * server/routers/entregas/crud.ts and server/routers/persons/history.ts
 * (`return { data, total }`) and migrate the callers together.
 *
 * Client wiring (FamiliasList.tsx / ProgramaDetalle.tsx) is OUT OF SCOPE here
 * — PROHIBITED per the wave-9 finding (E5 uncommitted work in repo/) and
 * DEFERRED-E5. This file only proves the server-side contract is missing.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

// ─── vi.mock — must precede router import ─────────────────────────────────
const fromMock = vi.fn();

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import AFTER vi.mock is registered.
import { crudRouter } from "../crud";

function ctxAdmin(): TrpcContext {
  const user: NonNullable<TrpcContext["user"]> = {
    id: 1,
    openId: "test-user",
    email: "admin@bocatas.org",
    name: "admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "families-getall-pagination-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

/**
 * Mirrors the real supabase-js PostgrestFilterBuilder: every chainable method
 * returns the SAME builder, and the builder itself is thenable (awaitable at
 * ANY point in the chain) — so this mock resolves correctly whether the real
 * code awaits `.order(...)` directly (today) or awaits after appending
 * `.range()`/`.limit()` (post-fix), without coupling the test to one exact
 * call order.
 */
function mockGetAllChain(result: { data: unknown[]; count: number | null }) {
  const eq = vi.fn();
  const range = vi.fn();
  const limit = vi.fn();
  const order = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(),
    is: vi.fn(),
    eq,
    or: vi.fn(),
    order,
    range,
    limit,
    then: (resolve: (v: { data: unknown[]; count: number | null; error: null }) => void) =>
      resolve({ data: result.data, count: result.count, error: null }),
  };
  chain.select.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  eq.mockReturnValue(chain);
  chain.or.mockReturnValue(chain);
  order.mockReturnValue(chain);
  range.mockReturnValue(chain);
  limit.mockReturnValue(chain);
  return { chain, eq, order, range, limit };
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("families.getAll — pagination contract (MYT-80-ATL04)", () => {
  it("applies a bounded default cap (.range()/.limit()) instead of fetching the entire table", async () => {
    const { chain, range, limit } = mockGetAllChain({ data: [], count: 0 });
    fromMock.mockReturnValueOnce(chain);

    const caller = crudRouter.createCaller(ctxAdmin());
    await caller.getAll({});

    const wasCapped = range.mock.calls.length > 0 || limit.mock.calls.length > 0;
    expect(wasCapped).toBe(true);
  });

  it("forwards an explicit { limit, offset } input to a .range() call", async () => {
    const { chain, range } = mockGetAllChain({ data: [], count: 0 });
    fromMock.mockReturnValueOnce(chain);

    const caller = crudRouter.createCaller(ctxAdmin());
    // The input schema does not (yet) declare limit/offset — cast so this test
    // stays valid both before AND after the fix adds them to the Zod schema.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await caller.getAll({ limit: 10, offset: 20 } as any);

    expect(range).toHaveBeenCalledWith(20, 29);
  });

  it("returns a bare array (no `total` field) — exact count is DEFERRED-E5", async () => {
    const { chain } = mockGetAllChain({ data: [{ id: "f1" }], count: 137 });
    fromMock.mockReturnValueOnce(chain);

    const caller = crudRouter.createCaller(ctxAdmin());
    const result = await caller.getAll({});

    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown as { total?: number }).total).toBeUndefined();
  });
});
