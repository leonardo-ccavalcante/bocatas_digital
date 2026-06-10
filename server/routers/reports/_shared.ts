/**
 * server/routers/reports/_shared.ts — DX-T2: shared helpers for all report procedures.
 *
 * Exports:
 *   withSoftDeleteFilter(q) — applies .is("deleted_at", null) to any query builder.
 *     Every templated query MUST go through this helper. Prevents the 1-of-9
 *     soft-delete leak flagged in the eng review.
 *
 *   wrapDbError(procedureName, error) — wraps a Supabase error into a TRPCError.
 *     Includes procedureName + correlationId context; NEVER includes raw input or PII.
 *     All DB error paths in this router family use this helper (DX-T2 requirement).
 *
 *   logAuditReport(ctx, reportKey, rowCount, params) — RGPD Art. 30 audit trail for
 *     templated report procedures. Records report name, row count, and non-PII input
 *     params. MUST NOT include PII values (names, phone numbers, document numbers).
 *     All 10 templated procedures call this helper after a successful DB fetch.
 */

import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { logAudit } from "../../_core/logging-middleware";
import type { TrpcContext } from "../../_core/context";

// ─── logAuditReport ──────────────────────────────────────────────────────────

/**
 * RGPD Art. 30 audit trail for templated report procedures.
 *
 * Records: report key, row count returned, and any non-PII input params
 * (e.g. year, quarter, daysAhead, dateRange).
 *
 * Compliance (CLAUDE.md §3):
 *   - NEVER pass PII values (names, phone numbers, document numbers, emails).
 *   - Only pass stable, non-identifying params: numeric years, date ranges,
 *     UUID program IDs, boolean flags, row counts.
 *
 * @param ctx       — tRPC context (carries actorId + correlationId)
 * @param reportKey — stable identifier, e.g. "reports.familiasAtendidas"
 * @param rowCount  — number of rows returned by the procedure
 * @param params    — non-PII input params (year, filters, dateRange, etc.)
 */
export function logAuditReport(
  ctx: TrpcContext,
  reportKey: string,
  rowCount: number,
  params?: Record<string, unknown>,
): void {
  logAudit(ctx, reportKey, {
    rowCount,
    ...(params !== undefined ? { params } : {}),
  });
}

// ─── withSoftDeleteFilter ────────────────────────────────────────────────────

/**
 * Applies `.is("deleted_at", null)` to a Supabase query builder.
 *
 * Call signature is generic so the TypeScript types of the query builder
 * chain are preserved (the `.is()` method returns the same builder type).
 *
 * Usage:
 *   const { data, error } = await withSoftDeleteFilter(
 *     db.from("families").select("id, estado").eq("estado", "activa")
 *   );
 */
export function withSoftDeleteFilter<
  T extends { is: (column: string, value: null) => T },
>(q: T): T {
  return q.is("deleted_at", null);
}

// ─── wrapDbError ─────────────────────────────────────────────────────────────

/**
 * Wraps a Supabase error into a TRPCError with structured context.
 *
 * Compliance (CLAUDE.md §3):
 *   - NEVER include raw input values in the message (PII risk).
 *   - NEVER include document numbers, names, or phone numbers.
 *   - Include procedureName so on-call can locate the failing procedure.
 *   - Include a correlationId for log correlation (not the request's correlationId
 *     since we don't have ctx here — callers that have ctx should log first).
 *
 * @param procedureName — stable identifier, e.g. "reports.familiasAtendidas"
 * @param error — the raw Supabase error object
 */
export function wrapDbError(
  procedureName: string,
  error: { message: string; code?: string },
): TRPCError {
  const correlationId = randomUUID();
  // Raw Supabase messages can echo column VALUES (PII) and schema internals,
  // so they NEVER reach the client. Log the raw detail server-side, keyed by
  // correlationId; return a generic client message carrying only that id.
  console.error(
    `[${procedureName}] DB error ${correlationId}: ${error.code ?? "?"} ${error.message}`,
  );
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `Error interno del servidor (${correlationId}). Inténtalo de nuevo.`,
  });
}
