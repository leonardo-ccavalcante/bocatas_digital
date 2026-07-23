/**
 * rbac-guards.hardening.test.ts — Real caller-level proof of the 2026-07-07
 * RBAC hardening (protectedProcedure → voluntario/admin sweep + P1-7 filter fix).
 *
 * Unlike rbac-consistency.test.ts (which inlines the predicate), these tests
 * drive the ACTUAL routers via `createCaller`, so they catch a regression that
 * loosens a guard or reintroduces the dead `role === "user"` filter. The
 * Supabase client is mocked so no live DB is needed — the guard middleware runs
 * before the resolver, and for the pass cases we observe the query it builds.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";
import type { User } from "../../../drizzle/schema";
// Static imports: vitest hoists the vi.mock below above these, so the routers
// load with the mocked Supabase client — and the module graph loads during
// collect (not inside a 5s test-timeout window, which flaked under load).
import { entregasRouter } from "../entregas";
import { programsRouter } from "../programs";

// Records every .eq(col, val) the resolver issues — used to assert the
// volunteer_can_access filter is (or isn't) applied per role.
const eqCalls: Array<[string, unknown]> = [];

vi.mock("../../../client/src/lib/supabase/server", () => {
  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return chain;
    },
    order: () => chain,
    is: () => chain,
    range: () => chain,
    gte: () => chain,
    lte: () => chain,
    single: async () => ({ data: {}, error: null }),
    maybeSingle: async () => ({ data: {}, error: null }),
    // Thenable: `await query` resolves to an empty, error-free result set.
    then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 }),
  };
  return { createAdminClient: () => ({ from: () => chain }) };
});

function buildUser(role: User["role"]): User {
  return {
    id: 42,
    openId: "manus-openid",
    email: "u@example.com",
    name: "Fixture",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function buildContext(user: User | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    logger: new Logger(),
    correlationId: "test-correlation-id",
  };
}

describe("RBAC hardening — voluntarioProcedure floor on entregas", () => {
  it("rejects the base 'beneficiario' role with FORBIDDEN", async () => {
    const caller = entregasRouter.createCaller(buildContext(buildUser("beneficiario")));
    await expect(caller.getDeliveries({ limit: 10, offset: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects the raw default 'user' role with FORBIDDEN", async () => {
    const caller = entregasRouter.createCaller(buildContext(buildUser("user")));
    await expect(caller.getDeliveries({ limit: 10, offset: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admits a real 'voluntario'", async () => {
    const caller = entregasRouter.createCaller(buildContext(buildUser("voluntario")));
    await expect(caller.getDeliveries({ limit: 10, offset: 0 })).resolves.toMatchObject({ success: true });
  });
});

describe("RBAC hardening — adminProcedure floor on programs writes/config", () => {
  it("programs.getBySlug rejects a 'voluntario' with FORBIDDEN", async () => {
    const caller = programsRouter.createCaller(buildContext(buildUser("voluntario")));
    await expect(caller.getBySlug({ slug: "comedor" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("programs.getBySlug admits an 'admin'", async () => {
    const caller = programsRouter.createCaller(buildContext(buildUser("admin")));
    await expect(caller.getBySlug({ slug: "comedor" })).resolves.toBeDefined();
  });
});

describe("RBAC hardening — programs.getAll P1-7 filter fix", () => {
  beforeEach(() => {
    eqCalls.length = 0;
  });

  it("applies the volunteer_can_access filter for a real 'voluntario' (was dead before)", async () => {
    const caller = programsRouter.createCaller(buildContext(buildUser("voluntario")));
    await caller.getAll();
    expect(eqCalls).toContainEqual(["volunteer_can_access", true]);
  });

  it("does NOT filter for 'admin' (admins see every active program)", async () => {
    const caller = programsRouter.createCaller(buildContext(buildUser("admin")));
    await caller.getAll();
    expect(eqCalls).not.toContainEqual(["volunteer_can_access", true]);
  });
});
