/**
 * derivar.addIntervention.test.ts
 *
 * Contract tests for derivar.addIntervention (intervencionesRouter).
 *
 * Asserts:
 *   - InterventionInsertSchema validates fecha format (YYYY-MM-DD).
 *   - InterventionInsertSchema accepts a valid minimal payload.
 *   - Role guard: voluntario is FORBIDDEN.
 *   - Snapshot is frozen from the DB when institucionId is provided but
 *     institucionSnapshot is not.
 *
 * Full integration test (DB upsert behavior) deferred to __INTEGRATION_DB__
 * suite — marked as it.todo per existing project pattern.
 *
 * Mocking pattern: chainable-mock idiom from server/__tests__/mapa-router.test.ts.
 */

import type { TRPCError } from "@trpc/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { InterventionInsertSchema } from "../../../../shared/derivar/types";
import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

// ─── vi.mock — must precede router imports ──────────────────────────────────
const fromMock = vi.fn();

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import AFTER vi.mock.
import { intervencionesRouter } from "../intervenciones";

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

// ---------------------------------------------------------------------------
// Chainable mock helpers
// ---------------------------------------------------------------------------

function maybeSingleChain<T>(data: T) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

function singleInsertChain<T>(data: T, error: null | { message: string } = null) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

// UUIDs must be valid RFC 4122 v4 (bits 12-15 = 4, bits 16-17 = 8/9/a/b).
const TEST_PERSONA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TEST_PROGRAMA_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TEST_HOJA_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TEST_INTERV_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TEST_INST_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

beforeEach(() => {
  fromMock.mockReset();
});

// ─── 1. Zod schema validation ─────────────────────────────────────────────

