/**
 * mapa-router.test.ts — Stage S3 server-mapa Feature Agent contract tests.
 *
 * Replaces the S2 thin-slice stub assertions with the real-aggregation
 * contract. The router queries Supabase via createAdminClient() (mocked
 * here) and delegates aggregation + k-anonymity to pure helpers covered
 * by `mapa-aggregation.test.ts`.
 *
 * Asserts:
 *   • Role guard: only admin/superadmin reach the procedure; voluntario
 *     is FORBIDDEN (Phase 2 §3 Compliance — aggregate dashboards are
 *     strategic data, not voluntario-facing).
 *   • Zod input validation: layer enum is enforced.
 *   • Output shape: { rows: DistritoStatRow[], layer, kAnonymityFloor: 3 }.
 *   • Real aggregation: rows are produced from the mocked Supabase rows,
 *     and k-anonymity floor is applied (a 1-family distrito surfaces null).
 *   • Sin_asignar bucket: families with null distrito surface in the
 *     output under the "sin_asignar" key.
 *
 * Mocking pattern source: server/routers/__tests__/persons.dedup.test.ts.
 */

import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../_core/context";
import { Logger } from "../_core/logger";

// ─── vi.mock — must precede router import ─────────────────────────────────
const fromMock = vi.fn();

vi.mock("../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import AFTER vi.mock is registered.
import { mapaRouter } from "../routers/mapa";

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
    correlationId: "mapa-router-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// Build a fake Supabase query result by emulating the chainable select / eq
// / is API. The router awaits the chain terminus (the resolved Promise from
// `q`), so the chain must be thenable on its final form.
type FamilyRow = {
  distrito: string | null;
  estado: string;
  deleted_at: string | null;
  alta_en_guf: boolean | null;
  padron_recibido: boolean | null;
  informe_social: boolean | null;
  consent_bocatas: boolean | null;
  consent_banco_alimentos: boolean | null;
  docs_identidad: boolean | null;
};

function mockSelectChain(rows: FamilyRow[]) {
  const result = { data: rows, error: null };
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    // `.returns<T>()` in supabase-js is a TS-only modifier — at runtime it
    // returns the same builder. The mock mirrors that contract.
    returns: vi.fn().mockReturnThis(),
    then: (
      resolve: (v: typeof result) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

beforeEach(() => {
  fromMock.mockReset();
});

// ─── 1. Role guard ────────────────────────────────────────────────────────

describe("mapa.distritoStats — role guard", () => {
  it("rejects voluntario with FORBIDDEN (mapa is admin-only strategic data)", async () => {
    const caller = mapaRouter.createCaller(ctxWithRole("voluntario"));
    await expect(
      caller.distritoStats({ layer: "densidad" }),
    ).rejects.toMatchObject({
      name: "TRPCError",
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>);
    // Defense in depth: the Supabase query must not run.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers (adminProcedure throws FORBIDDEN for null user)", async () => {
    const ctx: TrpcContext = {
      user: null,
      logger: new Logger(),
      correlationId: "anon",
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = mapaRouter.createCaller(ctx);
    await expect(
      caller.distritoStats({ layer: "densidad" }),
    ).rejects.toMatchObject({
      name: "TRPCError",
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("accepts admin role", async () => {
    fromMock.mockReturnValueOnce(mockSelectChain([]));
    const caller = mapaRouter.createCaller(ctxWithRole("admin"));
    await expect(caller.distritoStats({ layer: "densidad" })).resolves.toBeDefined();
  });

  it("accepts superadmin role", async () => {
    fromMock.mockReturnValueOnce(mockSelectChain([]));
    const caller = mapaRouter.createCaller(ctxWithRole("superadmin"));
    await expect(caller.distritoStats({ layer: "densidad" })).resolves.toBeDefined();
  });
});

// ─── 2. Output shape contract ─────────────────────────────────────────────

describe("mapa.distritoStats — output shape", () => {
  it("returns kAnonymityFloor=3 in every response", async () => {
    fromMock.mockReturnValueOnce(mockSelectChain([]));
    const caller = mapaRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.distritoStats({ layer: "densidad" });
    expect(result.kAnonymityFloor).toBe(3);
  });

  it("echoes the requested layer (densidad)", async () => {
    fromMock.mockReturnValueOnce(mockSelectChain([]));
    const caller = mapaRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.distritoStats({ layer: "densidad" });
    expect(result.layer).toBe("densidad");
  });

  it("echoes the requested layer (compliance)", async () => {
    fromMock.mockReturnValueOnce(mockSelectChain([]));
    const caller = mapaRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.distritoStats({ layer: "compliance" });
    expect(result.layer).toBe("compliance");
  });

  it("defaults to densidad when layer is omitted", async () => {
    fromMock.mockReturnValueOnce(mockSelectChain([]));
    const caller = mapaRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.distritoStats(undefined);
    expect(result.layer).toBe("densidad");
  });

  it("rejects unknown layer values via Zod", async () => {
    const caller = mapaRouter.createCaller(ctxWithRole("admin"));
    await expect(
      // @ts-expect-error — intentionally passing an invalid layer to verify Zod rejects it.
      caller.distritoStats({ layer: "foo" }),
    ).rejects.toThrow();
  });
});

// ─── 3. Real aggregation paths (with mocked DB) ───────────────────────────

function f(overrides: Partial<FamilyRow>): FamilyRow {
  return {
    distrito: "centro",
    estado: "activa",
    deleted_at: null,
    alta_en_guf: true,
    padron_recibido: true,
    informe_social: true,
    consent_bocatas: true,
    consent_banco_alimentos: true,
    docs_identidad: true,
    ...overrides,
  };
}

describe("mapa.distritoStats — real aggregation (densidad layer)", () => {
  it("surfaces a distrito with >=3 families as a real count", async () => {
    fromMock.mockReturnValueOnce(
      mockSelectChain([
        f({ distrito: "centro" }),
        f({ distrito: "centro" }),
        f({ distrito: "centro" }),
        f({ distrito: "centro" }),
      ]),
    );
    const caller = mapaRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.distritoStats({ layer: "densidad" });
    const centro = result.rows.find((r) => r.distrito === "centro");
    expect(centro?.count).toBe(4);
  });

  it("suppresses count to null when distrito has fewer than 3 families (k-anonymity)", async () => {
    fromMock.mockReturnValueOnce(
      mockSelectChain([
        f({ distrito: "centro" }),
        f({ distrito: "vicalvaro" }),
        f({ distrito: "vicalvaro" }),
      ]),
    );
    const caller = mapaRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.distritoStats({ layer: "densidad" });
    const centro = result.rows.find((r) => r.distrito === "centro");
    const vicalvaro = result.rows.find((r) => r.distrito === "vicalvaro");
    expect(centro?.count).toBeNull(); // 1 < 3
    expect(vicalvaro?.count).toBeNull(); // 2 < 3
  });

  it("excludes the 'sin_asignar' bucket from the public output (operational signal, not funder-facing)", async () => {
    fromMock.mockReturnValueOnce(
      mockSelectChain([
        f({ distrito: null }),
        f({ distrito: null }),
        f({ distrito: null }),
        f({ distrito: null }),
        f({ distrito: "centro" }),
        f({ distrito: "centro" }),
        f({ distrito: "centro" }),
      ]),
    );
    const caller = mapaRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.distritoStats({ layer: "densidad" });
    // Only the 21 Madrid distritos may appear — sin_asignar is filtered.
    // Cast to string at the runtime check so TS doesn't fold this to a
    // tautology; we want a real runtime assertion on the wire payload.
    const distritosOnWire = result.rows.map((r) => r.distrito as string);
    expect(distritosOnWire).not.toContain("sin_asignar");
    // Real distrito with >=3 families still surfaces.
    expect(result.rows.find((r) => r.distrito === "centro")?.count).toBe(3);
  });

  it("returns an empty rows array when there are no families", async () => {
    fromMock.mockReturnValueOnce(mockSelectChain([]));
    const caller = mapaRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.distritoStats({ layer: "densidad" });
    expect(result.rows).toEqual([]);
  });

  it("does not include compliance ratio on densidad rows", async () => {
    fromMock.mockReturnValueOnce(
      mockSelectChain([
        f({ distrito: "centro" }),
        f({ distrito: "centro" }),
        f({ distrito: "centro" }),
      ]),
    );
    const caller = mapaRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.distritoStats({ layer: "densidad" });
    const centro = result.rows.find((r) => r.distrito === "centro");
    expect(centro?.compliance).toBeUndefined();
  });
});

describe("mapa.distritoStats — real aggregation (compliance layer)", () => {
  it("surfaces compliance ratio when distrito has >=3 families", async () => {
    fromMock.mockReturnValueOnce(
      mockSelectChain([
        f({ distrito: "centro" }), // compliant
        f({ distrito: "centro" }), // compliant
        f({ distrito: "centro", padron_recibido: false }), // red flag
        f({ distrito: "centro", consent_bocatas: false }), // red flag
      ]),
    );
    const caller = mapaRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.distritoStats({ layer: "compliance" });
    const centro = result.rows.find((r) => r.distrito === "centro");
    expect(centro?.count).toBe(4);
    // 2 compliant out of 4 → ratio 0.5
    expect(centro?.compliance).toBeCloseTo(0.5, 4);
  });

  it("suppresses BOTH count AND compliance when total < 3 (re-identification guard)", async () => {
    fromMock.mockReturnValueOnce(
      mockSelectChain([
        f({ distrito: "centro", padron_recibido: false }),
        f({ distrito: "centro" }),
      ]),
    );
    const caller = mapaRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.distritoStats({ layer: "compliance" });
    const centro = result.rows.find((r) => r.distrito === "centro");
    expect(centro?.count).toBeNull();
    expect(centro?.compliance).toBeUndefined();
  });
});
