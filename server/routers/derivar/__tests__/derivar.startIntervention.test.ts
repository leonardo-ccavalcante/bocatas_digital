/**
 * derivar.startIntervention.test.ts
 *
 * Contract tests for derivar.startIntervention (hojasRouter).
 *
 * Asserts:
 *   - Role guard: voluntario is FORBIDDEN; admin/superadmin are allowed.
 *   - Returns estado='new' + hoja.id=null when no existing active hoja.
 *   - Returns correct header (nombre, programaNombre, profesionalNombre).
 *   - Null user is FORBIDDEN.
 *
 * Mocking pattern: chainable-mock idiom from server/__tests__/mapa-router.test.ts.
 */

import type { TRPCError } from "@trpc/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

// ─── vi.mock — must precede router imports ──────────────────────────────────
const fromMock = vi.fn();

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import AFTER vi.mock.
import { hojasRouter } from "../hojas";

// ---------------------------------------------------------------------------
// Context factory
// ---------------------------------------------------------------------------

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxWithRole(role: AuthenticatedUser["role"]): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: `${role}@bocatas.org`,
    name: "Test Pro",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "test-corr",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function ctxAnon(): TrpcContext {
  return {
    user: null,
    logger: new Logger(),
    correlationId: "anon",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// ---------------------------------------------------------------------------
// Chainable mock helpers
// ---------------------------------------------------------------------------

/**
 * Single-result chain. The terminal method (single / maybeSingle) resolves
 * with {data, error}.
 */
function singleChain<T>(data: T, error: null | { message: string } = null) {
  const result = { data, error };
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

// UUIDs must be valid RFC 4122 v4 (bits 12-15 = 4, bits 16-17 = 8/9/a/b).
const TEST_PERSONA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEST_PROGRAMA_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  fromMock.mockReset();
});

// ─── 1. Role guard ─────────────────────────────────────────────────────────

describe("derivar.startIntervention — role guard", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = hojasRouter.createCaller(ctxWithRole("voluntario"));
    await expect(
      caller.startIntervention({
        scope: "persona",
        entityId: TEST_PERSONA_ID,
        programaId: TEST_PROGRAMA_ID,
      }),
    ).rejects.toMatchObject({
      name: "TRPCError",
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers with FORBIDDEN", async () => {
    const caller = hojasRouter.createCaller(ctxAnon());
    await expect(
      caller.startIntervention({
        scope: "persona",
        entityId: TEST_PERSONA_ID,
        programaId: TEST_PROGRAMA_ID,
      }),
    ).rejects.toMatchObject({
      name: "TRPCError",
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ─── 2. Returns 'new' when no active hoja exists ──────────────────────────

describe("derivar.startIntervention — new hoja path", () => {
  it("returns estado=new and hoja.id=null when no active hoja exists", async () => {
    // Call order: programs → persons → families(titular) → familia_miembros → derivacion_hojas
    fromMock
      // 1. programs.select.eq.single → programa
      .mockReturnValueOnce(
        singleChain({ id: TEST_PROGRAMA_ID, name: "Comedor" }),
      )
      // 2. persons.select.eq.single → persona
      .mockReturnValueOnce(
        singleChain({ id: TEST_PERSONA_ID, nombre: "Ana", apellidos: "García" }),
      )
      // 3. families(titular_id).select.eq.is.maybeSingle → null (not a titular)
      .mockReturnValueOnce(singleChain(null))
      // 4. familia_miembros.select.eq.is.limit.maybeSingle → null (not a member)
      .mockReturnValueOnce(singleChain(null))
      // 5. derivacion_hojas (active hoja lookup) → null
      .mockReturnValueOnce(singleChain(null));

    const caller = hojasRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.startIntervention({
      scope: "persona",
      entityId: TEST_PERSONA_ID,
      programaId: TEST_PROGRAMA_ID,
    });

    expect(result.hoja.id).toBeNull();
    expect(result.hoja.estado).toBe("new");
  });

  it("returns correct header fields when no active hoja exists", async () => {
    fromMock
      .mockReturnValueOnce(singleChain({ id: TEST_PROGRAMA_ID, name: "Comedor" }))
      .mockReturnValueOnce(
        singleChain({ id: TEST_PERSONA_ID, nombre: "María", apellidos: "López" }),
      )
      .mockReturnValueOnce(singleChain(null))
      .mockReturnValueOnce(singleChain(null))
      .mockReturnValueOnce(singleChain(null));

    const caller = hojasRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.startIntervention({
      scope: "persona",
      entityId: TEST_PERSONA_ID,
      programaId: TEST_PROGRAMA_ID,
    });

    expect(result.header.nombre).toBe("María López");
    expect(result.header.programaNombre).toBe("Comedor");
    expect(result.header.profesionalNombre).toBe("Test Pro");
    expect(result.header.numUnidadFamiliar).toBeNull();
  });
});

// ─── 3. Returns existing hoja when one is active ─────────────────────────

describe("derivar.startIntervention — existing hoja path", () => {
  it("returns hoja.id and estado=activa when an active hoja exists", async () => {
    const HOJA_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    fromMock
      .mockReturnValueOnce(singleChain({ id: TEST_PROGRAMA_ID, name: "Comedor" }))
      .mockReturnValueOnce(
        singleChain({ id: TEST_PERSONA_ID, nombre: "Juan", apellidos: "Ruiz" }),
      )
      .mockReturnValueOnce(singleChain(null))
      .mockReturnValueOnce(singleChain(null))
      .mockReturnValueOnce(
        singleChain({
          id: HOJA_ID,
          fecha_apertura: "2026-01-15",
          estado: "activa",
        }),
      );

    const caller = hojasRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.startIntervention({
      scope: "persona",
      entityId: TEST_PERSONA_ID,
      programaId: TEST_PROGRAMA_ID,
    });

    expect(result.hoja.id).toBe(HOJA_ID);
    expect(result.hoja.estado).toBe("activa");
    expect(result.header.fechaAperturaISO).toBe("2026-01-15");
  });
});

// ─── 4. Defaults are populated ────────────────────────────────────────────

describe("derivar.startIntervention — defaults", () => {
  it("returns today as fechaISO in defaults", async () => {
    fromMock
      .mockReturnValueOnce(singleChain({ id: TEST_PROGRAMA_ID, name: "Comedor" }))
      .mockReturnValueOnce(
        singleChain({ id: TEST_PERSONA_ID, nombre: "Test", apellidos: null }),
      )
      .mockReturnValueOnce(singleChain(null))
      .mockReturnValueOnce(singleChain(null))
      .mockReturnValueOnce(singleChain(null));

    const today = new Date().toISOString().slice(0, 10);
    const caller = hojasRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.startIntervention({
      scope: "persona",
      entityId: TEST_PERSONA_ID,
      programaId: TEST_PROGRAMA_ID,
    });

    expect(result.defaults.fechaISO).toBe(today);
    expect(result.defaults.tipoSlug).toBeNull();
    expect(result.defaults.descripcion).toBeNull();
    expect(result.defaults.observaciones).toBeNull();
  });
});

// ─── 5. superadmin is accepted ────────────────────────────────────────────

describe("derivar.startIntervention — superadmin access", () => {
  it("accepts superadmin role", async () => {
    fromMock
      .mockReturnValueOnce(singleChain({ id: TEST_PROGRAMA_ID, name: "Comedor" }))
      .mockReturnValueOnce(
        singleChain({ id: TEST_PERSONA_ID, nombre: "Super", apellidos: "Admin" }),
      )
      .mockReturnValueOnce(singleChain(null))
      .mockReturnValueOnce(singleChain(null))
      .mockReturnValueOnce(singleChain(null));

    const caller = hojasRouter.createCaller(ctxWithRole("superadmin"));
    await expect(
      caller.startIntervention({
        scope: "persona",
        entityId: TEST_PERSONA_ID,
        programaId: TEST_PROGRAMA_ID,
      }),
    ).resolves.toBeDefined();
  });
});
