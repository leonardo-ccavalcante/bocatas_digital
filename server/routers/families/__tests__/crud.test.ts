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

// getById calls: from("families").select(sel).eq().is().single() then
// from("familia_miembros").select().eq().is().order(). We capture the select
// string passed to the families query so we can assert which titular PII
// columns are requested per role.
function mockGetByIdChains(family: Record<string, unknown>) {
  const selectArgs: string[] = [];
  const familiesChain = {
    select: vi.fn((sel: string) => {
      selectArgs.push(sel);
      return familiesChain;
    }),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve({ data: family, error: null })),
  };
  const miembrosChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn(() => Promise.resolve({ data: [], error: null })),
  };
  fromMock.mockImplementation((table: string) =>
    table === "families" ? familiesChain : miembrosChain
  );
  return { selectArgs };
}

describe("families.getById — titular PII minimisation", () => {
  const family = {
    id: "f1",
    familia_numero: 1,
    persons: { id: "p1", nombre: "Ana", apellidos: "García", telefono: "600", email: "a@b.es" },
  };

  it("does NOT request titular telefono/email for voluntario callers", async () => {
    const { selectArgs } = mockGetByIdChains(family);

    const caller = crudRouter.createCaller(ctxWithRole("voluntario"));
    await caller.getById({ id: "11111111-1111-1111-1111-111111111111" });

    const familiesSelect = selectArgs[0];
    expect(familiesSelect).not.toMatch(/telefono/);
    expect(familiesSelect).not.toMatch(/email/);
    expect(familiesSelect).not.toMatch(/numero_documento/);
    // The non-PII identity fields are still requested.
    expect(familiesSelect).toMatch(/nombre/);
    expect(familiesSelect).toMatch(/apellidos/);
  });

  it("requests titular telefono/email for admin callers", async () => {
    const { selectArgs } = mockGetByIdChains(family);

    const caller = crudRouter.createCaller(ctxWithRole("admin"));
    await caller.getById({ id: "11111111-1111-1111-1111-111111111111" });

    const familiesSelect = selectArgs[0];
    expect(familiesSelect).toMatch(/telefono/);
    expect(familiesSelect).toMatch(/email/);
  });

  it("rejects beneficiario callers (below voluntario)", async () => {
    mockGetByIdChains(family);
    const caller = crudRouter.createCaller(ctxWithRole("beneficiario"));
    await expect(
      caller.getById({ id: "11111111-1111-1111-1111-111111111111" })
    ).rejects.toThrow();
  });
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
