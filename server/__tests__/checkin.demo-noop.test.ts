/**
 * checkin.demo-noop.test.ts — regression for ARG-01 (Mythos audit).
 *
 * Bug: demo (practice) check-ins were persisted to `attendances` with
 * es_demo=true and shared the real check-in's unique index, so a demo check-in
 * blocked a real one for the same person/location/programa/day (23505).
 *
 * Fix (Option A, B.7 "demo = no real data written"): demo mode writes NOTHING.
 * verifyAndInsert + anonymousCheckin return "registered" without inserting;
 * syncOfflineQueue filters demo items out of the upsert and reports them synced.
 *
 * MYTHOS: ARG-01
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertSpy = vi.fn(() => Promise.resolve({ error: null }));
const upsertSelectSpy = vi.fn(() => Promise.resolve({ data: [], error: null }));
const upsertSpy = vi.fn(() => ({ select: upsertSelectSpy }));
// attendances chain: the dup-check (select…eq…maybeSingle) finds nothing, so the
// real path proceeds to insert; insert/upsert are the spies under assertion.
const attendances = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  insert: insertSpy,
  upsert: upsertSpy,
};

vi.mock("../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "persons_safe") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "p1", restricciones_alimentarias: "Sin gluten" },
                  error: null,
                }),
            }),
          }),
        };
      }
      return attendances; // attendances
    },
  })),
}));

import { initTRPC } from "@trpc/server";
import { checkinRouter } from "../routers/checkin";
import type { TrpcContext } from "../_core/context";
import { Logger } from "../_core/logger";

const t = initTRPC.context<TrpcContext>().create({
  transformer: { serialize: (v: unknown) => v, deserialize: (v: unknown) => v },
});
const caller = t.createCallerFactory(checkinRouter)({
  user: {
    id: 1,
    openId: "o",
    name: "T",
    email: "t@t.com",
    role: "admin",
    loginMethod: "google",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  logger: new Logger(),
  correlationId: "cid",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: {} as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: {} as any,
});

const PERSON = "22222222-2222-2222-2222-222222222222";
const LOC = "33333333-3333-3333-3333-333333333333";

describe("checkin — demo mode writes no real data (ARG-01)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("verifyAndInsert in demo mode returns registered WITHOUT inserting", async () => {
    const res = await caller.verifyAndInsert({
      personId: PERSON,
      locationId: LOC,
      programa: "comedor",
      metodo: "qr_scan",
      isDemoMode: true,
    });
    expect(res).toEqual({ status: "registered", restriccionesAlimentarias: "Sin gluten" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("verifyAndInsert NOT in demo mode DOES insert (guards the test is meaningful)", async () => {
    await caller.verifyAndInsert({
      personId: PERSON,
      locationId: LOC,
      programa: "comedor",
      metodo: "qr_scan",
      isDemoMode: false,
    });
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it("anonymousCheckin in demo mode returns registered WITHOUT inserting", async () => {
    const res = await caller.anonymousCheckin({
      locationId: LOC,
      programa: "comedor",
      isDemoMode: true,
    });
    expect(res).toEqual({ status: "registered" });
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("syncOfflineQueue with an all-demo batch reports synced WITHOUT upserting", async () => {
    const C1 = "11111111-1111-1111-1111-111111111111";
    const C2 = "44444444-4444-4444-4444-444444444444";
    const res = await caller.syncOfflineQueue([
      {
        clientId: C1,
        personId: PERSON,
        locationId: LOC,
        programa: "comedor",
        metodo: "qr_scan",
        isDemoMode: true,
        queuedAt: "2020-01-15T10:00:00.000Z",
      },
      {
        clientId: C2,
        personId: null,
        locationId: LOC,
        programa: "comedor",
        metodo: "conteo_anonimo",
        isDemoMode: true,
        queuedAt: "2020-01-15T10:01:00.000Z",
      },
    ]);
    expect(res).toEqual([
      { clientId: C1, status: "synced" },
      { clientId: C2, status: "synced" },
    ]);
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
