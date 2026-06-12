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
    const req: any = { path: "/manus-storage/madrid-distritos_2968b5a3.geojson", headers: {} };
    const res = mockRes();

    await handleStorageProxy(req, res);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.redirect).toHaveBeenCalledWith(307, "https://signed.example/obj");
    expect(res.status).not.toHaveBeenCalledWith(401);
  });
});

/**
 * CAS-02b (Mythos audit): auth alone still let an authenticated `voluntario`
 * presign a high-risk identity/consent document (`documentos-consentimiento/*`),
 * bypassing the field-level redaction that hides those from non-elevated roles.
 * The proxy now requires an elevated role for every key outside the non-elevated
 * allowlist, and rejects crafted keys before the prefix check.
 *
 * MYTHOS: CAS-02b
 */
describe("storageProxy per-key authz — CAS-02b regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function reqFor(path: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { path, headers: {} } as any;
  }

  it("forbids a voluntario from presigning a high-risk document key (403, no presign)", async () => {
    (sdk.authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      role: "voluntario",
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));
    const res = mockRes();

    await handleStorageProxy(
      reqFor("/manus-storage/documentos-consentimiento/1700000000-abcd1234.jpg"),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.redirect).not.toHaveBeenCalled();
    // The core of CAS-02b: a non-elevated role must never trigger a presign of a
    // high-risk object.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows an admin to presign the same high-risk document key", async () => {
    (sdk.authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      role: "admin",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ok: true, json: async () => ({ url: "https://signed.example/doc" }) } as any,
    );
    const res = mockRes();

    await handleStorageProxy(
      reqFor("/manus-storage/documentos-consentimiento/1700000000-abcd1234.jpg"),
      res,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.redirect).toHaveBeenCalledWith(307, "https://signed.example/doc");
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it("allows a voluntario to presign a low-risk avatar key (allowlisted)", async () => {
    (sdk.authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      role: "voluntario",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { ok: true, json: async () => ({ url: "https://signed.example/avatar" }) } as any,
    );
    const res = mockRes();

    await handleStorageProxy(
      reqFor("/manus-storage/fotos-perfil/1700000000-abcd1234.jpg"),
      res,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(res.redirect).toHaveBeenCalledWith(307, "https://signed.example/avatar");
  });

  it("rejects a traversal key that targets a high-risk prefix from an allowlisted one (400, no presign)", async () => {
    (sdk.authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      role: "voluntario",
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));
    const res = mockRes();

    await handleStorageProxy(
      reqFor("/manus-storage/fotos-perfil/../documentos-consentimiento/secret.jpg"),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forbids a voluntario from a sibling key that rides the allowlist boundary (403)", async () => {
    // `madrid-distritos_` carries its own boundary: `madrid-distritos-evil/...`
    // must NOT match the allowlist and falls through to the elevated-role gate.
    (sdk.authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      role: "voluntario",
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));
    const res = mockRes();

    await handleStorageProxy(
      reqFor("/manus-storage/madrid-distritos-evil/secret.jpg"),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a percent-encoded key before the prefix check (400, no presign)", async () => {
    (sdk.authenticateRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
      role: "voluntario",
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));
    const res = mockRes();

    await handleStorageProxy(
      reqFor("/manus-storage/fotos-perfil/%2e%2e/documentos-consentimiento/secret.jpg"),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
