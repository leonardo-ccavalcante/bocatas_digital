/**
 * checkin.dynamicPrograms.test.ts — check-in must accept ANY program slug
 * from the programs catalog, not a hardcoded enum.
 *
 * Regression target: creating a program via the admin UI produced a program
 * whose check-in always failed, because `programa` was validated against the
 * 6 seeded slugs (still including the renamed `familia`). The DB no longer
 * has that restriction (`attendances.programa` is text + FK to programs.slug),
 * so the Zod layer must not reintroduce it. Unknown-but-well-formed slugs are
 * rejected by the FK (23503) and surfaced as BAD_REQUEST.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { initTRPC } from "@trpc/server";
import { createAdminClient } from "../client/src/lib/supabase/server";
import { checkinRouter } from "./routers/checkin";
import type { TrpcContext } from "./_core/context";
import { Logger } from "./_core/logger";

vi.mock("../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(),
}));

const t = initTRPC.context<TrpcContext>().create({
  transformer: { serialize: (v: unknown) => v, deserialize: (v: unknown) => v },
});
const createCaller = t.createCallerFactory(checkinRouter);

const caller = createCaller({
  user: {
    id: 1,
    openId: "test-open-id",
    name: "Test User",
    email: "test@test.com",
    role: "admin",
    loginMethod: "google",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  logger: new Logger(),
  correlationId: "test-correlation-id",
  // test mock boundary — Supabase client mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: {} as any,
  // test mock boundary — Supabase client mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: {} as any,
});

const PERSON_ID = "b0000000-0000-0000-0000-000000000002";
const LOCATION_ID = "a0000000-0000-0000-0000-000000000001";

/** Chainable Supabase mock: persons_safe finds the person, attendances has
 * no duplicate, and insert/upsert resolve with the given result. */
function mockSupabase({ insertError = null }: { insertError?: { code: string; message: string } | null } = {}) {
  const attendanceChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ error: insertError }),
    upsert: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({
        data: [{ person_id: PERSON_ID, location_id: LOCATION_ID, programa: "curso_cocina_enero", checked_in_date: "2099-01-01" }],
        error: null,
      }),
    })),
  };
  const personsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { id: PERSON_ID, restricciones_alimentarias: null },
      error: null,
    }),
  };
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn((table: string) => (table === "persons_safe" ? personsChain : attendanceChain)),
    // test mock boundary — Supabase client mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return { attendanceChain, personsChain };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkinRouter — dynamic program slugs", () => {
  it("verifyAndInsert accepts a slug created via the admin UI (not in the seeded six)", async () => {
    mockSupabase();
    const result = await caller.verifyAndInsert({
      personId: PERSON_ID,
      locationId: LOCATION_ID,
      programa: "curso_cocina_enero",
      metodo: "manual_busqueda",
      isDemoMode: false,
    });
    expect(result.status).toBe("registered");
  });

  it("anonymousCheckin accepts a dynamic slug", async () => {
    mockSupabase();
    const result = await caller.anonymousCheckin({
      locationId: LOCATION_ID,
      programa: "reparto_calle_canada",
      isDemoMode: false,
    });
    expect(result.status).toBe("registered");
  });

  it("syncOfflineQueue accepts dynamic slugs in queued items", async () => {
    mockSupabase();
    const results = await caller.syncOfflineQueue([
      {
        clientId: "c0000000-0000-0000-0000-000000000009",
        personId: PERSON_ID,
        locationId: LOCATION_ID,
        programa: "curso_cocina_enero",
        metodo: "qr_scan",
        isDemoMode: false,
        queuedAt: "2099-01-01T10:00:00.000Z",
      },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("synced");
  });

  it("verifyAndInsert still rejects malformed slugs at the Zod layer", async () => {
    mockSupabase();
    await expect(
      caller.verifyAndInsert({
        personId: PERSON_ID,
        locationId: LOCATION_ID,
        programa: "Curso-Cocina Enero!",
        metodo: "qr_scan",
        isDemoMode: false,
      })
    ).rejects.toThrow();
  });

  it("verifyAndInsert maps an unknown slug (FK 23503) to BAD_REQUEST 'Programa desconocido'", async () => {
    mockSupabase({
      insertError: { code: "23503", message: 'violates foreign key constraint "fk_attendances_programa"' },
    });
    await expect(
      caller.verifyAndInsert({
        personId: PERSON_ID,
        locationId: LOCATION_ID,
        programa: "programa_que_no_existe",
        metodo: "manual_busqueda",
        isDemoMode: false,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Programa desconocido") });
  });

  it("anonymousCheckin maps an unknown slug (FK 23503) to BAD_REQUEST", async () => {
    mockSupabase({
      insertError: { code: "23503", message: 'violates foreign key constraint "fk_attendances_programa"' },
    });
    await expect(
      caller.anonymousCheckin({
        locationId: LOCATION_ID,
        programa: "programa_que_no_existe",
        isDemoMode: false,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
