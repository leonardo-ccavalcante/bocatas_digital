/**
 * tRPC logging middleware for structured request/response logging
 * with correlation IDs and performance tracking
 */

import { TrpcContext } from "./context";
import { redactLogValue } from "./logger";

export interface LoggingOptions {
  logInputs?: boolean;
  logOutputs?: boolean;
  logErrors?: boolean;
}

/**
 * Create a logging middleware for tRPC procedures
 * Logs procedure calls with correlation ID, duration, and results
 */
export function createLoggingMiddleware(options: LoggingOptions = {}) {
  const { logInputs = true, logOutputs = true, logErrors = true } = options;

  return async function loggingMiddleware<T>({
    ctx,
    type,
    path,
    input,
    next,
  }: {
    ctx: TrpcContext;
    type: "query" | "mutation" | "subscription";
    path: string;
    input: unknown;
    next: () => Promise<T>;
  }): Promise<T> {
    const startTime = Date.now();
    const { logger, correlationId, user } = ctx;

    // Log procedure start
    if (logInputs) {
      logger.info(`[${type.toUpperCase()}] ${path} started`, {
        correlationId,
        userId: user?.id,
        type,
        path,
        input: input ? JSON.stringify(redactLogValue(input)).slice(0, 200) : undefined,
      });
    }

    try {
      const result = await next();
      const duration = Date.now() - startTime;

      // Log procedure success
      if (logOutputs) {
        logger.info(`[${type.toUpperCase()}] ${path} completed`, {
          correlationId,
          userId: user?.id,
          type,
          path,
          duration,
          success: true,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log procedure error
      if (logErrors) {
        logger.error(`[${type.toUpperCase()}] ${path} failed`, {
          correlationId,
          userId: user?.id,
          type,
          path,
          duration,
          error: error instanceof Error ? error : new Error(String(error)),
          success: false,
        });
      }

      throw error;
    }
  };
}

/**
 * Procedure-level logging helper
 * Use in individual procedures for custom logging
 */
export function logProcedureAction(
  ctx: TrpcContext,
  action: string,
  metadata?: Record<string, any>
): void {
  const { logger, correlationId, user } = ctx;

  logger.info(action, {
    correlationId,
    userId: user?.id,
    ...metadata,
  });
}

/**
 * Procedure-level error logging helper
 */
export function logProcedureError(
  ctx: TrpcContext,
  action: string,
  error: Error,
  metadata?: Record<string, any>
): void {
  const { logger, correlationId, user } = ctx;

  logger.error(action, {
    correlationId,
    userId: user?.id,
    error,
    ...metadata,
  });
}

/**
 * PII-SAFE correlation log to stderr (`console.error`).
 *
 * Why this exists (cassandra follow-up): `logProcedureError` writes the raw
 * error into `ctx.logger` — a fresh `new Logger()` per request whose in-memory
 * ring buffer NOTHING reads (the admin LogsPage reads `globalLogger`, a
 * different instance). So the raw error was silently dropped and the
 * correlationId shown to users pointed at nothing. This helper restores
 * correlation by emitting a single structured line to stderr that ops can grep
 * by correlationId.
 *
 * PII-SAFETY (CLAUDE.md §Compliance "No PII in logs"): we do NOT log
 * `error.message` / Postgres DETAIL — those can carry phone numbers, names, and
 * other column VALUES. We log only safe structured fields: correlationId,
 * route/path, type, Postgres error CODE (if present), and `error.name`.
 *
 * Do NOT route raw errors into `globalLogger`/`ctx.logger` — the admin LogsPage
 * is user-exposed.
 */
export function logCorrelatedErrorToStderr(fields: {
  correlationId?: string;
  path?: string;
  type?: string;
  error: unknown;
}): void {
  const { correlationId, path, type, error } = fields;
  const rawCode =
    error && typeof error === "object" && "code" in error
      ? (error as { code?: unknown }).code
      : (error as { cause?: { code?: unknown } } | undefined)?.cause?.code;
  // Only surface a real Postgres SQLSTATE (5-char alphanumeric, e.g. "23505").
  // This deliberately excludes tRPC codes like "INTERNAL_SERVER_ERROR" — they
  // are not Postgres codes and would be misleading under `pgCode`.
  const pgCode =
    typeof rawCode === "string" && /^[0-9A-Z]{5}$/.test(rawCode)
      ? rawCode
      : undefined;

  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      level: "error",
      msg: "procedure-error",
      timestamp: new Date().toISOString(),
      correlationId,
      path,
      type,
      // Postgres SQLSTATE (e.g. "23505") — safe, no PII.
      pgCode,
      errorName: error instanceof Error ? error.name : typeof error,
    })
  );
}

/**
 * Procedure-level audit log helper — for compliance-relevant admin actions
 * (role assignment, account creation, account revocation, etc).
 *
 * Caller MUST NOT include PII fields in metadata — use stable IDs instead.
 * See CLAUDE.md §Compliance ("No PII in logs or error messages").
 */
export function logAudit(
  ctx: TrpcContext,
  action: string,
  metadata?: Record<string, any>
): void {
  const { logger, correlationId, user } = ctx;

  logger.audit(action, {
    correlationId,
    actorId: user?.id ?? "unknown",
    ...metadata,
  });
}
