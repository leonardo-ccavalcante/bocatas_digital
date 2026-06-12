import { GENERIC_SERVER_ERROR_MSG, NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { logCorrelatedErrorToStderr } from "./logging-middleware";

/**
 * Single PII / schema-leak boundary (THE-01 / SIS-02 / CAS-03 / ARG-12).
 *
 * ~100 router sites throw `INTERNAL_SERVER_ERROR` with a message that
 * interpolates the raw Supabase/Postgres `error.message` — which can carry
 * schema internals and column VALUES (= PII). tRPC serializes
 * `TRPCError.message` verbatim to the client, so every one of those sites is a
 * leak. Rather than band-aid each call site, we scrub at the serialization
 * boundary: for server-fault errors only (`INTERNAL_SERVER_ERROR`, which also
 * covers any non-TRPCError thrown in a resolver) the client-facing message is
 * REPLACED with a generic Spanish message + correlationId, and the original is
 * logged server-side. Intentional client-error codes (BAD_REQUEST, CONFLICT,
 * NOT_FOUND, UNAUTHORIZED, FORBIDDEN, TOO_MANY_REQUESTS, …) carry deliberate,
 * user-facing messages and are passed through untouched.
 *
 * Defense in depth: this is the boundary, not a substitute for per-site
 * discipline. The formatter only scrubs THROWN `INTERNAL_SERVER_ERROR`s, so two
 * leak classes can't be fixed here and are closed at the call site instead
 * (cassandra follow-up): (1) raw `error.message` thrown under *client* codes
 * like BAD_REQUEST (e.g. entregas/crud.ts) bypasses the scrub; (2) raw
 * `error.message` RETURNED inside a 200-response payload (checkin offline-sync,
 * entregas/ocr.ts) never reaches the formatter at all. Both now return curated
 * Spanish strings and log the raw error PII-safely to stderr.
 */
const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error, ctx, path, type }) {
    // Only server-fault errors carry raw, untrusted message text. Client-error
    // codes are intentional, user-facing Spanish strings — leave them alone.
    if (error.code !== "INTERNAL_SERVER_ERROR") {
      return shape;
    }

    const correlationId = ctx?.correlationId;

    // Restore correlation: emit a PII-SAFE structured line to stderr that ops
    // can grep by correlationId. We do NOT log the raw error message/DETAIL (it
    // can carry PII), only safe fields (correlationId, path, type, Postgres
    // CODE, error.name). Routing into ctx.logger/globalLogger is wrong here:
    // ctx.logger is an unread per-request buffer, and globalLogger feeds the
    // user-exposed admin LogsPage. See logCorrelatedErrorToStderr.
    logCorrelatedErrorToStderr({
      correlationId,
      path,
      type,
      error: error.cause instanceof Error ? error.cause : error,
    });

    const clientMessage = correlationId
      ? `${GENERIC_SERVER_ERROR_MSG} (${correlationId})`
      : GENERIC_SERVER_ERROR_MSG;

    return {
      ...shape,
      message: clientMessage,
      data: {
        ...shape.data,
        // Never ship the server-side stack to the client for server faults,
        // even in development — it can contain query text / PII.
        stack: undefined,
      },
    };
  },
});

export const router = t.router;
export const mergeRouters = t.mergeRouters;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'superadmin')) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * voluntarioProcedure — allows voluntario, admin, and superadmin roles.
 * Use for read procedures that return redacted data for non-admin callers.
 */
export const voluntarioProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const ALLOWED = new Set(['voluntario', 'admin', 'superadmin']);
    if (!ctx.user || !ALLOWED.has(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: 'Acceso restringido a voluntarios y administradores' });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

export const superadminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'superadmin') {
      throw new TRPCError({ code: "FORBIDDEN", message: 'Superadmin access required' });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
