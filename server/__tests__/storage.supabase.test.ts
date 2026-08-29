/**
 * storage.supabase.test.ts
 *
 * `storagePut` used to POST multipart to the Manus object-storage proxy using
 * BUILT_IN_FORGE_API_URL / BUILT_IN_FORGE_API_KEY. The project no longer uses
 * Manus and those vars are unset, so every upload threw
 * "Storage proxy credentials missing" before any network call — silently
 * discarding profile photos, signed-consent photos, delivery-document photos
 * and novedad images.
 *
 * It now writes to Supabase Storage. These tests pin the contract:
 *  - the bucket is an explicit argument (Manus had one flat keyspace; Supabase
 *    does not, and `deliveries/photos/...` is a path, not a bucket name)
 *  - it returns the storage PATH, never a URL — a persisted signed URL is a
 *    replayable, shareable link, which is the CAS-02 failure mode
 *  - reads are short-lived signed URLs
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const upload = vi.fn();
const createSignedUrl = vi.fn();
const from = vi.fn(() => ({ upload, createSignedUrl }));

vi.mock("../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({ storage: { from } }),
}));

import { storagePut, storageSignedUrl } from "../storage";

beforeEach(() => {
  vi.clearAllMocks();
  upload.mockResolvedValue({ data: { path: "x" }, error: null });
  createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/x" }, error: null });
});

describe("storagePut", () => {
  it("uploads to the named Supabase bucket and returns the path, not a URL", async () => {
    const result = await storagePut("fotos-perfil", "123-abc.jpg", Buffer.from("x"), "image/jpeg");

    expect(from).toHaveBeenCalledWith("fotos-perfil");
    expect(upload).toHaveBeenCalledWith(
      "123-abc.jpg",
      expect.anything(),
      expect.objectContaining({ contentType: "image/jpeg" })
    );
    expect(result).toEqual({ bucket: "fotos-perfil", path: "123-abc.jpg" });
    expect(JSON.stringify(result)).not.toMatch(/https?:/);
  });

  it("strips leading slashes from the path", async () => {
    await storagePut("fotos-perfil", "/a/b.jpg", Buffer.from("x"), "image/jpeg");
    expect(upload).toHaveBeenCalledWith("a/b.jpg", expect.anything(), expect.anything());
  });

  it("throws a curated error when the upload fails (no raw driver text)", async () => {
    upload.mockResolvedValue({ data: null, error: { message: "boom /secret/path" } });
    await expect(
      storagePut("fotos-perfil", "a.jpg", Buffer.from("x"), "image/jpeg")
    ).rejects.toThrow(/No se pudo guardar/);
  });

  it("does not leak the driver message to the caller", async () => {
    upload.mockResolvedValue({ data: null, error: { message: "boom /secret/path" } });
    await expect(
      storagePut("fotos-perfil", "a.jpg", Buffer.from("x"), "image/jpeg")
    ).rejects.not.toThrow(/secret/);
  });
});

describe("storageSignedUrl", () => {
  it("mints a short-lived signed URL for a stored path", async () => {
    const url = await storageSignedUrl("fotos-perfil", "123-abc.jpg");
    expect(from).toHaveBeenCalledWith("fotos-perfil");
    expect(createSignedUrl).toHaveBeenCalledWith("123-abc.jpg", expect.any(Number));
    expect(url).toBe("https://signed.example/x");
  });

  it("passes an absolute URL through untouched (legacy rows still hold one)", async () => {
    const url = await storageSignedUrl("fotos-perfil", "https://legacy.example/a.jpg");
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(url).toBe("https://legacy.example/a.jpg");
  });

  it("returns null for an empty path instead of throwing", async () => {
    expect(await storageSignedUrl("fotos-perfil", null)).toBeNull();
    expect(await storageSignedUrl("fotos-perfil", "")).toBeNull();
  });

  it("returns null when signing fails — a missing avatar must not break a list query", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "nope" } });
    expect(await storageSignedUrl("fotos-perfil", "a.jpg")).toBeNull();
  });
});
