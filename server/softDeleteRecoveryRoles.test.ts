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
 * DB-free: all tests hit the FORBIDDEN gate before any Supabase call is made.
 * Tests that reach the DB (admin/superadmin) are expected to fail with
 * INTERNAL_SERVER_ERROR (no real DB), NOT with FORBIDDEN.
 */
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
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
