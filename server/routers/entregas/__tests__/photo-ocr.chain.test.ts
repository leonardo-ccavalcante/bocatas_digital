/**
 * photo-ocr.chain.test.ts — the delivery-document OCR chain.
 *
 * Was broken end to end: entregas.photo.uploadPhotoToStorage called storagePut
 * against the dead Manus host, so the upload threw and OCR was never reached.
 *
 * The photo is NOT disposable — server/ocrDeliveryExtraction/save.ts persists it
 * as `metadata.documento_imagen_url`, and CONTEXT.md describes an entrega as
 * carrying "a signature scaffold for Banco de Alimentos subsidy verification"
 * (AGENTS.md: format changes gated on the RGPD lawyer). So the fix keeps the
 * upload and repoints it at the existing private `documentos-fisicos-entregas`
 * bucket — it does not drop storage and stream base64.
 *
 * The OCR step now takes the stored PATH and signs it server-side, instead of
 * taking a client-supplied absolute URL and handing it to the model.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above const declarations — build the spies with
// vi.hoisted so they exist by the time the factory runs.
const { storagePut, storageSignedUrl, extractDeliveryDataFromImage } = vi.hoisted(() => ({
  storagePut: vi.fn(),
  storageSignedUrl: vi.fn(),
  extractDeliveryDataFromImage: vi.fn(),
}));
vi.mock("../../../storage", () => ({ storagePut, storageSignedUrl }));
vi.mock("../../../_core/delivery-ocr", () => ({ extractDeliveryDataFromImage }));

import { photoRouter } from "../photo";
import { ocrRouter } from "../ocr";
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
    correlationId: "photo-ocr-chain-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storagePut.mockResolvedValue({ bucket: "documentos-fisicos-entregas", path: "photos/u1/x.jpg" });
  storageSignedUrl.mockResolvedValue("https://signed.example/x.jpg");
  extractDeliveryDataFromImage.mockResolvedValue({
    success: true, extractionConfidence: 0.9, beneficiaries: [], warnings: [],
  });
});

describe("entregas.photo.uploadPhotoToStorage", () => {
  it("uploads to the private documentos-fisicos-entregas bucket", async () => {
    await photoRouter.createCaller(ctx()).uploadPhotoToStorage({
      photoData: Buffer.from("img").toString("base64"),
      rotation: 0,
    });
    expect(storagePut).toHaveBeenCalledWith(
      "documentos-fisicos-entregas",
      expect.stringContaining("photos/"),
      expect.anything(),
      "image/jpeg"
    );
  });

  it("returns the stored path and never a URL (subsidy evidence pointer)", async () => {
    const res = await photoRouter.createCaller(ctx()).uploadPhotoToStorage({
      photoData: Buffer.from("img").toString("base64"),
      rotation: 90,
    });
    expect(res.photoPath).toBe("photos/u1/x.jpg");
    expect(res.rotation).toBe(90);
    expect(JSON.stringify(res)).not.toMatch(/https?:/);
  });
});

describe("entregas.ocr.extractFromPhoto", () => {
  it("signs the stored path server-side and gives the model the signed URL", async () => {
    await ocrRouter.createCaller(ctx()).extractFromPhoto({
      photoPath: "photos/u1/x.jpg",
      programaId: "p1",
    });
    expect(storageSignedUrl).toHaveBeenCalledWith("documentos-fisicos-entregas", "photos/u1/x.jpg");
    expect(extractDeliveryDataFromImage).toHaveBeenCalledWith("https://signed.example/x.jpg", "p1");
  });

  it("rejects a client-supplied absolute URL — the client must not choose what the model fetches", async () => {
    await expect(
      ocrRouter.createCaller(ctx()).extractFromPhoto({
        photoPath: "https://attacker.example/payload.jpg",
        programaId: "p1",
      })
    ).rejects.toThrow();
    expect(extractDeliveryDataFromImage).not.toHaveBeenCalled();
  });

  it("degrades without calling the model when the stored photo cannot be signed", async () => {
    // extractFromPhoto degrades gracefully by design (it catches everything and
    // returns success:false) so a volunteer gets a toast, not a crash. The
    // guarantee that matters here is that the model is never invoked with a
    // missing image.
    storageSignedUrl.mockResolvedValue(null);
    const res = await ocrRouter
      .createCaller(ctx())
      .extractFromPhoto({ photoPath: "photos/u1/x.jpg", programaId: "p1" });
    expect(res.success).toBe(false);
    expect(extractDeliveryDataFromImage).not.toHaveBeenCalled();
  });
});
