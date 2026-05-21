/**
 * entregas.recordSignature.test.ts — REAL procedure integration test.
 *
 * Unlike firma.audit.test.ts (which asserts only against a mock-shape helper
 * and never invokes the production code), this file invokes the ACTUAL
 * `entregas.recordSignature` procedure (server/routers/entregas/signature.ts)
 * through `appRouter.createCaller(ctx)` with a mocked Supabase admin client.
 * This closes the known false-green gap by proving the real procedure's
 * behavior end-to-end (auth → guards → IP hash → upload → patch → audit insert).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Configurable mock state (reset in beforeEach) ──────────────────────────
// deliveries row returned by the deliveries SELECT chain.
let deliveriesRow: { id: string; firma_url: string | null } | null = null;
// app_settings "value" row returned by the salt SELECT chain.
let appSettingsRow: { value: string } | null = null;

// Captured calls for assertions.
let insertPayload: Record<string, unknown> | null = null;
let updatePayload: Record<string, unknown> | null = null;
const uploadCalls: Array<{ path: string; opts: unknown }> = [];
const removeCalls: string[][] = [];

// Configurable terminal-call errors (reset in beforeEach). Default null = success.
let uploadError: { message: string } | null = null;
let patchError: { message: string } | null = null;
let auditError: { code?: string; message: string } | null = null;

// Mock the Supabase admin client BEFORE importing appRouter (hoisting + import
// order matters — vi.mock is hoisted above imports, but the module graph must
// resolve the mock when appRouter pulls in signature.ts).
vi.mock("../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      // deliveries: .select(...).eq(...).is(...).maybeSingle()
      // app_settings: .select(...).eq(...).maybeSingle()
      // The .eq() result exposes BOTH .is() and .maybeSingle() so both
      // chains resolve against the same mocked shape.
      select: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: async () => {
              if (table === "deliveries") {
                return { data: deliveriesRow, error: null };
              }
              return { data: appSettingsRow, error: null };
            },
          }),
          maybeSingle: async () => {
            if (table === "app_settings") {
              return { data: appSettingsRow, error: null };
            }
            return { data: deliveriesRow, error: null };
          },
        }),
      }),
      // deliveries: .update(payload).eq(...)
      update: (payload: Record<string, unknown>) => ({
        eq: async () => {
          updatePayload = payload;
          return { error: patchError };
        },
      }),
      // delivery_signature_audit: .insert(payload).select(...).single()
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            insertPayload = payload;
            if (auditError) {
              return { data: null, error: auditError };
            }
            return {
              data: {
                id: "11111111-2222-4333-8444-555555555555",
                delivery_id: payload.delivery_id,
                signer_person_id: payload.signer_person_id,
                signed_at: "2026-05-21T10:00:00.000Z",
                ...payload,
              },
              error: null,
            };
          },
        }),
      }),
    }),
    storage: {
      from: () => ({
        upload: async (path: string, _buf: unknown, opts: unknown) => {
          uploadCalls.push({ path, opts });
          return { error: uploadError };
        },
        remove: async (paths: string[]) => {
          removeCalls.push(paths);
          return { data: null, error: null };
        },
      }),
    },
  }),
}));

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import type { User } from "../../drizzle/schema";

// ─── Test fixtures ──────────────────────────────────────────────────────────
const SIG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const deliveryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const signerPersonId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function buildUser(role: User["role"], id = 1): User {
  return {
    id,
    openId: `manus-${id}`,
    name: "Test User",
    email: "test@example.com",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as User;
}

function buildCtx(user: User | null): TrpcContext {
  return {
    req: {
      headers: { "x-forwarded-for": "192.0.2.1" },
      socket: { remoteAddress: "203.0.113.1" },
    } as never,
    res: {} as never,
    user,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    correlationId: "test-corr",
  };
}

describe("entregas.recordSignature (real procedure)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deliveriesRow = { id: deliveryId, firma_url: null };
    appSettingsRow = { value: "daily-salt-abc" };
    insertPayload = null;
    updatePayload = null;
    uploadCalls.length = 0;
    removeCalls.length = 0;
    uploadError = null;
    patchError = null;
    auditError = null;
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(buildCtx(null));
    await expect(
      caller.entregas.recordSignature({
        deliveryId,
        signerPersonId,
        signatureDataUrl: SIG,
      })
    ).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED|restringido/i);
  });

  it("rejects beneficiario role", async () => {
    const caller = appRouter.createCaller(buildCtx(buildUser("beneficiario")));
    await expect(
      caller.entregas.recordSignature({
        deliveryId,
        signerPersonId,
        signatureDataUrl: SIG,
      })
    ).rejects.toThrow(/FORBIDDEN|restringido/i);
  });

  it("happy path (voluntario) uploads, patches firma_url, and inserts audit without signed_at", async () => {
    deliveriesRow = { id: deliveryId, firma_url: null };
    appSettingsRow = { value: "daily-salt-abc" };
    const caller = appRouter.createCaller(buildCtx(buildUser("voluntario")));

    const result = await caller.entregas.recordSignature({
      deliveryId,
      signerPersonId,
      signatureDataUrl: SIG,
    });

    expect(result).toMatchObject({
      id: expect.any(String),
      delivery_id: deliveryId,
      signer_person_id: signerPersonId,
      signed_at: expect.any(String),
    });

    // Upload called exactly once with the expected dated path.
    expect(uploadCalls.length).toBe(1);
    expect(uploadCalls[0].path).toMatch(
      new RegExp(`^firmas-entregas/${deliveryId}/\\d{4}-\\d{2}-\\d{2}\\.png$`)
    );

    // T2 contract: audit insert payload MUST NOT supply signed_at.
    expect(insertPayload).not.toBeNull();
    expect(insertPayload).not.toHaveProperty("signed_at");

    // Salt + x-forwarded-for present → 64-char lowercase hex hash.
    expect(insertPayload?.client_ip_hash).toMatch(/^[0-9a-f]{64}$/);

    // deliveries.update set firma_url to the storage path.
    expect(updatePayload).not.toBeNull();
    expect(updatePayload?.firma_url).toBe(uploadCalls[0].path);
  });

  it("sets client_ip_hash to null when salt is absent (F-6 tolerance) and still succeeds", async () => {
    deliveriesRow = { id: deliveryId, firma_url: null };
    appSettingsRow = null; // no salt row
    const caller = appRouter.createCaller(buildCtx(buildUser("voluntario")));

    const result = await caller.entregas.recordSignature({
      deliveryId,
      signerPersonId,
      signatureDataUrl: SIG,
    });

    expect(result).toMatchObject({ delivery_id: deliveryId });
    expect(insertPayload).not.toBeNull();
    expect(insertPayload?.client_ip_hash).toBeNull();
  });

  it("throws NOT_FOUND when the delivery does not exist and does not upload", async () => {
    deliveriesRow = null;
    const caller = appRouter.createCaller(buildCtx(buildUser("voluntario")));

    await expect(
      caller.entregas.recordSignature({
        deliveryId,
        signerPersonId,
        signatureDataUrl: SIG,
      })
    ).rejects.toThrow(/NOT_FOUND|no encontrada/i);

    expect(uploadCalls.length).toBe(0);
  });

  it("throws CONFLICT when the delivery is already signed and does not upload", async () => {
    deliveriesRow = {
      id: deliveryId,
      firma_url: "firmas-entregas/x/2026-01-01.png",
    };
    const caller = appRouter.createCaller(buildCtx(buildUser("voluntario")));

    await expect(
      caller.entregas.recordSignature({
        deliveryId,
        signerPersonId,
        signatureDataUrl: SIG,
      })
    ).rejects.toThrow(/CONFLICT|Ya existe/i);

    expect(uploadCalls.length).toBe(0);
  });

  // ─── Failure-path coverage (F-4, F-5, F-2) ────────────────────────────────
  it("F-4: upload failure aborts cleanly with no DB state changes", async () => {
    uploadError = { message: "boom" };
    const caller = appRouter.createCaller(buildCtx(buildUser("voluntario")));

    await expect(
      caller.entregas.recordSignature({
        deliveryId,
        signerPersonId,
        signatureDataUrl: SIG,
      })
    ).rejects.toThrow(/INTERNAL_SERVER_ERROR|subir la firma/i);

    // Upload was attempted, but no DB write happened.
    expect(uploadCalls.length).toBe(1);
    expect(updatePayload).toBeNull();
    expect(insertPayload).toBeNull();
  });

  it("F-5: patch failure triggers best-effort storage cleanup and no audit insert", async () => {
    patchError = { message: "patch failed" };
    const caller = appRouter.createCaller(buildCtx(buildUser("voluntario")));

    await expect(
      caller.entregas.recordSignature({
        deliveryId,
        signerPersonId,
        signatureDataUrl: SIG,
      })
    ).rejects.toThrow(/INTERNAL_SERVER_ERROR|registrar la firma/i);

    // Cleanup removed the orphaned object at the uploaded path.
    expect(uploadCalls.length).toBe(1);
    expect(removeCalls.length).toBe(1);
    expect(removeCalls[0]).toContain(uploadCalls[0].path);
    // No audit row was inserted.
    expect(insertPayload).toBeNull();
  });

  it("F-2: audit insert FK violation (23503) maps to BAD_REQUEST", async () => {
    auditError = { code: "23503", message: "fk" };
    const caller = appRouter.createCaller(buildCtx(buildUser("voluntario")));

    await expect(
      caller.entregas.recordSignature({
        deliveryId,
        signerPersonId,
        signatureDataUrl: SIG,
      })
    ).rejects.toThrow(/BAD_REQUEST|no existe/i);
  });
});
