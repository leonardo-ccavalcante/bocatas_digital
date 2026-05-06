import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import {
  protectedProcedure,
  router,
  superadminProcedure,
} from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import type { User } from "../../drizzle/schema";
import { Logger } from "../_core/logger";

/**
 * A.6.1 Session/JWT contract test.
 *
 * The JWT-validating layer (sdk.authenticateRequest, called from createContext)
 * resolves `ctx.user` to a User on a valid JWT, or to null on a missing /
 * expired / unverifiable JWT. The middleware exported from server/_core/trpc.ts
 * reads ctx.user directly.
 *
 * These tests pin the contract: missing/expired JWT (ctx.user === null) yields
 * UNAUTHORIZED; an authenticated voluntario (role !== 'superadmin') hitting a
 * superadmin-gated procedure yields FORBIDDEN.
 *
 * We mount the real exported procedures on a minimal in-test router, so we
 * exercise the actual middleware logic without invoking any DB or Supabase
 * client. The supabase auth helper is mocked implicitly: we set ctx.user to
 * the value that helper would have produced after JWT decoding.
 */

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const testRouter = router({
  protectedPing: protectedProcedure.query(() => "pong" as const),
  superadminPing: superadminProcedure.query(() => "pong" as const),
});

function buildContext(user: User | null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    logger: new Logger(),
    correlationId: "test-correlation-id",
  };
}

function buildUser(role: AuthenticatedUser["role"]): AuthenticatedUser {
  return {
    id: 42,
    openId: "voluntario-fixture",
    email: "voluntario@example.com",
    name: "Voluntario Fixture",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

describe("auth.session-jwt contract", () => {
  describe("missing JWT (ctx.user === null)", () => {
    it("protectedProcedure throws UNAUTHORIZED", async () => {
      const ctx = buildContext(null);
      const caller = testRouter.createCaller(ctx);

      try {
        await caller.protectedPing();
        expect.fail("Expected UNAUTHORIZED to be thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        const trpcErr = err as TRPCError;
        expect(trpcErr.code).toBe("UNAUTHORIZED");
        expect(trpcErr.message).toBe(UNAUTHED_ERR_MSG);
      }
    });

    it("superadminProcedure throws FORBIDDEN (no user => denied)", async () => {
      // Note: the superadmin middleware checks role independently and throws
      // FORBIDDEN when ctx.user is missing. This pins that behavior.
      const ctx = buildContext(null);
      const caller = testRouter.createCaller(ctx);

      try {
        await caller.superadminPing();
        expect.fail("Expected FORBIDDEN to be thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        expect((err as TRPCError).code).toBe("FORBIDDEN");
      }
    });
  });

  describe("expired JWT (helper resolves to null)", () => {
    it("protectedProcedure throws UNAUTHORIZED", async () => {
      // An expired token is indistinguishable from a missing token at the
      // middleware layer: the JWT helper fails verification and resolves user
      // to null. Pin that this still yields UNAUTHORIZED.
      const ctx = buildContext(null);
      const caller = testRouter.createCaller(ctx);

      await expect(caller.protectedPing()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: UNAUTHED_ERR_MSG,
      });
    });
  });

  describe("valid voluntario JWT (role !== superadmin)", () => {
    it("superadminProcedure throws FORBIDDEN", async () => {
      const voluntario = buildUser("voluntario");
      const ctx = buildContext(voluntario);
      const caller = testRouter.createCaller(ctx);

      try {
        await caller.superadminPing();
        expect.fail("Expected FORBIDDEN to be thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError);
        const trpcErr = err as TRPCError;
        expect(trpcErr.code).toBe("FORBIDDEN");
        expect(trpcErr.message).toBe("Superadmin access required");
        // Sanity: it's NOT the admin-procedure error message (different gate).
        expect(trpcErr.message).not.toBe(NOT_ADMIN_ERR_MSG);
      }
    });

    it("protectedProcedure resolves successfully for an authenticated voluntario", async () => {
      const voluntario = buildUser("voluntario");
      const ctx = buildContext(voluntario);
      const caller = testRouter.createCaller(ctx);

      const result = await caller.protectedPing();
      expect(result).toBe("pong");
    });
  });

  describe("valid superadmin JWT", () => {
    it("superadminProcedure resolves successfully", async () => {
      const superadmin = buildUser("superadmin");
      const ctx = buildContext(superadmin);
      const caller = testRouter.createCaller(ctx);

      const result = await caller.superadminPing();
      expect(result).toBe("pong");
    });
  });
});
