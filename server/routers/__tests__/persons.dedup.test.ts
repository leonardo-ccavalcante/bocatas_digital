/**
 * persons.dedup.test.ts — Unit tests for the resolveMemberPersonId dedup helper.
 *
 * The helper is in server/routers/families/_shared.ts but its dedup logic is
 * persons-domain (matches by nombre + apellidos + fecha_nacimiento). These
 * tests pin its behavior so we don't accidentally break it during Gate 1
 * persons work.
 *
 * Behavior under test:
 *   1. If `member.person_id` is provided → return it directly (caller owns it).
 *   2. Exact match on (nombre, apellidos, fecha_nacimiento) → return existing id.
 *   3. No match → INSERT a new persons row and return the new id.
 *   4. Insert failure → throws TRPCError.
 *
 * The "phone-only" warning case from the plan is NOT implemented today
 * (Gate 2 fuzzy dedup); we deliberately do not test for behavior that
 * does not exist (Karpathy: surgical, no speculative tests).
 *
 * Mocking pattern source: server/checkin.test.ts (vi.mock on the Supabase
 * server module so we never construct a real Supabase client type).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

interface QueryResult<T> {
  data: T;
  error: null | { message: string };
}

const fromMock = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import AFTER vi.mock is registered.
import { resolveMemberPersonId } from "../families/_shared";
import { createAdminClient } from "../../../client/src/lib/supabase/server";

function selectChain(result: QueryResult<Array<{ id: string }>>) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

function insertChain(result: QueryResult<{ id: string } | null>) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("resolveMemberPersonId — dedup helper", () => {
  it("returns provided person_id directly without DB calls", async () => {
    const db = createAdminClient();

    const result = await resolveMemberPersonId(db, {
      nombre: "Juan",
      apellidos: "García",
      person_id: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns existing person id on exact (nombre, apellidos, fecha_nacimiento) match", async () => {
    fromMock.mockReturnValueOnce(
      selectChain({ data: [{ id: "existing-person-id" }], error: null })
    );
    const db = createAdminClient();

    const result = await resolveMemberPersonId(db, {
      nombre: "Juan",
      apellidos: "García",
      fecha_nacimiento: "1990-01-01",
    });

    expect(result).toBe("existing-person-id");
  });

  it("inserts a new persons row when no match is found and returns new id", async () => {
    fromMock
      .mockReturnValueOnce(selectChain({ data: [], error: null }))
      .mockReturnValueOnce(
        insertChain({ data: { id: "freshly-created-id" }, error: null })
      );
    const db = createAdminClient();

    const result = await resolveMemberPersonId(db, {
      nombre: "Maria",
      apellidos: "Lopez",
      fecha_nacimiento: "1985-05-15",
      documento: "X1234567",
    });

    expect(result).toBe("freshly-created-id");
  });

  it("throws TRPCError when insert fails", async () => {
    fromMock
      .mockReturnValueOnce(selectChain({ data: [], error: null }))
      .mockReturnValueOnce(
        insertChain({ data: null, error: { message: "DB write failed" } })
      );
    const db = createAdminClient();

    await expect(
      resolveMemberPersonId(db, {
        nombre: "Carlos",
        apellidos: "Ruiz",
        fecha_nacimiento: "1992-02-02",
      })
    ).rejects.toThrow(TRPCError);
  });
});
