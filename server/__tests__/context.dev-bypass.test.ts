/**
 * createContext — DEV_ADMIN_LOGIN bypass must fire ONLY for a genuinely
 * anonymous request (#172 / F077).
 *
 * The bug: authenticateRequest collapses three outcomes into `null` (no token,
 * token PRESENT-but-rejected, valid token but no role). The bypass fired on any
 * `null`, so an INVALID credential was silently upgraded to synthetic admin —
 * turning a rejected login into full access and blinding every role check.
 *
 * These tests mock authenticateRequest to `null` (a rejected session) and keep
 * the real credential-presence detection, asserting the bypass fires only when
 * no credential was presented.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type * as AuthModule from "../_core/authenticateRequest";

vi.mock("../_core/authenticateRequest", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof AuthModule;
  return { ...actual, authenticateRequest: vi.fn() };
});

import { createContext } from "../_core/context";
import { authenticateRequest } from "../_core/authenticateRequest";

function opts(headers: Record<string, string>) {
  return { req: { headers }, res: {} } as unknown as Parameters<typeof createContext>[0];
}

describe("createContext dev-admin bypass (#172)", () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.DEV_ADMIN_LOGIN = "1";
    vi.mocked(authenticateRequest).mockReset();
    vi.mocked(authenticateRequest).mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("injects the synthetic admin for a genuinely anonymous request", async () => {
    const ctx = await createContext(opts({}));
    expect(ctx.user?.role).toBe("admin");
  });

  it("does NOT inject admin when a bearer credential was presented but rejected", async () => {
    const ctx = await createContext(opts({ authorization: "Bearer invalid-token" }));
    expect(ctx.user).toBeNull();
  });

  it("does NOT inject admin when a session cookie was presented but rejected", async () => {
    const ctx = await createContext(opts({ cookie: "sb-access-token=rejected" }));
    expect(ctx.user).toBeNull();
  });

  it("does not inject admin outside development even when anonymous", async () => {
    process.env.NODE_ENV = "production";
    const ctx = await createContext(opts({}));
    expect(ctx.user).toBeNull();
  });

  it("treats a non-Bearer Authorization header as a presented credential (no bypass)", async () => {
    // Physical presence, not extractability: the header is not a session token,
    // so extractSessionToken() returns null, yet a credential WAS presented.
    const ctx = await createContext(opts({ authorization: "Basic Zm9vOmJhcg==" }));
    expect(ctx.user).toBeNull();
  });

  it("DEV_LOGIN_ROLE selects the synthetic role for role testing without OAuth", async () => {
    process.env.DEV_LOGIN_ROLE = "voluntario";
    const ctx = await createContext(opts({}));
    expect(ctx.user?.role).toBe("voluntario");
  });

  it("an invalid DEV_LOGIN_ROLE falls back to admin", async () => {
    process.env.DEV_LOGIN_ROLE = "root";
    const ctx = await createContext(opts({}));
    expect(ctx.user?.role).toBe("admin");
  });
});
