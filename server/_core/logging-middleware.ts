/**
 * tRPC logging middleware for structured request/response logging
 * with correlation IDs and performance tracking
 */

import { TrpcContext } from "./context";

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
        input: input ? JSON.stringify(input).slice(0, 200) : undefined,
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