describe("InterventionInsertSchema — validation", () => {
  it("rejects fecha in DD/MM/YYYY format", () => {
    const r = InterventionInsertSchema.safeParse({
      scope: "persona",
      entityId: TEST_PERSONA_ID,
      programaId: TEST_PROGRAMA_ID,
      fecha: "11/02/2026",
      tipoSlug: "salud",
      descripcion: "Entrevista",
    });
    expect(r.success).toBe(false);
  });

  it("rejects fecha missing day component", () => {
    const r = InterventionInsertSchema.safeParse({
      scope: "persona",
      entityId: TEST_PERSONA_ID,
      programaId: TEST_PROGRAMA_ID,
      fecha: "2026-02",
      tipoSlug: "salud",
      descripcion: "Entrevista",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid minimal payload without optional fields", () => {
    const r = InterventionInsertSchema.safeParse({
      scope: "persona",
      entityId: TEST_PERSONA_ID,
      programaId: TEST_PROGRAMA_ID,
      fecha: "2026-02-11",
      tipoSlug: "salud",
      descripcion: "Entrevista para informe social",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid payload with all optional fields", () => {
    const r = InterventionInsertSchema.safeParse({
      scope: "familia",
      entityId: TEST_PERSONA_ID,
      programaId: TEST_PROGRAMA_ID,
      fecha: "2026-03-01",
      tipoSlug: "empleo",
      descripcion: "Derivación a taller de empleo",
      institucionId: TEST_INST_ID,
      institucionSnapshot: {
        nombre: "Cruz Roja",
        direccion: "Calle Mayor 1",
        telefono: "912345678",
        email: "info@cruzroja.es",
        codigo_postal: "28001",
      },
      observaciones: "Llamar antes de acudir",
    });
    expect(r.success).toBe(true);
  });

  it("rejects scope values outside the enum", () => {
    const r = InterventionInsertSchema.safeParse({
      scope: "organizacion",
      entityId: TEST_PERSONA_ID,
      programaId: TEST_PROGRAMA_ID,
      fecha: "2026-02-11",
      tipoSlug: "salud",
      descripcion: "Entrevista",
    });
    expect(r.success).toBe(false);
  });
});

// ─── 2. Role guard ─────────────────────────────────────────────────────────

describe("derivar.addIntervention — role guard", () => {
  it("rejects voluntario with FORBIDDEN", async () => {
    const caller = intervencionesRouter.createCaller(
      // Force incorrect role by casting — this is testing the middleware, not TS.
      {
        user: { id: 1, openId: "x", email: "v@b.org", name: "V", loginMethod: "manus", role: "voluntario", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
        logger: new Logger(),
        correlationId: "t",
        req: {} as TrpcContext["req"],
        res: {} as TrpcContext["res"],
      } as TrpcContext,
    );
    await expect(
      caller.addIntervention({
        scope: "persona",
        entityId: TEST_PERSONA_ID,
        programaId: TEST_PROGRAMA_ID,
        fecha: "2026-02-11",
        tipoSlug: "salud",
        descripcion: "Test",
      }),
    ).rejects.toMatchObject({
      name: "TRPCError",
      code: "FORBIDDEN",
    } satisfies Partial<TRPCError>);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

// ─── 3. Snapshot freezing ─────────────────────────────────────────────────

describe("derivar.addIntervention — institucion_snapshot freezing", () => {
  it("fetches and freezes snapshot when institucionId is given but no snapshot provided", async () => {
    const mockInstitucion = {
      nombre: "Cruz Roja",
      direccion: "Calle Mayor 1",
      telefono: "912345678",
      email: "info@cruzroja.es",
      codigo_postal: "28001",
    };

    // Call order: derivacion_hojas(find existing) → instituciones(fetch) → derivacion_intervenciones(insert)
    fromMock
      // 1. Find existing hoja — returns one so we don't create
      .mockReturnValueOnce(
        maybeSingleChain({ id: TEST_HOJA_ID, fecha_apertura: "2026-01-01" }),
      )
      // 2. Fetch institucion for snapshot
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockInstitucion, error: null }),
      })
      // 3. Insert intervention
      .mockReturnValueOnce(
        singleInsertChain({ id: TEST_INTERV_ID }),
      );

    const caller = intervencionesRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.addIntervention({
      scope: "persona",
      entityId: TEST_PERSONA_ID,
      programaId: TEST_PROGRAMA_ID,
      fecha: "2026-02-11",
      tipoSlug: "salud",
      descripcion: "Entrevista derivación",
      institucionId: TEST_INST_ID,
      // No institucionSnapshot — router must fetch and freeze it
    });

    expect(result.hojaId).toBe(TEST_HOJA_ID);
    expect(result.intervencionId).toBe(TEST_INTERV_ID);

    // Verify the insert call received a frozen snapshot
    const insertChainInstance = fromMock.mock.results[2].value;
    const insertedData = insertChainInstance.insert.mock.calls[0][0] as {
      institucion_snapshot: typeof mockInstitucion | null;
    };
    expect(insertedData.institucion_snapshot).toEqual(mockInstitucion);
  });

  it("uses provided snapshot directly without fetching from DB", async () => {
    const providedSnapshot = {
      nombre: "Cruz Roja Local",
      direccion: null,
      telefono: null,
      email: null,
      codigo_postal: null,
    };

    fromMock
      .mockReturnValueOnce(
        maybeSingleChain({ id: TEST_HOJA_ID, fecha_apertura: "2026-01-01" }),
      )
      // No instituciones call expected
      .mockReturnValueOnce(singleInsertChain({ id: TEST_INTERV_ID }));

    const caller = intervencionesRouter.createCaller(ctxWithRole("admin"));
    await caller.addIntervention({
      scope: "persona",
      entityId: TEST_PERSONA_ID,
      programaId: TEST_PROGRAMA_ID,
      fecha: "2026-02-11",
      tipoSlug: "salud",
      descripcion: "Entrevista",
      institucionId: TEST_INST_ID,
      institucionSnapshot: providedSnapshot,
    });

    // Only 2 from() calls: hojas + intervenciones (no instituciones call)
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it.todo(
    "(integration) addIntervention upserts hoja when none exists (requires local Supabase)",
  );
});
