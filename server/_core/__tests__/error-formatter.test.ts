/**
 * Boundary test for the tRPC errorFormatter (THE-01 / SIS-02 / CAS-03 / ARG-12).
 *
 * ~107 router sites interpolate raw Supabase/Postgres error text into a
 * TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `...${error.message}` }).
 * Without an errorFormatter, tRPC serializes TRPCError.message verbatim to the
 * client JSON — leaking schema internals and sometimes column VALUES (= PII).
 *
 * The fix is a single boundary: an errorFormatter in trpc.ts that, for
 * server-fault errors (INTERNAL_SERVER_ERROR), REPLACES the client-facing
 * message with a generic Spanish message + correlationId, while PRESERVING
 * intentional client-error messages (BAD_REQUEST / CONFLICT / NOT_FOUND /
 * UNAUTHORIZED / FORBIDDEN / TOO_MANY_REQUESTS).
 *
 * These tests run the REAL serialization path: a procedure throws a TRPCError,
 * we capture it via createCaller, then feed it through getErrorShape() with the
 * router's own config — exactly what the express adapter does when producing
 * the client response. We assert on the resulting `shape.message`, which is the
 * string the client actually receives.
 */
import { GENERIC_SERVER_ERROR_MSG } from "@shared/const";
import { getErrorShape, TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { TrpcContext } from "../context";
import { Logger } from "../logger";
import { publicProcedure, router } from "../trpc";

// A raw DB-ish message that must NEVER reach the client. Mimics the kind of
// text Supabase/Postgres puts in error.message — schema internals + a value
// that could be PII.
const RAW_DB_LEAK =
  'duplicate key value violates unique constraint "persons_telefono_key" DETAIL: Key (telefono)=(+34600111222) already exists.';

// An intentional, user-facing client-error message that MUST be preserved.
const INTENTIONAL_CLIENT_MSG = "Esta persona ya es titular de una familia activa";

const CORRELATION_ID = "00000000-0000-4000-8000-000000000000";

function makeCtx(): TrpcContext {
  return {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: null,
    logger: new Logger(),
    correlationId: CORRELATION_ID,
  };
}

// Tiny router built from the SAME configured procedure/router as the real app,
// so it inherits the real errorFormatter under test.
const testRouter = router({
  leaks: publicProcedure.query(() => {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Error al obtener persona: ${RAW_DB_LEAK}`,
    });
  }),
  intentional: publicProcedure.query(() => {
    throw new TRPCError({ code: "BAD_REQUEST", message: INTENTIONAL_CLIENT_MSG });
  }),
  rawThrow: publicProcedure.query(() => {
    // A non-TRPCError thrown anywhere in a resolver becomes an
    // INTERNAL_SERVER_ERROR with the raw message as its message.
    throw new Error(RAW_DB_LEAK);
  }),
});

/**
 * Serialize the error the way the HTTP boundary does: capture the thrown
 * TRPCError, then run it through getErrorShape with the router's config (which
 * carries our errorFormatter). Returns the client-facing shape.
 */
async function callAndFormat(
  proc: "leaks" | "intentional" | "rawThrow",
): Promise<{ message: string; data: { code: string } }> {
  const ctx = makeCtx();
  const caller = testRouter.createCaller(ctx);
  let thrown: unknown;
  try {
    await caller[proc]();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(TRPCError);
  const shape = getErrorShape({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: (testRouter as any)._def._config,
    error: thrown as TRPCError,
    type: "query",
    path: proc,
    input: undefined,
    ctx,
  });
  return shape as { message: string; data: { code: string } };
}

describe("tRPC errorFormatter — PII / schema-leak boundary", () => {
  it("scrubs the raw DB message from an INTERNAL_SERVER_ERROR client response", async () => {
    const shape = await callAndFormat("leaks");

    expect(shape.data.code).toBe("INTERNAL_SERVER_ERROR");
    // The client must NOT receive the raw DB text or the PII value inside it.
    expect(shape.message).not.toContain(RAW_DB_LEAK);
    expect(shape.message).not.toContain("+34600111222");
    expect(shape.message).not.toContain("persons_telefono_key");
    // It must receive the generic Spanish message instead.
    expect(shape.message).toContain(GENERIC_SERVER_ERROR_MSG);
    // ...with the correlationId so support can find the real error in the logs.
    expect(shape.message).toContain(CORRELATION_ID);
  });

  it("scrubs a raw non-TRPCError thrown in a resolver (mapped to INTERNAL_SERVER_ERROR)", async () => {
    const shape = await callAndFormat("rawThrow");

    expect(shape.data.code).toBe("INTERNAL_SERVER_ERROR");
    expect(shape.message).not.toContain(RAW_DB_LEAK);
    expect(shape.message).not.toContain("+34600111222");
    expect(shape.message).toContain(GENERIC_SERVER_ERROR_MSG);
  });

  it("PRESERVES an intentional BAD_REQUEST client-error message", async () => {
    const shape = await callAndFormat("intentional");

    expect(shape.data.code).toBe("BAD_REQUEST");
    expect(shape.message).toBe(INTENTIONAL_CLIENT_MSG);
  });
});
