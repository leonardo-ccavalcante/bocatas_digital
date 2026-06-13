/**
 * checkin.qrsig.test.ts — DB-free tests for the QR signature verification
 * block inside `verifyAndInsert`.
 *
 * Branches covered:
 *   1. Valid signed qrValue → passes the sig gate (may fail later at mocked DB)
 *   2. Tampered sig → throws FORBIDDEN
 *   3. UUID mismatch (payload UUID ≠ personId) → throws BAD_REQUEST
 *   4. Malformed qrValue (unparseable) → throws BAD_REQUEST
 *   5. No qrValue (manual path) → sig block skipped (no FORBIDDEN/BAD_REQUEST)
 *
 * Mocking strategy mirrors checkin.test.ts and familyDocuments.listAllForProgram.test.ts:
 *   - vi.mock createAdminClient so no live DB/Supabase is needed.
 *   - process.env.QR_SIGNING_SECRET set via vi.hoisted so ENV picks it up at
 *     module-load time (ENV reads process.env at evaluation, not lazily).
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { TRPCError } from "@trpc/server";
import { initTRPC } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { Logger } from "./_core/logger";

// ── Inject QR_SIGNING_SECRET before ENV module loads ─────────────────────────
// vi.hoisted runs before any import binding, so ENV.qrSigningSecret sees this.
const { TEST_SECRET } = vi.hoisted(() => {
  const TEST_SECRET = "test-qr-signing-secret-32-chars-minimum-ok";
  process.env.QR_SIGNING_SECRET = TEST_SECRET;
  return { TEST_SECRET };
});

// ── Mock Supabase — must precede router import ────────────────────────────────
// verifyAndInsert hits the DB after the sig block; mock it so tests are DB-free.
// The mock returns person=null (not_found) by default — that is fine because all
// our assertions target errors thrown *before* the DB call (sig gate) or the
// absence of such errors (manual path, valid-sig path which then hits not_found).
vi.mock("../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

// ── Import router AFTER mocks + env ──────────────────────────────────────────
import { checkinRouter } from "./routers/checkin";
import { buildQrPayload } from "../shared/qr/payload";

// ── Caller setup ─────────────────────────────────────────────────────────────
// Mirror the identity-transformer pattern from checkin.test.ts so the caller
// factory doesn't require superjson at test time.
const t = initTRPC
  .context<TrpcContext>()
  .create({ transformer: { serialize: (v: unknown) => v, deserialize: (v: unknown) => v } });

const createCaller = t.createCallerFactory(checkinRouter);

const PERSON_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const LOCATION_ID = "b0000000-0000-0000-0000-000000000001";

function voluntarioCtx(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "voluntario-open-id",
      name: "Voluntario Test",
      email: "voluntario@bocatas.org",
      role: "voluntario",
      loginMethod: "google",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "qrsig-test-correlation",
    // test mock boundary — no real HTTP req/res needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res: {} as any,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the base input common to all qr-path tests. */
function baseInput(qrValue: string) {
  return {
    personId: PERSON_ID,
    locationId: LOCATION_ID,
    programa: "comedor" as const,
    metodo: "qr_scan" as const,
    isDemoMode: false,
    qrValue,
  } as const;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("checkinRouter.verifyAndInsert — QR signature gate", () => {
  let validQrValue: string;

  beforeAll(async () => {
    // Build a properly signed QR value using the shared helper (same code path
    // that persons.getQrPayload uses in production).
    validQrValue = await buildQrPayload(PERSON_ID, TEST_SECRET);
  });

  it("valid signed qrValue passes the sig gate (proceeds to DB, returns not_found from mock)", async () => {
    const caller = createCaller(voluntarioCtx());
    // The mock DB returns person=null → not_found. That means the sig block
    // did NOT throw FORBIDDEN or BAD_REQUEST.
    const result = await caller.verifyAndInsert(baseInput(validQrValue));
    expect(result.status).toBe("not_found");
  });

  it("tampered sig (last char flipped) → throws FORBIDDEN", async () => {
    const tampered = validQrValue.slice(0, -1) + (validQrValue.endsWith("a") ? "b" : "a");
    const caller = createCaller(voluntarioCtx());
    await expect(caller.verifyAndInsert(baseInput(tampered))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("qrValue UUID ≠ personId → throws BAD_REQUEST", async () => {
    // Build a valid QR for a *different* person UUID.
    const otherUuid = "f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1";
    const otherQr = await buildQrPayload(otherUuid, TEST_SECRET);
    const caller = createCaller(voluntarioCtx());
    // personId in input still points to PERSON_ID, but the QR contains otherUuid.
    await expect(
      caller.verifyAndInsert({ ...baseInput(otherQr), personId: PERSON_ID })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("malformed qrValue (not bocatas:// URI) → throws BAD_REQUEST", async () => {
    const caller = createCaller(voluntarioCtx());
    await expect(
      caller.verifyAndInsert(baseInput("not-a-valid-qr-string"))
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("no qrValue (manual path) → sig block skipped, proceeds to DB (not_found from mock)", async () => {
    const caller = createCaller(voluntarioCtx());
    // Omitting qrValue entirely → manual-search path, no sig verification.
    const result = await caller.verifyAndInsert({
      personId: PERSON_ID,
      locationId: LOCATION_ID,
      programa: "comedor",
      metodo: "manual_busqueda",
      isDemoMode: false,
      // qrValue intentionally absent
    });
    // Not FORBIDDEN/BAD_REQUEST — the sig block was skipped.
    expect(result.status).toBe("not_found");
  });
});
