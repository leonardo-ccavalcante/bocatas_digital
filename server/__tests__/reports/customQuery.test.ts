/**
 * customQuery.test.ts — RED tests for the custom-query executor + saved-query CRUD.
 *
 * Asserts (per mission brief):
 *   1. Voluntario is FORBIDDEN on execute, list, save, delete.
 *   2. Evil field (SQL injection / unknown) is rejected by Zod BEFORE any DB call.
 *   3. save + list + delete CRUD round-trip (via vi.mock of createAdminClient).
 *
 * Mocking pattern: mirrors mapa-router.test.ts (vi.mock before import, chainable mock).
 */

import { TRPCError } from "@trpc/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

// ─── vi.mock — must precede all router imports ────────────────────────────

const fromMock = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import AFTER vi.mock
import { customQueryRouter } from "../../routers/reports/customQuery/executor";
import { savedQueriesRouter } from "../../routers/reports/customQuery/saved";

// ─── Context helpers ─────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxWithRole(role: AuthenticatedUser["role"]): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: `${role}@bocatas.org`,
    name: role,
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "reports-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// ─── Chainable mock builder ──────────────────────────────────────────────

type ChainResult = { data: unknown; error: null | { message: string }; count?: number };

function mockSelectChain(result: ChainResult) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    // .returns<T>() is a TS-only modifier; at runtime it returns the builder.
    returns: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (
      resolve: (v: ChainResult) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

beforeEach(() => {
  fromMock.mockReset();
});

// ─── 1. Role guard: voluntario is FORBIDDEN ──────────────────────────────

describe("customQuery.execute — role guard", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = customQueryRouter.createCaller(ctxWithRole("voluntario"));
    await expect(
      caller.execute({ entity: "families", filters: [], limit: 10 }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers with FORBIDDEN", async () => {
    const ctx: TrpcContext = {
      user: null,
      logger: new Logger(),
      correlationId: "anon",
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = customQueryRouter.createCaller(ctx);
    await expect(
      caller.execute({ entity: "families", filters: [], limit: 10 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<TRPCError>);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("accepts admin role", async () => {
    fromMock.mockReturnValueOnce(mockSelectChain({ data: [], error: null, count: 0 }));
    const caller = customQueryRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.execute({ entity: "families", filters: [], limit: 10 }),
    ).resolves.toBeDefined();
  });

  it("accepts superadmin role", async () => {
    fromMock.mockReturnValueOnce(mockSelectChain({ data: [], error: null, count: 0 }));
    const caller = customQueryRouter.createCaller(ctxWithRole("superadmin"));
    await expect(
      caller.execute({ entity: "families", filters: [], limit: 10 }),
    ).resolves.toBeDefined();
  });
});

// ─── 2. Evil field rejected by Zod BEFORE DB ─────────────────────────────

describe("customQuery.execute — evil field rejected by Zod before DB", () => {
  it("rejects SQL injection string in filter.field without calling DB", async () => {
    const caller = customQueryRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.execute({
        entity: "families",
        filters: [{ field: "DROP TABLE families;--", operator: "eq", value: 1 }] as never,
        limit: 10,
      }),
    ).rejects.toThrow();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects unknown field in filter without calling DB", async () => {
    const caller = customQueryRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.execute({
        entity: "families",
        filters: [{ field: "evil_field", operator: "eq", value: 1 }] as never,
        limit: 10,
      }),
    ).rejects.toThrow();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects high-risk PII field situacion_legal without calling DB", async () => {
    const caller = customQueryRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.execute({
        entity: "persons",
        filters: [{ field: "situacion_legal", operator: "eq", value: "irregular" }] as never,
        limit: 10,
      }),
    ).rejects.toThrow();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects foto_documento_url without calling DB", async () => {
    const caller = customQueryRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.execute({
        entity: "persons",
        filters: [{ field: "foto_documento_url", operator: "is_null" }] as never,
        limit: 10,
      }),
    ).rejects.toThrow();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects sum aggregate on non-aggregable field (estado)", async () => {
    const caller = customQueryRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.execute({
        entity: "families",
        filters: [],
        aggregate: { op: "sum", field: "estado" } as never,
        limit: 10,
      }),
    ).rejects.toThrow();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ─── 3. Output shape ─────────────────────────────────────────────────────

describe("customQuery.execute — output shape", () => {
  it("returns { rows, total } when DB returns rows", async () => {
    const fakeRows = [
      { id: "abc", estado: "activa", distrito: "centro" },
      { id: "def", estado: "baja", distrito: null },
    ];
    fromMock.mockReturnValueOnce(
      mockSelectChain({ data: fakeRows, error: null, count: 2 }),
    );
    const caller = customQueryRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.execute({
      entity: "families",
      filters: [],
      limit: 10,
    });
    expect(result.rows).toHaveLength(2);
    expect(typeof result.total).toBe("number");
  });

  it("returns { rows: [], total: 0 } on empty DB result", async () => {
    fromMock.mockReturnValueOnce(
      mockSelectChain({ data: [], error: null, count: 0 }),
    );
    const caller = customQueryRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.execute({
      entity: "families",
      filters: [],
      limit: 10,
    });
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ─── 5. SECURITY (SAT P1): server-side column projection by allowlist ─────
// The executor MUST NEVER select("*") — that returns every column including
// high-risk PII (situacion_legal, foto_documento_url, recorrido_migratorio)
// because createAdminClient() bypasses RLS via the service role. Projecting
// only allowlisted columns makes the PII exclusion unconditional, not
// dependent on the client passing redactFields to the CSV exporter.

describe("customQuery.execute — column projection is allowlist-only (no PII leak)", () => {
  function captureSelectChain(result: ChainResult) {
    const chain = mockSelectChain(result);
    return chain;
  }

  it("never passes '*' to .select() for the persons entity", async () => {
    const chain = captureSelectChain({ data: [], error: null, count: 0 });
    fromMock.mockReturnValueOnce(chain);
    const caller = customQueryRouter.createCaller(ctxWithRole("admin"));
    await caller.execute({ entity: "persons", filters: [], limit: 10 });

    const projection = chain.select.mock.calls[0]?.[0] as string;
    expect(projection).toBeDefined();
    expect(projection).not.toBe("*");
    expect(projection).not.toContain("*");
  });

  it("excludes high-risk PII columns from the persons projection", async () => {
    const chain = captureSelectChain({ data: [], error: null, count: 0 });
    fromMock.mockReturnValueOnce(chain);
    const caller = customQueryRouter.createCaller(ctxWithRole("admin"));
    await caller.execute({ entity: "persons", filters: [], limit: 10 });

    const projection = chain.select.mock.calls[0]?.[0] as string;
    expect(projection).not.toContain("situacion_legal");
    expect(projection).not.toContain("foto_documento_url");
    expect(projection).not.toContain("recorrido_migratorio");
  });

  it("includes the allowlisted demographic columns for persons", async () => {
    const chain = captureSelectChain({ data: [], error: null, count: 0 });
    fromMock.mockReturnValueOnce(chain);
    const caller = customQueryRouter.createCaller(ctxWithRole("admin"));
    await caller.execute({ entity: "persons", filters: [], limit: 10 });

    const projection = chain.select.mock.calls[0]?.[0] as string;
    expect(projection).toContain("idioma_principal");
    expect(projection).toContain("pais_origen");
    expect(projection).toContain("id");
  });
});

// ─── 4. Saved-query CRUD (list + save + delete) ───────────────────────────

describe("savedQueries — role guard", () => {
  it("rejects voluntario from list", async () => {
    const caller = savedQueriesRouter.createCaller(ctxWithRole("voluntario"));
    await expect(caller.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects voluntario from save", async () => {
    const caller = savedQueriesRouter.createCaller(ctxWithRole("voluntario"));
    await expect(
      caller.save({
        nombre: "test",
        spec: { entity: "families", filters: [], limit: 10 },
        isShared: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects voluntario from delete", async () => {
    const caller = savedQueriesRouter.createCaller(ctxWithRole("voluntario"));
    await expect(
      caller.delete({ id: "00000000-0000-0000-0000-000000000001" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("savedQueries — list returns admin's own + shared queries", () => {
  it("calls DB and returns the rows", async () => {
    const fakeQueries = [
      { id: "q1", nombre: "Test query", is_shared: false, user_id: "1" },
    ];
    // list makes one DB call: from("report_saved_queries").select(...)...
    fromMock.mockReturnValueOnce(
      mockSelectChain({ data: fakeQueries, error: null }),
    );
    const caller = savedQueriesRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.list({});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "q1" });
  });
});

describe("savedQueries — save inserts a row and returns it", () => {
  it("inserts a new saved query and returns the created row", async () => {
    const fakeRow = {
      id: "new-id",
      nombre: "My report",
      is_shared: false,
      user_id: "1",
      spec_json: { entity: "families", filters: [], limit: 100 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    fromMock.mockReturnValueOnce(mockSelectChain({ data: fakeRow, error: null }));
    const caller = savedQueriesRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.save({
      nombre: "My report",
      spec: { entity: "families", filters: [], limit: 100 },
      isShared: false,
    });
    expect(result).toMatchObject({ id: "new-id", nombre: "My report" });
  });
});

describe("savedQueries — delete removes a query owned by the caller", () => {
  it("calls DB delete and returns success:true", async () => {
    fromMock.mockReturnValueOnce(mockSelectChain({ data: null, error: null }));
    const caller = savedQueriesRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.delete({
      id: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({ success: true });
  });
});
