/**
 * sessions.test.ts — families.sessions.closeSession duplicate-close contract.
 *
 * MYT-136B (gh #136 item 2): closeSession (server/routers/families/sessions.ts:19-43)
 * always inserts with `closed_at: new Date().toISOString()` (L29). The DB guard
 * `uq_program_sessions_open` (supabase/migrations/20260413121654_..._create_program_sessions.sql:18-20)
 * is a PARTIAL unique index — `WHERE closed_at IS NULL` — so it only prevents two
 * simultaneously-OPEN sessions; it can never fire on a row that is inserted
 * already-closed. That means the `error.code === "23505"` catch at L34 is dead
 * code, and nothing in the procedure stops two "closed" sessions from being
 * created for the same (program_id, fecha, location_id).
 *
 * This test simulates the real partial-index semantics inside the mocked
 * Supabase client (matching the actual migration's WHERE clause exactly) and
 * asserts the procedure-level invariant the finding says is missing: closing
 * the same program/fecha/location twice must not leave two closed rows behind.
 * It fails against current HEAD because closeSession issues an unconditional
 * insert with no pre-check and no idempotency, so both inserts succeed.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

// ─── vi.mock — must precede router import ─────────────────────────────────
vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import { sessionsRouter } from "../sessions";

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
    correlationId: "families-sessions-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// In-memory stand-in for the `program_sessions` table that reproduces the
// REAL constraint shape from the migration: a UNIQUE index on
// (program_id, fecha, location_id) that only applies WHERE closed_at IS NULL.
// This is deliberately not a generic chainable mock — it exists to prove the
// partial index cannot catch an insert that already carries closed_at. It also
// mocks the pre-insert `select().eq(...).not("closed_at","is",null).maybeSingle()`
// existence check the procedure now runs (MYT-136B fix), matching real
// PostgREST filter-builder chaining (each call returns the same builder).
let rows: Array<Record<string, unknown>> = [];

function programSessionsFrom(table: string) {
  if (table !== "program_sessions") {
    throw new Error(`unexpected table in this test: ${table}`);
  }
  return {
    select: () => {
      const filters: Record<string, unknown> = {};
      let requireClosedNotNull = false;
      const builder = {
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        },
        is: (col: string, val: unknown) => {
          filters[col] = val;
          return builder;
        },
        not: (col: string, _op: string, val: unknown) => {
          if (col === "closed_at" && val === null) requireClosedNotNull = true;
          return builder;
        },
        maybeSingle: () => {
          const match = rows.find(
            (r) =>
              Object.entries(filters).every(([col, val]) => r[col] === val) &&
              (!requireClosedNotNull || r.closed_at != null)
          );
          return Promise.resolve({ data: match ?? null, error: null });
        },
      };
      return builder;
    },
    insert: (payload: Record<string, unknown>) => ({
      select: () => ({
        single: () => {
          const collidesWithOpenIndex = rows.some(
            (r) =>
              r.program_id === payload.program_id &&
              r.fecha === payload.fecha &&
              r.location_id === payload.location_id &&
              r.closed_at === null
          );
          if (collidesWithOpenIndex) {
            return Promise.resolve({
              data: null,
              error: {
                code: "23505",
                message:
                  'duplicate key value violates unique constraint "uq_program_sessions_open"',
              },
            });
          }
          const row = { id: `sess-${rows.length + 1}`, ...payload };
          rows.push(row);
          return Promise.resolve({ data: row, error: null });
        },
      }),
    }),
  };
}

beforeEach(() => {
  rows = [];
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn(programSessionsFrom),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe("families sessionsRouter.closeSession — MYT-136B duplicate closed sessions", () => {
  // MYTHOS: MYT-136B
  it("does not leave two closed sessions for the same program/fecha/location", async () => {
    const caller = sessionsRouter.createCaller(ctxWithRole("admin"));
    const input = {
      program_id: "11111111-1111-1111-1111-111111111111",
      fecha: "2026-07-24",
      location_id: "22222222-2222-2222-2222-222222222222",
      session_data: { nota: "cierre" },
    };

    await caller.closeSession(input);
    // Second close for the exact same program/fecha/location. Against real
    // Postgres this insert also carries closed_at != NULL, so
    // uq_program_sessions_open (WHERE closed_at IS NULL) never fires — the
    // mock above reproduces that precisely.
    await caller.closeSession(input);

    const closedForKey = rows.filter(
      (r) =>
        r.program_id === input.program_id &&
        r.fecha === input.fecha &&
        r.location_id === input.location_id &&
        r.closed_at != null
    );

    // MYT-136B: exactly one closed session should exist for this key. Currently
    // fails (2) because closeSession has no pre-insert dedupe/idempotency check
    // and the L34 catch("23505") can never trigger for an already-closed insert.
    expect(closedForKey.length).toBe(1);
  });
});
