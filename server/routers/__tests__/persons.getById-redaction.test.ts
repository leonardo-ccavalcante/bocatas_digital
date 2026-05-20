/**
 * persons.getById-redaction.test.ts — TECH_DEBT C-01 (P1 PII leak).
 *
 * persons.getById is a protectedProcedure that used createAdminClient()
 * (service role, bypasses RLS) + .select("*") + raw return — so any
 * authenticated voluntario received the high-risk PII fields. CLAUDE.md §3
 * restricts these to admin/superadmin. This test locks the redaction
 * boundary (mirrors families.getById).
 *
 * Mocking pattern: server/__tests__/mapa-router.test.ts.
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
    correlationId: "persons-getbyid-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// A full persons row including every high-risk + restricted field.
const FULL_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  nombre: "Ana",
  apellidos: "García",
  fase_itinerario: 1,
  situacion_legal: "irregular",
  recorrido_migratorio: "ruta detallada",
  foto_documento_url: "https://x/doc.jpg",
  notas_privadas: "nota sensible del trabajador social",
};

function mockGetByIdChain(row: Record<string, unknown> | null) {
  const result = { data: row, error: null };
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

const HIGH_RISK = [
  "situacion_legal",
  "recorrido_migratorio",
  "foto_documento_url",
  "notas_privadas",
] as const;

beforeEach(() => {
  fromMock.mockReset();
});

describe("persons.getById — high-risk PII redaction (C-01)", () => {
  it("strips ALL high-risk + restricted fields for a voluntario", async () => {
    fromMock.mockReturnValueOnce(mockGetByIdChain({ ...FULL_ROW }));
    const caller = crudRouter.createCaller(ctxWithRole("voluntario"));
    const result = (await caller.getById({ id: FULL_ROW.id })) as Record<
      string,
      unknown
    >;
    for (const field of HIGH_RISK) {
      expect(result[field]).toBeUndefined();
    }
    // Non-sensitive fields still present.
    expect(result.nombre).toBe("Ana");
    expect(result.fase_itinerario).toBe(1);
  });

  it("returns high-risk fields to an admin", async () => {
    fromMock.mockReturnValueOnce(mockGetByIdChain({ ...FULL_ROW }));
    const caller = crudRouter.createCaller(ctxWithRole("admin"));
    const result = (await caller.getById({ id: FULL_ROW.id })) as Record<
      string,
      unknown
    >;
    expect(result.situacion_legal).toBe("irregular");
    expect(result.recorrido_migratorio).toBe("ruta detallada");
    expect(result.foto_documento_url).toBe("https://x/doc.jpg");
  });

  it("returns high-risk fields to a superadmin", async () => {
    fromMock.mockReturnValueOnce(mockGetByIdChain({ ...FULL_ROW }));
    const caller = crudRouter.createCaller(ctxWithRole("superadmin"));
    const result = (await caller.getById({ id: FULL_ROW.id })) as Record<
      string,
      unknown
    >;
    expect(result.situacion_legal).toBe("irregular");
  });

  it("does not leak the raw DB error message to the client (C-05)", async () => {
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "XX000", message: "duplicate key value violates ... telefono=+34600..." },
      }),
    });
    const caller = crudRouter.createCaller(ctxWithRole("admin"));
    // Single call; capture the rejection so we assert on the real message.
    const err = await caller.getById({ id: FULL_ROW.id }).then(
      () => {
        throw new Error("expected getById to reject");
      },
      (e: { message: string }) => e,
    );
    // The raw Supabase message (which can echo PII) must NOT reach the client.
    expect(err.message).not.toContain("telefono");
    expect(err.message).not.toContain("+34600");
  });
});
