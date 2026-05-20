/**
 * customQuery/executor.ts — Custom-query executor with typed operator dispatch.
 *
 * Critical compliance rules (T4 eng-review):
 *   - NO `f.value as never` — uses a typed discriminated union per operator.
 *   - Input is validated by SavedQuerySpecSchema BEFORE reaching the executor.
 *   - All DB errors go through wrapDbError (DX-T2).
 *   - All DB queries go through withSoftDeleteFilter (soft-delete leak prevention).
 *   - groupBy + aggregate is executed in JS over limit-capped rows (plan §10 explicit).
 *
 * Role guard: adminProcedure — voluntarios receive FORBIDDEN.
 */

import { router, adminProcedure } from "../../../_core/trpc";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import { logAudit } from "../../../_core/logging-middleware";
import { K_ANONYMITY_FLOOR } from "../../../_core/mapaAggregation";
import { withSoftDeleteFilter, wrapDbError } from "../_shared";
import { SavedQuerySpecSchema, type ParsedFilterRow } from "./allowlist";
import { ENTITY_FIELDS, ENTITY_TO_TABLE, type ReportEntity } from "./allowlist";

/**
 * Build the SELECT projection for an entity from its allowlist.
 *
 * SECURITY (SAT Devil's Advocacy P1): the executor must NEVER `select("*")`.
 * `*` returns every column of the table — including high-risk PII
 * (situacion_legal, foto_documento_url, recorrido_migratorio on persons)
 * because createAdminClient() uses the service role and bypasses RLS.
 * Projecting only allowlisted columns makes the allowlist the single source
 * of truth for what can leave via customQuery — both INPUT (filters) and
 * OUTPUT (columns). Defense does not depend on every client remembering to
 * pass redactFields to the CSV exporter.
 */
function projectionFor(entity: ReportEntity): string {
  return ENTITY_FIELDS[entity].map((f) => f.name).join(", ");
}

// ─── Typed operator dispatch ────────────────────────────────────────────────

/**
 * Apply a single parsed filter row to a Supabase query builder.
 *
 * The discriminated union on ParsedFilterRow["operator"] allows TypeScript to
 * narrow the value type for each branch. No `as never` casts required.
 */
function applyFilter<
  Q extends {
    eq: (col: string, val: string | number | boolean) => Q;
    neq: (col: string, val: string | number | boolean) => Q;
    gt: (col: string, val: string | number | boolean) => Q;
    gte: (col: string, val: string | number | boolean) => Q;
    lt: (col: string, val: string | number | boolean) => Q;
    lte: (col: string, val: string | number | boolean) => Q;
    in: (col: string, vals: (string | number)[]) => Q;
    ilike: (col: string, pattern: string) => Q;
    is: (col: string, val: null) => Q;
  },
>(q: Q, f: ParsedFilterRow): Q {
  switch (f.operator) {
    case "eq":
      return q.eq(f.field, f.value);
    case "neq":
      return q.neq(f.field, f.value);
    case "gt":
      return q.gt(f.field, f.value);
    case "gte":
      return q.gte(f.field, f.value);
    case "lt":
      return q.lt(f.field, f.value);
    case "lte":
      return q.lte(f.field, f.value);
    case "in":
      return q.in(f.field, f.value);
    case "contains":
      return q.ilike(f.field, `%${f.value}%`);
    case "is_null":
      return q.is(f.field, null);
    case "between":
      return q.gte(f.field, f.value).lte(f.field, f.value2);
  }
}

// ─── Group + aggregate in JS (plan §10) ─────────────────────────────────────

type GroupAggRow = { group: string; value: number };

