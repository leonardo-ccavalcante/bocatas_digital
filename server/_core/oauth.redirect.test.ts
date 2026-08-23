import { describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import { registerOAuthRoutes } from "./oauth";

/**
 * Regression guard for the Google OAuth PKCE bug (fix/google-oauth-pkce-callback):
 * the server must NOT own /auth/callback. The code→session exchange needs the
 * browser's one-time code_verifier, so it lives client-side
 * (client/src/pages/AuthCallback.tsx). A server-side GET /auth/callback attempts an
 * exchange it cannot complete and always fails OAuth login — if it is ever
 * reintroduced, this test fails.
 */
describe("registerOAuthRoutes", () => {
  function register() {
    const get = vi.fn();
    const post = vi.fn();
    registerOAuthRoutes({ get, post } as unknown as Express);
    return { get, post };
  }

  it("does NOT register a server-side GET /auth/callback (PKCE exchange must run in the browser)", () => {
    const { get } = register();
    const callback = get.mock.calls.find(([path]) => path === "/auth/callback");
    expect(callback).toBeUndefined();
  });

  it("still exposes POST /api/auth/logout", () => {
    const { post } = register();
    expect(post.mock.calls.some(([path]) => path === "/api/auth/logout")).toBe(true);
  });
});
