/**
 * shared/reports/savedQuerySpec.ts — Zod schema for the custom-query builder spec.
 *
 * The superRefine validates every field name against the per-entity allowlist
 * in shared/reports/entities.ts. This is the ONLY validation layer — the server
 * executor trusts a parsed SavedQuerySpec to be safe. Never bypass safeParse.
 *
 * Operator set: eq, neq, gt, gte, lt, lte, in, contains, is_null, between.
 * The executor in server/routers/reports/customQuery/executor.ts uses a
 * typed discriminated union to dispatch each operator — no `as never` casts.
 */

import { z } from "zod";
import {
  REPORT_ENTITIES,
  ENTITY_FIELDS,
  HIGH_RISK_PII_FIELDS,
  type ReportEntity,
} from "./entities";

// ─── Operator union ────────────────────────────────────────────────────────

export const OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "contains",
  "is_null",
  "between",
] as const;

export type Operator = (typeof OPERATORS)[number];

// Typed value shape per operator — these drive the executor's discriminated union.
// Scalar operators (eq, neq, gt, gte, lt, lte): value is string | number | boolean.
// "in": value is string[] | number[].
// "contains": value is string.
// "is_null": value omitted.
// "between": value is string | number (lower), value2 is string | number (upper).

export type FilterRow =
  | { field: string; operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"; value: string | number | boolean }
  | { field: string; operator: "in"; value: (string | number)[] }
  | { field: string; operator: "contains"; value: string }
  | { field: string; operator: "is_null" }
  | { field: string; operator: "between"; value: string | number; value2: string | number };

// ─── Zod schema for a single filter row ────────────────────────────────────

const FilterRowSchema = z.discriminatedUnion("operator", [
  z.object({
    field: z.string(),
    operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte"]),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
  z.object({
    field: z.string(),
    operator: z.literal("in"),
    value: z.array(z.union([z.string(), z.number()])).min(1),
  }),
  z.object({
    field: z.string(),
    operator: z.literal("contains"),
    value: z.string(),
  }),
  z.object({
    field: z.string(),
    operator: z.literal("is_null"),
  }),
  z.object({
    field: z.string(),
    operator: z.literal("between"),
    value: z.union([z.string(), z.number()]),
    value2: z.union([z.string(), z.number()]),
  }),
]);

// ─── Main spec schema ──────────────────────────────────────────────────────

export const SavedQuerySpecSchema = z
  .object({
    entity: z.enum([...REPORT_ENTITIES] as [ReportEntity, ...ReportEntity[]]),
    filters: z.array(FilterRowSchema).max(10).default([]),
    groupBy: z.string().optional(),
    aggregate: z
      .object({
        op: z.enum(["count", "sum", "avg", "min", "max"]),
        field: z.string(),
      })
      .optional(),
    orderBy: z
      .object({
        field: z.string(),
        direction: z.enum(["asc", "desc"]).default("desc"),
      })
      .optional(),
    limit: z.number().int().min(1).max(10000).default(1000),
  })
  .superRefine((spec, ctx) => {
    const fields = ENTITY_FIELDS[spec.entity];
    const highRiskSet = new Set<string>(HIGH_RISK_PII_FIELDS);

    function findField(name: string) {
      return fields.find((f) => f.name === name);
    }

    // ── Filter allowlist ────────────────────────────────────────────────────
    for (let i = 0; i < spec.filters.length; i++) {
      const f = spec.filters[i];

      // High-risk PII fields are banned regardless of entity.
      if (highRiskSet.has(f.field)) {
        ctx.addIssue({
          code: "custom",
          path: ["filters", i, "field"],
          message: `Field '${f.field}' is a high-risk PII field and cannot be used in reports`,
        });
        continue;
      }

      const def = findField(f.field);
      if (!def) {
        ctx.addIssue({
          code: "custom",
          path: ["filters", i, "field"],
          message: `Field '${f.field}' is not in the allowlist for entity '${spec.entity}'`,
        });
        continue;
      }
      if (!def.filterable) {
        ctx.addIssue({
          code: "custom",
          path: ["filters", i, "field"],
          message: `Field '${f.field}' is not filterable`,
        });
      }
    }

    // ── groupBy allowlist ───────────────────────────────────────────────────
    if (spec.groupBy !== undefined) {
      if (highRiskSet.has(spec.groupBy)) {
        ctx.addIssue({
          code: "custom",
          path: ["groupBy"],
          message: `Field '${spec.groupBy}' is a high-risk PII field and cannot be used in groupBy`,
        });
      } else {
        const def = findField(spec.groupBy);
        if (!def) {
          ctx.addIssue({
            code: "custom",
            path: ["groupBy"],
            message: `Field '${spec.groupBy}' is not in the allowlist for entity '${spec.entity}'`,
          });
        } else if (!def.groupable) {
          ctx.addIssue({
            code: "custom",
            path: ["groupBy"],
            message: `Field '${spec.groupBy}' is not groupable`,
          });
        }
      }
    }

    // ── aggregate allowlist ─────────────────────────────────────────────────
    if (spec.aggregate !== undefined) {
      if (highRiskSet.has(spec.aggregate.field)) {
        ctx.addIssue({
          code: "custom",
          path: ["aggregate", "field"],
          message: `Field '${spec.aggregate.field}' is a high-risk PII field`,
        });
      } else {
        const def = findField(spec.aggregate.field);
        if (!def) {
          ctx.addIssue({
            code: "custom",
            path: ["aggregate", "field"],
            message: `Field '${spec.aggregate.field}' is not in the allowlist for entity '${spec.entity}'`,
          });
        } else if (!def.aggregable || !def.aggregable.includes(spec.aggregate.op)) {
          ctx.addIssue({
            code: "custom",
            path: ["aggregate", "op"],
            message: `Operation '${spec.aggregate.op}' is not allowed on field '${spec.aggregate.field}'`,
          });
        }
      }
    }

    // ── orderBy allowlist ───────────────────────────────────────────────────
    if (spec.orderBy !== undefined) {
      if (highRiskSet.has(spec.orderBy.field)) {
        ctx.addIssue({
          code: "custom",
          path: ["orderBy", "field"],
          message: `Field '${spec.orderBy.field}' is a high-risk PII field`,
        });
      } else if (!findField(spec.orderBy.field)) {
        ctx.addIssue({
          code: "custom",
          path: ["orderBy", "field"],
          message: `Field '${spec.orderBy.field}' is not in the allowlist for entity '${spec.entity}'`,
        });
      }
    }
  });

export type SavedQuerySpec = z.infer<typeof SavedQuerySpecSchema>;
export type ParsedFilterRow = z.infer<typeof FilterRowSchema>;