function applyGroupByAggregate(
  rows: Record<string, unknown>[],
  groupBy: string,
  aggregate: { op: "count" | "sum" | "avg" | "min" | "max"; field: string },
  // SAT P2-1: when set, groups whose bucket size is below this floor are
  // dropped entirely (not just suppressed) so no small group is even
  // disclosed by its label. Suppression keys off bucket SIZE, not the
  // aggregate value — avg/sum over a single record is just as re-identifying
  // as count=1.
  kAnonFloor?: number,
): GroupAggRow[] {
  const groups = new Map<string, Record<string, unknown>[]>();

  for (const row of rows) {
    const key = String(row[groupBy] ?? "—");
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const out: GroupAggRow[] = [];

  for (const [group, bucket] of groups) {
    if (kAnonFloor !== undefined && bucket.length < kAnonFloor) {
      continue; // suppress small groups entirely
    }

    const { op, field } = aggregate;

    if (op === "count") {
      out.push({ group, value: bucket.length });
      continue;
    }

    const nums = bucket
      .map((r) => Number(r[field]))
      .filter((n) => !isNaN(n));

    switch (op) {
      case "sum":
        out.push({ group, value: nums.reduce((a, b) => a + b, 0) });
        break;
      case "avg":
        out.push({
          group,
          value: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0,
        });
        break;
      case "min":
        out.push({ group, value: nums.length ? Math.min(...nums) : 0 });
        break;
      case "max":
        out.push({ group, value: nums.length ? Math.max(...nums) : 0 });
        break;
    }
  }

  return out;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const customQueryRouter = router({
  /**
   * Execute a custom query spec against the DB.
   *
   * Input is validated by SavedQuerySpecSchema (allowlist enforcement happens
   * in Zod superRefine — the executor trusts a parsed spec to be safe).
   * Output: { rows: unknown[], total: number }.
   */
  execute: adminProcedure
    .input(SavedQuerySpecSchema)
    .query(async ({ ctx, input }) => {
      const db = createAdminClient();
      const table = ENTITY_TO_TABLE[input.entity];
      const projection = projectionFor(input.entity);

      // Build the base query through withSoftDeleteFilter (soft-delete guard).
      // The runtime string from ENTITY_TO_TABLE is always a valid table name
      // because the input was validated by SavedQuerySpecSchema upstream.
      // Projection is allowlist-only — never "*" (see projectionFor above).
      let q = withSoftDeleteFilter(
        (db.from as (t: string) => ReturnType<typeof db.from>)(table).select(projection, {
          count: "exact",
        }),
      );

      // Apply filters via the typed discriminated-union dispatcher.
      for (const f of input.filters) {
        q = applyFilter(q, f as ParsedFilterRow);
      }

      // Apply orderBy if present.
      if (input.orderBy) {
        q = q.order(input.orderBy.field, {
          ascending: input.orderBy.direction === "asc",
        });
      }

      // Apply row cap.
      q = q.limit(input.limit);

      // .returns<T>() is a TS-only modifier — the dynamic projection string
      // makes supabase-js fall back to GenericStringError[]; narrow it here.
      const { data, error, count } = await q.returns<Record<string, unknown>[]>();

      if (error) {
        throw wrapDbError("reports.customQuery.execute", error);
      }

      const rawRows = data ?? [];

      // Audit log (SAT P2-5): IDs + counts only, never PII values
      // (logAudit enforces actorId; we add entity + filter count + row count).
      logAudit(ctx, "reports.customQuery.execute", {
        entity: input.entity,
        filterCount: input.filters.length,
        rowCount: rawRows.length,
        grouped: Boolean(input.groupBy && input.aggregate),
        kAnonymize: input.kAnonymize,
      });

      // Group + aggregate in JS (plan §10 explicit comment: SQL aggregation is
      // a future TODO; JS-side is fine for limit-capped row sets).
      if (input.groupBy && input.aggregate) {
        const grouped = applyGroupByAggregate(
          rawRows,
          input.groupBy,
          input.aggregate,
          input.kAnonymize ? K_ANONYMITY_FLOOR : undefined,
        );
        return { rows: grouped as unknown[], total: grouped.length };
      }

      return { rows: rawRows as unknown[], total: count ?? rawRows.length };
    }),
});

export type CustomQueryRouter = typeof customQueryRouter;
