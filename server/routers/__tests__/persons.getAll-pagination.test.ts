/**
 * persons.getAll-pagination.test.ts — MYT-80-ATL03 (P1, gh #80).
 *
 * persons.getAll (server/routers/persons/crud.ts) has no `.limit()`/`.range()`
 * on its Supabase query — it fetches every non-deleted person row on every
 * call ("carga O(N) completa"), and only grows as the person table grows
 * (707+ rows today). This test asserts the server-side pagination contract
 * from the finding's fix_hint: an optional `{ limit, offset }` input, a
 * bounded default applied when it's omitted, `.range(offset, offset+limit-1)`
 * on the query, and an exact total count returned alongside the page.
 *
 * Mocking pattern: server/routers/__tests__/persons.getById-redaction.test.ts
 * (vi.mock createAdminClient; real resolver via crudRouter.createCaller —
 * never mock the resolver itself).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

const fromMock = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import AFTER vi.mock is registered.
import { crudRouter } from "../persons/crud";

function adminCtx(): TrpcContext {
  const user: NonNullable<TrpcContext["user"]> = {
    id: "test-user-1",
    openId: "test-admin",
    email: "admin@bocatas.org",
    name: "admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "persons-getall-pagination-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const rangeMock = vi.fn();

/**
 * Mirrors the chain the FIXED resolver is expected to build:
 *   .from("persons").select(cols, {count:"exact"}).is(...).order(...).range(...)
 * `.range()` is the terminal, awaited call. Today's (unfixed) resolver never
 * calls `.range()` at all, so `rangeMock` stays uncalled and this chain's
 * `order()` (a non-thenable mockReturnThis) is what actually gets awaited —
 * the assertions below target the presence/args of the `.range()` call
 * itself, which is the documented defect, not the exact fallback value.
 */
function getAllChain(result: { data: unknown[]; error: null; count: number }) {
  return {
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: rangeMock.mockReturnValueOnce(Promise.resolve(result)),
  };
}

beforeEach(() => {
  fromMock.mockReset();
  rangeMock.mockReset();
  // getAll ahora hace una 2ª query batelada (program_enrollments) para los
  // chips del listado. Los mockReturnValueOnce de cada test siguen sirviendo
  // la página de persons (los once-values tienen prioridad); esta implementación
  // por defecto atiende la query de inscripciones con una lista vacía.
  fromMock.mockImplementation(() => ({
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  }));
});

describe("persons.getAll — server-side pagination (MYT-80-ATL03)", () => {
  it("invokes .range(offset, offset+limit-1) honoring the caller's input", async () => {
    fromMock.mockReturnValueOnce(
      getAllChain({ data: [{ id: "p1" }, { id: "p2" }], error: null, count: 707 })
    );
    const caller = crudRouter.createCaller(adminCtx());

    // MYT-80-ATL03: getAll has no `.input()` today, so this call is only
    // meaningful once the fix adds an optional {limit, offset} input — cast
    // through `any` so the RED run (no input schema) still type-checks.
    await (caller.getAll as unknown as (i: unknown) => Promise<unknown>)({
      limit: 2,
      offset: 4,
    });

    expect(rangeMock).toHaveBeenCalledWith(4, 5);
  });

  it("applies a bounded default range() when no input is given (never unbounded)", async () => {
    fromMock.mockReturnValueOnce(
      getAllChain({ data: [{ id: "p1" }], error: null, count: 707 })
    );
    const caller = crudRouter.createCaller(adminCtx());

    await caller.getAll();

    expect(rangeMock).toHaveBeenCalled();
    const [from, to] = rangeMock.mock.calls[0] as [number, number];
    expect(from).toBe(0);
    // Whatever the default cap is, it must be a bounded page, not "everything".
    expect(to - from + 1).toBeLessThanOrEqual(200);
  });

  it("returns an exact total count alongside the page (for client-side pager UI)", async () => {
    fromMock.mockReturnValueOnce(
      getAllChain({ data: [{ id: "p1" }, { id: "p2" }], error: null, count: 707 })
    );
    const caller = crudRouter.createCaller(adminCtx());

    const result = (await (caller.getAll as unknown as (i: unknown) => Promise<unknown>)({
      limit: 2,
      offset: 0,
    })) as { total?: number };

    expect(result.total).toBe(707);
  });
});
