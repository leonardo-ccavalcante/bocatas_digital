/**
 * crud.test.ts — families.getAll filter contract.
 *
 * Phase 2 wires a Mapa → Familias deep-link (`?tab=familias&distrito=<slug>`).
 * The client parses `distrito` from the URL and forwards it to
 * `families.getAll`; the server must accept it and add a distrito equality
 * constraint to the query. Without this, clicking a distrito on the map
 * silently returns the unfiltered list.
 *
 * These tests assert the observable filtering behaviour through the public
 * procedure caller, using the chainable-Supabase mock idiom from
 * server/__tests__/mapa-router.test.ts.
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

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxWithRole(role: AuthenticatedUser["role"]): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: `${role}@bocatas.org`,
    name: role,
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "families-crud-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// getAll calls: from().select().is().[eq()...].order(). The terminus is
// .order(), which the router awaits — so it resolves the result. eq() is
// chainable and records its arguments so we can assert the distrito filter.
function mockGetAllChain() {
  const eq = vi.fn().mockReturnThis();
  const chain = {
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    eq,
    or: vi.fn().mockReturnThis(),
    order: vi.fn(() => Promise.resolve({ data: [], error: null })),
  };
  return { chain, eq };
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("families.getAll — distrito filter", () => {
  it("applies a distrito equality constraint when distrito is provided", async () => {
    const { chain, eq } = mockGetAllChain();
    fromMock.mockReturnValueOnce(chain);

    const caller = crudRouter.createCaller(ctxWithRole("admin"));
    await caller.getAll({ distrito: "centro" });

    expect(eq).toHaveBeenCalledWith("distrito", "centro");
  });

  it("does not constrain by distrito when it is omitted", async () => {
    const { chain, eq } = mockGetAllChain();
    fromMock.mockReturnValueOnce(chain);

    const caller = crudRouter.createCaller(ctxWithRole("admin"));
    await caller.getAll({});

    const distritoCall = eq.mock.calls.find(([col]) => col === "distrito");
    expect(distritoCall).toBeUndefined();
  });
});
