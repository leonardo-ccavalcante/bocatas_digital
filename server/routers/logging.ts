/**
 * Logging router - admin-only endpoints for viewing system logs
 * Provides access to correlation-tracked logs for debugging and monitoring
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { globalLogger } from "../_core/logger";

export const loggingRouter = router({
  /**
   * Get all logs (admin only)
   */
  getLogs: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(1000).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(({ input }) => {
      const allLogs = globalLogger.getLogs();
      const paginated = allLogs.slice(input.offset, input.offset + input.limit);

      return {
        logs: paginated,
        total: allLogs.length,
        offset: input.offset,
        limit: input.limit,
      };
    }),

  /**
   * Get logs by correlation ID (admin only)
   */
  getLogsByCorrelationId: adminProcedure
    .input(
      z.object({
        correlationId: z.string().uuid(),
      })
    )
    .query(({ input }) => {
      const logs = globalLogger.getLogsByCorrelationId(input.correlationId);

      return {
        logs,
        total: logs.length,
        correlationId: input.correlationId,
      };
    }),

  /**
   * Get logs by level (admin only)
   */
  getLogsByLevel: adminProcedure
    .input(
      z.object({
        level: z.enum(["debug", "info", "warn", "error"]),
        limit: z.number().min(1).max(1000).default(100),
      })
    )
    .query(({ input }) => {
      const logs = globalLogger.getLogsByLevel(input.level);
      const paginated = logs.slice(-input.limit);

      return {
        logs: paginated,
        total: logs.length,
        level: input.level,
      };
    }),

  /**
   * Get error logs (admin only)
   */
  getErrorLogs: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(500).default(50),
      })
    )
    .query(() => {
      const errorLogs = globalLogger.getLogsByLevel("error");
      const recent = errorLogs.slice(-50);

      return {
        logs: recent,
        total: errorLogs.length,
      };
    }),

  /**
   * Clear all logs (admin only, use with caution)
   */
  clearLogs: adminProcedure.mutation(({ ctx }) => {
    ctx.logger.warn("Logs cleared by admin", {
      correlationId: ctx.correlationId,
      userId: ctx.user?.id,
      action: "clear_logs",
    });

    globalLogger.clear();

    return {
      success: true,
      message: "All logs cleared",
    };
  }),

  /**
   * Export logs as JSON (admin only)
   */
  exportLogs: adminProcedure
    .input(
      z.object({
        level: z.enum(["debug", "info", "warn", "error"]).optional(),
        limit: z.number().min(1).max(10000).default(1000),
      })
    )
    .query(({ input }) => {
      let logs = globalLogger.getLogs();

      if (input.level) {
        logs = logs.filter(log => log.level === input.level);
      }

      const exported = logs.slice(-input.limit);

      return {
        logs: exported,
        total: exported.length,
        exportedAt: new Date().toISOString(),
        format: "json",
      };
    }),

  /**
   * Get log statistics (admin only)
   */
  getStats: adminProcedure.query(() => {
    const allLogs = globalLogger.getLogs();

    const stats = {
      total: allLogs.length,
      byLevel: {
        debug: allLogs.filter(l => l.level === "debug").length,
        info: allLogs.filter(l => l.level === "info").length,
        warn: allLogs.filter(l => l.level === "warn").length,
        error: allLogs.filter(l => l.level === "error").length,
      },
      uniqueCorrelationIds: new Set(
        allLogs.map(l => l.correlationId).filter(Boolean)
      ).size,
      uniqueUsers: new Set(allLogs.map(l => l.userId).filter(Boolean)).size,
      oldestLog: allLogs[0]?.timestamp,
      newestLog: allLogs[allLogs.length - 1]?.timestamp,
    };

    return stats;
  }),
});
