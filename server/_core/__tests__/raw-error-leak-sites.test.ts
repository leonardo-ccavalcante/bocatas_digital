/**
 * raw-error-leak-sites.test.ts — cassandra follow-up to the errorFormatter
 * boundary (THE-01 / SIS-02 / CAS-03).
 *
 * The errorFormatter only scrubs THROWN INTERNAL_SERVER_ERRORs. Two leak
 * classes slip past it and must be closed at the call site:
 *
 *   BLOCKER 1 — raw `error.message` thrown under a *client* code (BAD_REQUEST)
 *   in entregas/crud.ts. The formatter passes client codes through untouched,
 *   so the raw Postgres text (constraint name + column VALUES = PII) would
 *   reach the client.
 *
 *   BLOCKER 2 — raw `error.message` RETURNED inside a 200-response payload
 *   (checkin.syncOfflineQueue — the offline batch-sync path every volunteer
 *   device hits). A returned payload never reaches the errorFormatter at all.
 *
 * These tests run the REAL resolvers via createCaller with a mocked Supabase
 * client that fails with a PII-laden Postgres error, and assert the client-
 * facing text is generic, never the raw error. They also assert the PII-safe
 * stderr log (BLOCKER 3): it carries correlationId + Postgres CODE but NOT the
 * raw message / PII value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../context";
import type { User } from "../../../drizzle/schema";

// A raw Postgres error whose message embeds a PII value (phone number) and a
// schema-internal constraint name — exactly what must never reach the client.
const RAW_DB_LEAK =
  'duplicate key value violates unique constraint "deliveries_family_fecha_key" DETAIL: Key (recogido_por)=(+34600111222) already exists.';
const PII_VALUE = "+34600111222";
const CONSTRAINT_NAME = "deliveries_family_fecha_key";
const PG_CODE = "23505";

// ─── Supabase mock: every write/upsert fails with the PII-laden error ────────
const failingError = { message: RAW_DB_LEAK, code: PG_CODE };

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      // entregas.createDelivery: insert().select().single()
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: failingError }),
        }),
      }),
      // checkin.syncOfflineQueue: upsert().select()
      upsert: () => ({
        select: async () => ({ data: null, error: failingError }),
      }),
    }),
  }),
  createServerClient: vi.fn(),
}));

// Import resolvers AFTER the mock is registered.
import { crudRouter } from "../../routers/entregas/crud";
import { checkinRouter } from "../../routers/checkin";

function buildUser(role: User["role"]): User {
  return {
    id: 1,
    openId: "manus-1",
    name: "Vol",
    email: "v@example.com",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as User;
}

function buildCtx(role: User["role"]): TrpcContext {
  return {
    req: {} as never,
    res: {} as never,
    user: buildUser(role),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    correlationId: "11111111-1111-4111-8111-111111111111",
  };
}

let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  stderrSpy.mockRestore();
});

describe("BLOCKER 1 — entregas BAD_REQUEST no longer leaks raw DB text", () => {
  it("createDelivery returns a curated Spanish message, not the raw Postgres error", async () => {
    const caller = crudRouter.createCaller(buildCtx("voluntario"));
    let thrown: unknown;
    try {
      await caller.createDelivery({
        family_id: "22222222-2222-4222-8222-222222222222",
        fecha_entrega: "2026-06-12",
      } as never);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(TRPCError);
    const msg = (thrown as TRPCError).message;

    // The client message must be the curated string — never the raw DB text,
    // the constraint name, or the PII value inside it.
    expect(msg).toBe("No se pudo registrar la entrega.");
    expect(msg).not.toContain(RAW_DB_LEAK);
    expect(msg).not.toContain(PII_VALUE);
    expect(msg).not.toContain(CONSTRAINT_NAME);
  });

  it("logs the failure to stderr PII-safely (correlationId + pgCode, no raw message)", async () => {
    const caller = crudRouter.createCaller(buildCtx("voluntario"));
    await caller
      .createDelivery({
        family_id: "22222222-2222-4222-8222-222222222222",
        fecha_entrega: "2026-06-12",
      } as never)
      .catch(() => undefined);

    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const logged = String(stderrSpy.mock.calls[0]?.[0]);
    // Safe structured fields are present...
    expect(logged).toContain("11111111-1111-4111-8111-111111111111"); // correlationId
    expect(logged).toContain(PG_CODE); // Postgres SQLSTATE
    expect(logged).toContain("entregas.createDelivery"); // path
    // ...and the raw message / PII never is.
    expect(logged).not.toContain(PII_VALUE);
    expect(logged).not.toContain(CONSTRAINT_NAME);
    expect(logged).not.toContain(RAW_DB_LEAK);
  });
});

describe("BLOCKER 2 — checkin offline-sync payload no longer leaks raw DB text", () => {
  it("syncOfflineQueue whole-batch failure returns a generic error string, not raw DB text", async () => {
    const caller = checkinRouter.createCaller(buildCtx("voluntario"));
    const result = await caller.syncOfflineQueue([
      {
        clientId: "33333333-3333-4333-8333-333333333333",
        personId: "44444444-4444-4444-8444-444444444444",
        locationId: "55555555-5555-4555-8555-555555555555",
        programa: "comedor",
        metodo: "qr_scan",
        isDemoMode: false,
        queuedAt: "2026-06-12T10:00:00.000Z",
      },
    ] as never);

    expect(Array.isArray(result)).toBe(true);
    const row = (result as Array<{ status: string; error?: string }>)[0];
    expect(row.status).toBe("error");
    // Generic Spanish string — never the raw DB text or PII value.
    expect(row.error).toBe("No se pudo sincronizar el registro.");
    expect(row.error).not.toContain(PII_VALUE);
    expect(row.error).not.toContain(CONSTRAINT_NAME);
    expect(row.error).not.toContain(RAW_DB_LEAK);

    // And the raw error is logged PII-safely to stderr for correlation.
    const logged = String(stderrSpy.mock.calls[0]?.[0]);
    expect(logged).toContain("checkin.syncOfflineQueue");
    expect(logged).toContain(PG_CODE);
    expect(logged).not.toContain(PII_VALUE);
  });
});
