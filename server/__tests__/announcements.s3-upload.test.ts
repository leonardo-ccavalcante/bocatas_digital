/**
 * announcements.s3-upload.test.ts — announcements.uploadImage.
 *
 * The previous version of this file never invoked the procedure: it built
 * `File` objects and asserted their own `.type` / `.size`, so it passed while
 * the procedure was unusable. It was unusable twice over — `z.instanceof(File)`
 * cannot survive httpBatchLink's JSON transport, and the upload went to the
 * dead Manus host. These tests drive the real resolver.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { storagePut, getPublicUrl } = vi.hoisted(() => ({
  storagePut: vi.fn(),
  getPublicUrl: vi.fn(),
}));
vi.mock("../storage", () => ({ storagePut }));
vi.mock("../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ getPublicUrl }) } }),
}));

import { uploadImageProcedure } from "../routers/announcements.uploadImage";
import { router } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import { Logger } from "../_core/logger";

const testRouter = router({ uploadImage: uploadImageProcedure });

function ctx(role: "admin" | "voluntario" = "admin"): TrpcContext {
  return {
    user: {
      id: "u1", openId: "o1", email: "a@bocatas.org", name: "A",
      loginMethod: "manus", role,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "announcements-upload-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const b64 = (bytes: number) => Buffer.alloc(bytes, 1).toString("base64");

beforeEach(() => {
  vi.clearAllMocks();
  storagePut.mockResolvedValue({ bucket: "announcement-images", path: "u1/1-a.jpg" });
  getPublicUrl.mockReturnValue({ data: { publicUrl: "https://cdn.example/u1/1-a.jpg" } });
});

describe("announcements.uploadImage", () => {
  it("uploads base64 to the public announcement-images bucket and returns a public URL", async () => {
    const res = await testRouter.createCaller(ctx()).uploadImage({
      base64: b64(16), mimeType: "image/jpeg", fileName: "a.jpg",
    });

    expect(storagePut).toHaveBeenCalledWith(
      "announcement-images", expect.any(String), expect.anything(), "image/jpeg"
    );
    expect(res.url).toBe("https://cdn.example/u1/1-a.jpg");
  });

  it("rejects a non-image mime type", async () => {
    await expect(
      testRouter.createCaller(ctx()).uploadImage({ base64: b64(16), mimeType: "text/plain" })
    ).rejects.toThrow();
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("rejects payloads over 5MB by DECODED size, not base64 length", async () => {
    await expect(
      testRouter.createCaller(ctx()).uploadImage({
        base64: b64(6 * 1024 * 1024), mimeType: "image/jpeg",
      })
    ).rejects.toThrow(/5MB/);
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("accepts a file just under the cap", async () => {
    await expect(
      testRouter.createCaller(ctx()).uploadImage({
        base64: b64(4 * 1024 * 1024), mimeType: "image/png",
      })
    ).resolves.toBeDefined();
  });

  it("is admin-only", async () => {
    await expect(
      testRouter.createCaller(ctx("voluntario")).uploadImage({
        base64: b64(16), mimeType: "image/jpeg",
      })
    ).rejects.toThrow();
  });
});
