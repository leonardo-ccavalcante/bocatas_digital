/**
 * derivar.uploadSignedHoja must persist a private storage PATH, never a public
 * URL (#168 / RC-31 / CAS-02). It previously wrote getPublicUrl() — a permanent,
 * replayable link to a signed PDF carrying beneficiary PII — into
 * derivacion_hojas.firmado_url and into the log line.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

const fromMock = vi.fn();
vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Variadic args so the `storagePut(...args)` forward below type-checks: a bare
// `vi.fn(async () => …)` infers a no-arg tuple type and spreading unknown[] into
// it is TS2556.
const storagePut = vi.fn(async (..._args: unknown[]) => ({
  bucket: "derivaciones-firmadas",
  path: "hoja-key.pdf",
}));
vi.mock("../../../storage", () => ({
  storagePut: (...args: unknown[]) => storagePut(...args),
  storageSignedUrl: vi.fn(),
}));

import { intervencionesUploadsRouter } from "../intervenciones-uploads";

function ctx(): TrpcContext {
  return {
    user: {
      id: "test-user-1", openId: "u", email: "admin@b.org", name: "A", loginMethod: "manus",
      role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "c",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const HOJA = "11111111-1111-4111-8111-111111111111";
const PDF_BASE64 = Buffer.from("%PDF-1.4 firmada").toString("base64");

beforeEach(() => {
  fromMock.mockReset();
  storagePut.mockClear();
});

describe("derivar.uploadSignedHoja — private path, no public URL (#168)", () => {
  it("stores the storage PATH and returns no URL", async () => {
    const update = { update: vi.fn().mockReturnThis(), eq: vi.fn(() => Promise.resolve({ error: null })) };
    fromMock.mockReturnValueOnce(update);

    const res = await intervencionesUploadsRouter
      .createCaller(ctx())
      .uploadSignedHoja({ hojaId: HOJA, fileBase64: PDF_BASE64, originalName: "acta.pdf" });

    expect(res).toEqual({ success: true });

    // Written to the PRIVATE bucket, key WITHOUT the redundant bucket prefix.
    expect(storagePut).toHaveBeenCalledWith(
      "derivaciones-firmadas",
      expect.not.stringContaining("derivaciones-firmadas/"),
      expect.any(Buffer),
      "application/pdf",
    );

    // The DB stored the PATH, never an http(s) URL.
    const written = update.update.mock.calls[0][0] as { firmado_url: string };
    expect(written.firmado_url).toBe("hoja-key.pdf");
    expect(written.firmado_url).not.toMatch(/^https?:/i);
  });

  it("rejects a non-PDF payload", async () => {
    await expect(
      intervencionesUploadsRouter
        .createCaller(ctx())
        .uploadSignedHoja({ hojaId: HOJA, fileBase64: Buffer.from("not a pdf").toString("base64"), originalName: "x.pdf" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storagePut).not.toHaveBeenCalled();
  });
});
