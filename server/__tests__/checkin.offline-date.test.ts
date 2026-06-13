/**
 * checkin.offline-date.test.ts — regression for ARG-02 (Mythos audit).
 *
 * Bug: syncOfflineQueue pinned `checked_in_date` (and let `checked_in_at`
 * default to now()) at the SERVER FLUSH time, discarding each item's
 * `queuedAt`. A check-in captured offline at 23:55 and flushed after midnight
 * was recorded on the WRONG day — corrupting the funder-facing date and the
 * unique-constraint key the result mapping compares against.
 *
 * Fix: derive `checked_in_date` + `checked_in_at` per item from `queuedAt`.
 *
 * Hermetic: the admin client is mocked; we capture the rows handed to
 * `.upsert()` and assert they carry the queue-time date, not today.
 *
 * MYTHOS: ARG-02
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture whatever syncOfflineQueue hands to .upsert(); echo it back as the
// inserted rows so the result mapping (which keys off the returned rows) works.
let capturedRows: Array<Record<string, unknown>> = [];
const selectMock = vi.fn().mockImplementation(() =>
  Promise.resolve({ data: capturedRows, error: null })
);
const upsertMock = vi.fn().mockImplementation((rows: Array<Record<string, unknown>>) => {
  capturedRows = rows;
  return { select: selectMock };
});
vi.mock("../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({ upsert: upsertMock })),
  })),
}));

import { initTRPC } from "@trpc/server";
import { checkinRouter } from "../routers/checkin";
import type { TrpcContext } from "../_core/context";
import { Logger } from "../_core/logger";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: {} as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: {} as any,
});

describe("checkin.syncOfflineQueue — ARG-02 offline date", () => {
  beforeEach(() => {
    capturedRows = [];
    vi.clearAllMocks();
  });

  it("records checked_in_date + checked_in_at from queuedAt, not the flush time", async () => {
    // A late-night offline check-in captured well in the past — `today` can
    // never coincide with it, so the assertion is deterministic.
    const queuedAt = "2020-01-15T23:55:00.000Z";

    const result = await caller.syncOfflineQueue([
      {
        clientId: "11111111-1111-1111-1111-111111111111",
        personId: "22222222-2222-2222-2222-222222222222",
        locationId: "33333333-3333-3333-3333-333333333333",
        programa: "comedor",
        metodo: "qr_scan",
        isDemoMode: false,
        queuedAt,
      },
    ]);

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(capturedRows).toHaveLength(1);
    // The day the check-in actually happened — NOT the server flush day.
    expect(capturedRows[0].checked_in_date).toBe("2020-01-15");
    expect(capturedRows[0].checked_in_at).toBe(queuedAt);
    // Result mapping keys off the same per-item date → reported synced.
    expect(result[0]).toEqual({
      clientId: "11111111-1111-1111-1111-111111111111",
      status: "synced",
    });
  });

  it("derives a distinct date per item (multi-day queue) and rejects a non-ISO queuedAt", async () => {
    const result = await caller.syncOfflineQueue([
      {
        clientId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        personId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        locationId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        programa: "comedor",
        metodo: "qr_scan",
        isDemoMode: false,
        queuedAt: "2020-01-15T23:55:00.000Z",
      },
      {
        clientId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        personId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        locationId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        programa: "comedor",
        metodo: "qr_scan",
        isDemoMode: false,
        queuedAt: "2020-01-16T00:05:00.000Z",
      },
    ]);

    expect(capturedRows.map((r) => r.checked_in_date)).toEqual([
      "2020-01-15",
      "2020-01-16",
    ]);
    expect(result).toHaveLength(2);

    // A non-ISO queuedAt is rejected at the Zod boundary (no garbage date math).
    await expect(
      caller.syncOfflineQueue([
        {
          clientId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          personId: null,
          locationId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          programa: "comedor",
          metodo: "qr_scan",
          isDemoMode: false,
          queuedAt: "not-a-date",
        },
      ])
    ).rejects.toThrow();
  });
});
