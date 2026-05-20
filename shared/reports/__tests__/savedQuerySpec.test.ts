/**
 * savedQuerySpec.test.ts — Allowlist enforcement tests for SavedQuerySpecSchema.
 *
 * RED-first: written before the executor. Tests pin:
 *   - allowlist: known-good fields pass, unknown fields fail
 *   - evil field: SQL injection string in filter.field is rejected by Zod
 *   - ungroupable: non-groupable field in groupBy fails
 *   - max-limit: limit > 10000 fails
 *   - high-risk PII: situacion_legal, foto_documento_url, recorrido_migratorio are always rejected
 */

import { describe, it, expect } from "vitest";
import { SavedQuerySpecSchema } from "../savedQuerySpec";

// ─── helpers ────────────────────────────────────────────────────────────────

function validBase(overrides: object = {}) {
  return { entity: "families", filters: [], limit: 100, ...overrides };
}

// ─── 1. Allowlist — valid specs pass ────────────────────────────────────────

describe("SavedQuerySpecSchema — valid specs", () => {
  it("accepts a minimal valid spec (no filters, no groupBy, no aggregate)", () => {
    const result = SavedQuerySpecSchema.safeParse(validBase());
    expect(result.success).toBe(true);
  });

  it("accepts a filter on a known filterable field with eq operator", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({
        filters: [{ field: "estado", operator: "eq", value: "activa" }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a numeric filter with gte operator", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({
        filters: [{ field: "num_adultos", operator: "gte", value: 2 }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts an 'in' filter with a string array", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({
        filters: [{ field: "estado", operator: "in", value: ["activa", "baja"] }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts an 'is_null' filter (no value required)", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({
        filters: [{ field: "distrito", operator: "is_null" }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a 'between' filter with value + value2", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({
        filters: [
          { field: "created_at", operator: "between", value: "2024-01-01", value2: "2024-12-31" },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts groupBy on a groupable field", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({ groupBy: "estado" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts aggregate count on an aggregable field", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({ aggregate: { op: "count", field: "id" } }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts aggregate sum on a numeric field", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({ aggregate: { op: "sum", field: "num_adultos" } }),
    );
    expect(result.success).toBe(true);
  });

  it("applies default limit=1000 when limit is omitted", () => {
    const result = SavedQuerySpecSchema.safeParse({ entity: "families", filters: [] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(1000);
  });

  it("applies default filters=[] when filters is omitted", () => {
    const result = SavedQuerySpecSchema.safeParse({ entity: "families", limit: 50 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.filters).toEqual([]);
  });
});

// ─── 2. Unknown / evil field → rejected before DB ───────────────────────────

describe("SavedQuerySpecSchema — evil and unknown fields are rejected by Zod", () => {
  it("rejects an unknown field in filter (allowlist enforcement)", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({
        filters: [{ field: "evil_field", operator: "eq", value: 1 }],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a SQL injection string in filter.field (evil-field rejection)", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({
        filters: [{ field: "DROP TABLE families;--", operator: "eq", value: 1 }],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects unknown field in groupBy", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({ groupBy: "unknown_col" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects unknown field in aggregate.field", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({ aggregate: { op: "count", field: "bad_field" } }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects unknown entity", () => {
    const result = SavedQuerySpecSchema.safeParse(
      { entity: "evil_table", filters: [], limit: 10 } as never,
    );
    expect(result.success).toBe(false);
  });
});

// ─── 3. High-risk PII fields ─────────────────────────────────────────────────

describe("SavedQuerySpecSchema — high-risk PII fields are always rejected", () => {
  const piiFields = [
    "situacion_legal",
    "foto_documento_url",
    "recorrido_migratorio",
  ] as const;

  for (const field of piiFields) {
    it(`rejects '${field}' in filter (entity: persons)`, () => {
      const result = SavedQuerySpecSchema.safeParse({
        entity: "persons",
        filters: [{ field, operator: "eq", value: "anything" }],
        limit: 10,
      });
      expect(result.success).toBe(false);
    });

    it(`rejects '${field}' in groupBy (entity: persons)`, () => {
      const result = SavedQuerySpecSchema.safeParse({
        entity: "persons",
        filters: [],
        groupBy: field,
        limit: 10,
      });
      expect(result.success).toBe(false);
    });
  }
});

// ─── 4. Ungroupable field in groupBy ─────────────────────────────────────────

describe("SavedQuerySpecSchema — ungroupable fields", () => {
  it("rejects 'id' (groupable=false on families) in groupBy", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({ groupBy: "id" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a non-filterable field in filters", () => {
    // 'id' on families is filterable=false
    const result = SavedQuerySpecSchema.safeParse(
      validBase({
        filters: [{ field: "id", operator: "eq", value: "some-uuid" }],
      }),
    );
    expect(result.success).toBe(false);
  });
});

// ─── 5. Limit bounds ─────────────────────────────────────────────────────────

describe("SavedQuerySpecSchema — limit validation", () => {
  it("rejects limit > 10000", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({ limit: 99999 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects limit = 0 (min is 1)", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({ limit: 0 }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts limit = 10000 (exact max)", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({ limit: 10000 }),
    );
    expect(result.success).toBe(true);
  });
});

// ─── 6. Non-aggregable op on a field ─────────────────────────────────────────

describe("SavedQuerySpecSchema — aggregate op validation", () => {
  it("rejects sum on a non-aggregable boolean field (estado)", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({ aggregate: { op: "sum", field: "estado" } }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects avg on a field that only supports count (created_at)", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({
        // created_at aggregable = ["count","min","max"] — avg is NOT allowed
        aggregate: { op: "avg", field: "created_at" },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts count on id (aggregable: ['count'])", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({ aggregate: { op: "count", field: "id" } }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts min on num_adultos (aggregable: count|sum|avg|min|max)", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validBase({ aggregate: { op: "min", field: "num_adultos" } }),
    );
    expect(result.success).toBe(true);
  });
});

// ─── 7. Persons entity ───────────────────────────────────────────────────────

describe("SavedQuerySpecSchema — persons entity", () => {
  function validPersonBase(overrides: object = {}) {
    return { entity: "persons", filters: [], limit: 100, ...overrides };
  }

  it("accepts a valid filter on idioma_principal", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validPersonBase({
        filters: [{ field: "idioma_principal", operator: "eq", value: "ar" }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects an unknown field on persons entity", () => {
    const result = SavedQuerySpecSchema.safeParse(
      validPersonBase({
        filters: [{ field: "notas_privadas", operator: "eq", value: "x" }],
      }),
    );
    expect(result.success).toBe(false);
  });
});
