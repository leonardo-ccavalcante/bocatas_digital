/**
 * Integration regression test for CAS-02 (Mythos audit).
 *
 * Bug: GET /manus-storage/* (server/_core/storageProxy.ts) presigned ANY storage
 * key via the server-side forge API key and 307-redirected to it, with NO
 * authentication. Anyone on the public internet could fetch any object —
 * `foto_documento`, delivery signatures, cross-family PII — by knowing/guessing
 * its key (IDOR).
 *
 * Fix: the handler requires a valid session (sdk.authenticateRequest) and returns
 * 401 BEFORE any presign is requested, so no signed URL is ever minted for an
 * anonymous caller.
 *
 * MYTHOS: CAS-02
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));
vi.mock("../_core/env", () => ({
  ENV: { forgeApiUrl: "https://forge.test", forgeApiKey: "forge-key" },
}));

import { handleStorageProxy } from "../_core/storageProxy";
import { sdk } from "../_core/sdk";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockRes(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  return res;
}

describe("storageProxy auth — CAS-02 regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an anonymous request with 401 and NEVER mints a presigned URL", async () => {
    // No valid session → authenticateRequest rejects (its real failure mode).
    (sdk.authenticateRequest as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("no session"),
    );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = {
      path: "/manus-storage/families/another-family/foto_documento.png",
      headers: {},
    };
    const res = mockRes();

    await handleStorageProxy(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.redirect).not.toHaveBeenCalled();
    // The core of CAS-02: an anonymous caller must never trigger a presign.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows an authenticated session and redirects to the signed URL", async () => {
    (sdk.authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      role: "voluntario",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ok: true, json: async () => ({ url: "https://signed.example/obj" }) } as any,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = { path: "/manus-storage/madrid-distritos.geojson", headers: {} };
    const res = mockRes();

    await handleStorageProxy(req, res);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.redirect).toHaveBeenCalledWith(307, "https://signed.example/obj");
    expect(res.status).not.toHaveBeenCalledWith(401);
  });
});
