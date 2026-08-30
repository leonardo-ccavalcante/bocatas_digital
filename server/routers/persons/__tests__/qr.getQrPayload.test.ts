/**
 * qr.getQrPayload.test.ts — RC-07 (F054).
 * getQrPayload es la única vía voluntario-safe para /personas/:id/qr
 * (persons.getById es admin-only por diseño, #46). Debe devolver, además del
 * payload firmado, el nombre visible para la tarjeta imprimible.
 * Patrón de mocks: photo.limits.test.ts + checkin.qrsig.test.ts.
 */
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.QR_SIGNING_SECRET = "test-qr-signing-secret-32-chars-minimum-ok";
});

vi.mock("../../../storage", () => ({
  signPathField: vi.fn(),
  AVATAR_BUCKET: "avatars",
}));

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            maybeSingle: async () => ({
              data: {
                id: "12345678-1234-1234-1234-1234567890ab",
                nombre: "Ana",
                apellidos: "García",
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { qrRouter } from "../qr";
import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

function ctx(): TrpcContext {
  return {
    user: {
      id: "u1", openId: "o1", email: "v@bocatas.org", name: "V",
      loginMethod: "manus", role: "voluntario",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "qr-getqrpayload-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("persons.getQrPayload — datos para la tarjeta QR", () => {
  it("voluntario recibe payload firmado + nombre y apellidos", async () => {
    const caller = qrRouter.createCaller(ctx());
    const res = await caller.getQrPayload({
      personId: "12345678-1234-1234-1234-1234567890ab",
    });

    expect(res.payload).toMatch(/^bocatas:\/\/person\/[0-9a-f-]{36}\?sig=[a-f0-9]{8}$/);
    expect(res.nombre).toBe("Ana");
    expect(res.apellidos).toBe("García");
    // El payload QR en sí sigue sin PII (guard-rail QA-1A / qr-no-pii.test.ts).
    expect(res.payload).not.toContain("Ana");
  });
});
