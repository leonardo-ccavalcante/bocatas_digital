/**
 * softDeleteRecoveryRoles.test.ts
 *
 * Unit tests that verify the role-gate fixes applied in fix/informe-tier1-hardening:
 *
 *   1. admin.softDelete.* now admits BOTH admin and superadmin (was broken:
 *      the local adminProcedure in soft-delete-recovery.ts only allowed admin).
 *   2. persons.create admits voluntario, admin, and superadmin, and rejects
 *      beneficiario and unauthenticated callers.
 *
 * DB-free: Supabase is mocked (see vi.mock below). admin/superadmin pass the
 * role gate and resolve instantly against the stub; voluntario/unauthenticated
 * are rejected at the FORBIDDEN gate before any (mocked) Supabase call. Mocking
 * is required so these tests don't make a real network call (and time out) when
 * SUPABASE_* env is present, e.g. in CI.
 */
import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

// Stub Supabase so role-gate tests never hit the network (env-independent).
// soft-delete-recovery.ts calls createClient() directly from @supabase/supabase-js
// (not the app's createAdminClient wrapper), so we mock the library itself. This
// also covers persons.create's createAdminClient path (it wraps createClient).
vi.mock("@supabase/supabase-js", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    for (const m of [
      "select", "insert", "update", "upsert", "delete", "eq", "neq", "is",
      "in", "or", "not", "gte", "lte", "order", "limit", "range",
    ]) {
      chain[m] = () => chain;
    }
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
    chain.single = () => Promise.resolve({ data: null, error: null });
    chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
    return chain;
  };
  const client = { from: () => makeChain() };
  return { createClient: () => client };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { Logger } from "./_core/logger";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(role: AuthenticatedUser["role"]): TrpcContext {
  const user: AuthenticatedUser = {
    id: 99,
    openId: `test-${role}-open-id`,
    email: `${role}@bocatas.org`,
    name: `Test ${role}`,
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "test-cid",
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function makeAnonCtx(): TrpcContext {
  return {
    user: null,
    logger: new Logger(),
    correlationId: "test-cid",
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

/**
 * Helper: a call that passes the role gate will reach the DB and fail with
 * INTERNAL_SERVER_ERROR. A call that does NOT pass the gate fails with FORBIDDEN.
 * This assertion ensures the error is NOT FORBIDDEN.
 */
async function expectPassesRoleGate(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).not.toBe("FORBIDDEN");
  }
}

async function expectForbidden(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code: "FORBIDDEN" });
}

// ---------------------------------------------------------------------------
// Fix 1 — soft-delete-recovery: admin AND superadmin must be admitted
// ---------------------------------------------------------------------------

describe("admin.softDelete role gate — Fix 1", () => {
  const SAMPLE_UUID = "550e8400-e29b-41d4-a716-446655440000";

  describe("listDeletedFamilies", () => {
    it("admits admin", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      await expectPassesRoleGate(caller.admin.softDelete.listDeletedFamilies({}));
    });

    it("admits superadmin", async () => {
      const caller = appRouter.createCaller(makeCtx("superadmin"));
      await expectPassesRoleGate(caller.admin.softDelete.listDeletedFamilies({}));
    });

    it("rejects voluntario", async () => {
      const caller = appRouter.createCaller(makeCtx("voluntario"));
      await expectForbidden(caller.admin.softDelete.listDeletedFamilies({}));
    });

    it("rejects unauthenticated", async () => {
      const caller = appRouter.createCaller(makeAnonCtx());
      await expectForbidden(caller.admin.softDelete.listDeletedFamilies({}));
    });
  });

  describe("listDeletedPersons", () => {
    it("admits admin", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      await expectPassesRoleGate(caller.admin.softDelete.listDeletedPersons({}));
    });

    it("admits superadmin", async () => {
      const caller = appRouter.createCaller(makeCtx("superadmin"));
      await expectPassesRoleGate(caller.admin.softDelete.listDeletedPersons({}));
    });

    it("rejects voluntario", async () => {
      const caller = appRouter.createCaller(makeCtx("voluntario"));
      await expectForbidden(caller.admin.softDelete.listDeletedPersons({}));
    });
  });

  describe("restoreFamily", () => {
    it("admits admin", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      await expectPassesRoleGate(
        caller.admin.softDelete.restoreFamily({ familyId: SAMPLE_UUID })
      );
    });

    it("admits superadmin", async () => {
      const caller = appRouter.createCaller(makeCtx("superadmin"));
      await expectPassesRoleGate(
        caller.admin.softDelete.restoreFamily({ familyId: SAMPLE_UUID })
      );
    });

    it("rejects voluntario", async () => {
      const caller = appRouter.createCaller(makeCtx("voluntario"));
      await expectForbidden(
        caller.admin.softDelete.restoreFamily({ familyId: SAMPLE_UUID })
      );
    });
  });

  describe("restorePerson", () => {
    it("admits admin", async () => {
      const caller = appRouter.createCaller(makeCtx("admin"));
      await expectPassesRoleGate(
        caller.admin.softDelete.restorePerson({ personId: SAMPLE_UUID })
      );
    });

    it("admits superadmin", async () => {
      const caller = appRouter.createCaller(makeCtx("superadmin"));
      await expectPassesRoleGate(
        caller.admin.softDelete.restorePerson({ personId: SAMPLE_UUID })
      );
    });

    it("rejects voluntario", async () => {
      const caller = appRouter.createCaller(makeCtx("voluntario"));
      await expectForbidden(
        caller.admin.softDelete.restorePerson({ personId: SAMPLE_UUID })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Fix 2 — persons.create: voluntarioProcedure (voluntario, admin, superadmin)
// ---------------------------------------------------------------------------

const VALID_PERSON_INPUT = {
  canal_llegada: "boca_a_boca" as const,
  nombre: "Ana",
  apellidos: "Pérez García",
  fecha_nacimiento: "1985-03-15",
  idioma_principal: "es" as const,
  program_ids: [],
};

describe("persons.create role gate — Fix 2", () => {
  it("admits voluntario (reaches DB, not FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(makeCtx("voluntario"));
    await expectPassesRoleGate(caller.persons.create(VALID_PERSON_INPUT));
  });

  it("admits admin (reaches DB, not FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expectPassesRoleGate(caller.persons.create(VALID_PERSON_INPUT));
  });

  it("admits superadmin (reaches DB, not FORBIDDEN)", async () => {
    const caller = appRouter.createCaller(makeCtx("superadmin"));
    await expectPassesRoleGate(caller.persons.create(VALID_PERSON_INPUT));
  });

  it("rejects beneficiario with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("beneficiario"));
    await expectForbidden(caller.persons.create(VALID_PERSON_INPUT));
  });

  it("rejects unauthenticated with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expectForbidden(caller.persons.create(VALID_PERSON_INPUT));
  });
});
