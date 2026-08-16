/**
 * programs.superadmin-gate.test.ts
 *
 * Verifies that programs.update and programs.deactivate are restricted to
 * superadmin only. An admin (not superadmin) must receive FORBIDDEN.
 */
import { describe, it, expect, vi } from "vitest";
import { initTRPC } from "@trpc/server";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

// Mock Supabase — never reached because the gate fires first
vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: () => ({}) })),
}));

const { programsRouter } = await import("../programs");

const t = initTRPC.context<TrpcContext>().create({
  transformer: { serialize: (v: unknown) => v, deserialize: (v: unknown) => v },
});
const createCaller = t.createCallerFactory(programsRouter);

function makeCtx(role: "admin" | "superadmin"): TrpcContext {
  return {
    user: {
      id: "test-user-1",
      openId: "test-open-id",
      name: "Test User",
      email: "test@test.com",
      role,
      loginMethod: "google",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "test",
    req: {} as never,
    res: {} as never,
  };
}

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("programs — superadmin gate", () => {
  describe("programs.update", () => {
    it("FORBIDDEN when caller is admin (not superadmin)", async () => {
      const caller = createCaller(makeCtx("admin"));
      await expect(
        caller.update({ id: VALID_UUID, data: { name: "New Name" } })
      ).rejects.toThrow(/FORBIDDEN|Superadmin/i);
    });

    it("does NOT throw FORBIDDEN when caller is superadmin", async () => {
      const caller = createCaller(makeCtx("superadmin"));
      // Supabase is mocked to return null — we only care that the gate passes
      await expect(
        caller.update({ id: VALID_UUID, data: { name: "New Name" } })
      ).rejects.not.toThrow(/FORBIDDEN|Superadmin/i);
    });
  });

  describe("programs.deactivate", () => {
    it("FORBIDDEN when caller is admin (not superadmin)", async () => {
      const caller = createCaller(makeCtx("admin"));
      await expect(
        caller.deactivate({ id: VALID_UUID })
      ).rejects.toThrow(/FORBIDDEN|Superadmin/i);
    });

    it("does NOT throw FORBIDDEN when caller is superadmin", async () => {
      const caller = createCaller(makeCtx("superadmin"));
      await expect(
        caller.deactivate({ id: VALID_UUID })
      ).rejects.not.toThrow(/FORBIDDEN|Superadmin/i);
    });
  });
});
