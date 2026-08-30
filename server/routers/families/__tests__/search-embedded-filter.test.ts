/**
 * search-embedded-filter.test.ts — RC-08 (QA F072/F073/F160/F165/F186/F203).
 *
 * families.getAll and families.verifyIdentity filter the embedded titular
 * (`persons!titular_id`). PostgREST semantics (verified against the live
 * local stack):
 *   - a filter on a non-!inner embed only NULLS the embed — every family is
 *     returned (verifyIdentity listed all active families for any name), and
 *   - embedded dotted paths inside a TOP-LEVEL or= are a PGRST100 parse
 *     error (getAll text search → HTTP 500).
 *
 * Contract asserted here:
 *   - name search selects `persons!titular_id!inner(...)` and applies
 *     `.or("nombre.ilike.…,apellidos.ilike.…", { referencedTable: "persons" })`;
 *   - plain-list / numeric paths keep the left-join embed (families without
 *     titular must still appear — families.titular_id is nullable);
 *   - verifyIdentity returns `estado` (the client badge renders it).
 *
 * Mock idiom: server/routers/families/__tests__/crud.test.ts.
 * Real-transport proof: search-embedded-filter.integration.test.ts.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";
import { ilikeForOr } from "../../../_core/postgrestFilter";

// ─── vi.mock — must precede router imports ─────────────────────────────────
const fromMock = vi.fn();

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import AFTER vi.mock is registered.
import { crudRouter } from "../crud";
import { complianceRouter } from "../compliance";

function ctxAdmin(): TrpcContext {
  const user: NonNullable<TrpcContext["user"]> = {
    id: "test-user-1",
    openId: "test-user",
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
    correlationId: "families-search-embedded-filter-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// Chainable supabase mock. getAll terminates at .range(); verifyIdentity at .limit().
function mockChain(rows: unknown[]) {
  const select = vi.fn().mockReturnThis();
  const eq = vi.fn().mockReturnThis();
  const or = vi.fn().mockReturnThis();
  const ilike = vi.fn().mockReturnThis();
  const chain = {
    select,
    eq,
    or,
    ilike,
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn(() =>
      Promise.resolve({ data: rows, error: null, count: rows.length })
    ),
    limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return { chain, select, eq, or, ilike };
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("families.getAll — titular name search (RC-08)", () => {
  it("name search: !inner embed + .or() scoped to the persons embed (was top-level → PGRST100/500)", async () => {
    const { chain, select, or } = mockChain([]);
    fromMock.mockReturnValue(chain);

    await crudRouter.createCaller(ctxAdmin()).getAll({ search: "García" });

    expect(select.mock.calls[0][0]).toContain("persons!titular_id!inner");
    const token = ilikeForOr("García");
    expect(or).toHaveBeenCalledWith(
      `nombre.ilike.${token},apellidos.ilike.${token}`,
      { referencedTable: "persons" }
    );
  });

  it("plain list keeps left-join semantics: families without titular still appear", async () => {
    const { chain, select, or } = mockChain([]);
    fromMock.mockReturnValue(chain);

    await crudRouter.createCaller(ctxAdmin()).getAll({});

    expect(select.mock.calls[0][0]).not.toContain("!inner");
    expect(or).not.toHaveBeenCalled();
  });

  it("numeric search filters familia_numero, no inner join", async () => {
    const { chain, select, eq, or } = mockChain([]);
    fromMock.mockReturnValue(chain);

    await crudRouter.createCaller(ctxAdmin()).getAll({ search: "42" });

    expect(eq).toHaveBeenCalledWith("familia_numero", 42);
    expect(select.mock.calls[0][0]).not.toContain("!inner");
    expect(or).not.toHaveBeenCalled();
  });
});

describe("families.verifyIdentity — volunteer identity search (RC-08)", () => {
  const row = {
    id: "f-1",
    familia_numero: 3,
    estado: "activa",
    persona_recoge: "Maria",
    autorizado: false,
    autorizado_documento_url: null,
    num_adultos: 2,
    num_menores_18: 2,
    persons: { nombre: "Maria", apellidos: "Garcia Lopez" },
  };

  it("name search: !inner embed, searches nombre AND apellidos via scoped .or(), returns estado", async () => {
    const { chain, select, or, ilike } = mockChain([row]);
    fromMock.mockReturnValue(chain);

    const res = await complianceRouter
      .createCaller(ctxAdmin())
      .verifyIdentity({ query: "Maria" });

    expect(select.mock.calls[0][0]).toContain("persons!titular_id!inner");
    const token = ilikeForOr("Maria");
    expect(or).toHaveBeenCalledWith(
      `nombre.ilike.${token},apellidos.ilike.${token}`,
      { referencedTable: "persons" }
    );
    expect(ilike).not.toHaveBeenCalled();
    expect(res[0]).toMatchObject({
      titular_nombre: "Maria Garcia Lopez",
      estado: "activa",
    });
  });

  it("numeric query filters familia_numero and keeps the left-join embed", async () => {
    const { chain, select, eq, or } = mockChain([row]);
    fromMock.mockReturnValue(chain);

    await complianceRouter.createCaller(ctxAdmin()).verifyIdentity({ query: "3" });

    expect(eq).toHaveBeenCalledWith("familia_numero", 3);
    expect(select.mock.calls[0][0]).not.toContain("!inner");
    expect(or).not.toHaveBeenCalled();
  });
});
