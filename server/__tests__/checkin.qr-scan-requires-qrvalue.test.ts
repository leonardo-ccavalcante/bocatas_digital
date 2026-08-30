/**
 * verifyAndInsert — a qr_scan check-in MUST carry a qrValue to verify (#171 / F090).
 *
 * metodo defaults to "qr_scan", and verification only ran `if (qrValue !== undefined)`,
 * so a call with metodo:'qr_scan' and no qrValue inserted an attendance marked as
 * scanned WITHOUT any HMAC check. The legit client (useCheckin.ts) only sends
 * qr_scan together with a qrValue, so rejecting the mismatch breaks no real flow.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: vi.fn() })),
  createServerClient: vi.fn(),
}));

import { checkinRouter } from "../routers/checkin";
import type { TrpcContext } from "../_core/context";
import { Logger } from "../_core/logger";

function ctx(): TrpcContext {
  return {
    user: {
      id: "test-user-42",
      openId: "test-user",
      email: "voluntario@bocatas.org",
      name: "voluntario",
      loginMethod: "manus",
      role: "voluntario",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "qr-scan-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const BASE = {
  personId: "11111111-1111-1111-1111-111111111111",
  locationId: "22222222-2222-2222-2222-222222222222",
  programa: "comedor",
};

describe("verifyAndInsert requires qrValue for a qr_scan (#171 F090)", () => {
  it("rejects metodo:'qr_scan' with no qrValue (before touching the DB)", async () => {
    const caller = checkinRouter.createCaller(ctx());
    await expect(
      caller.verifyAndInsert({ ...BASE, metodo: "qr_scan" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects the schema default (qr_scan) when no qrValue is supplied", async () => {
    const caller = checkinRouter.createCaller(ctx());
    // metodo omitted -> defaults to "qr_scan"
    await expect(caller.verifyAndInsert({ ...BASE })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
