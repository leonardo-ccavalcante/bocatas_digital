/**
 * followUps.test.ts — families.createFollowUp / listFollowUps / getLatestFollowUp
 *
 * Uses the chainable-Supabase mock idiom from crud.test.ts:
 * createAdminClient is replaced by a factory returning { from: fromMock },
 * and each test installs a chain that resolves the expected shape.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

// ─── vi.mock — must precede router import ─────────────────────────────────
const fromMock = vi.fn();

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import AFTER vi.mock is registered.
import { followUpsRouter } from "../follow-ups";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctxWithRole(role: AuthenticatedUser["role"]): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
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
    correlationId: "followups-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const FAMILY_ID = "11111111-1111-1111-1111-111111111111";
const FOLLOW_UP_ID = "22222222-2222-2222-2222-222222222222";
const VALID_DATE = "2026-05-21";

beforeEach(() => {
  fromMock.mockReset();
});

// ─── createFollowUp ────────────────────────────────────────────────────────

describe("families.createFollowUp", () => {
  it("inserts a record and returns its id", async () => {
    const expectedRow = {
      id: FOLLOW_UP_ID,
      family_id: FAMILY_ID,
      fecha: VALID_DATE,
      notas: "Primera visita de seguimiento",
      created_at: new Date().toISOString(),
    };

    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve({ data: expectedRow, error: null })),
    };
    fromMock.mockReturnValueOnce(chain);

    const caller = followUpsRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.createFollowUp({
      family_id: FAMILY_ID,
      fecha: VALID_DATE,
      notas: "Primera visita de seguimiento",
    });

    expect(result.id).toBe(FOLLOW_UP_ID);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        family_id: FAMILY_ID,
        fecha: VALID_DATE,
        created_by: "42",
      })
    );
  });

  it("throws INTERNAL_SERVER_ERROR when insert fails", async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(() =>
        Promise.resolve({ data: null, error: { message: "db error" } })
      ),
    };
    fromMock.mockReturnValueOnce(chain);

    const caller = followUpsRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.createFollowUp({ family_id: FAMILY_ID, fecha: VALID_DATE })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("rejects an invalid fecha format", async () => {
    const caller = followUpsRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.createFollowUp({ family_id: FAMILY_ID, fecha: "21-05-2026" })
    ).rejects.toThrow();
  });
});

// ─── listFollowUps ─────────────────────────────────────────────────────────

describe("families.listFollowUps", () => {
  it("returns rows for a family", async () => {
    const rows = [
      { id: FOLLOW_UP_ID, family_id: FAMILY_ID, fecha: VALID_DATE, notas: null, created_by: "42", created_at: "" },
    ];

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    };
    fromMock.mockReturnValueOnce(chain);

    const caller = followUpsRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.listFollowUps({ family_id: FAMILY_ID });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(FOLLOW_UP_ID);
  });

  it("returns an empty array when there are no rows", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    fromMock.mockReturnValueOnce(chain);

    const caller = followUpsRouter.createCaller(ctxWithRole("admin"));
    const result = await caller.listFollowUps({ family_id: FAMILY_ID });

    expect(result).toEqual([]);
  });

  it("throws INTERNAL_SERVER_ERROR on query error", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn(() => Promise.resolve({ data: null, error: { message: "query error" } })),
    };
    fromMock.mockReturnValueOnce(chain);

    const caller = followUpsRouter.createCaller(ctxWithRole("admin"));
    await expect(
      caller.listFollowUps({ family_id: FAMILY_ID })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

// ─── getLatestFollowUp ─────────────────────────────────────────────────────

describe("families.getLatestFollowUp", () => {
  it("returns the most recent follow-up record", async () => {
    const row = { id: FOLLOW_UP_ID, fecha: VALID_DATE, notas: "Notas" };

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
    };
    fromMock.mockReturnValueOnce(chain);

    const caller = followUpsRouter.createCaller(ctxWithRole("voluntario"));
    const result = await caller.getLatestFollowUp({ family_id: FAMILY_ID });

    expect(result).not.toBeNull();
    expect(result?.id).toBe(FOLLOW_UP_ID);
  });

  it("returns null when no follow-up exists", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    fromMock.mockReturnValueOnce(chain);

    const caller = followUpsRouter.createCaller(ctxWithRole("voluntario"));
    const result = await caller.getLatestFollowUp({ family_id: FAMILY_ID });

    expect(result).toBeNull();
  });

  it("is accessible to voluntario role", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    fromMock.mockReturnValueOnce(chain);

    const caller = followUpsRouter.createCaller(ctxWithRole("voluntario"));
    await expect(
      caller.getLatestFollowUp({ family_id: FAMILY_ID })
    ).resolves.toBeNull();
  });
});
