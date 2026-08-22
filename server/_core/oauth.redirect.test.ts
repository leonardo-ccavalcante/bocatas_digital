import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Express, Request, Response } from "express";

const exchangeCodeForSession = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { exchangeCodeForSession } }),
}));

vi.mock("../db", () => ({ upsertUser: vi.fn() }));

import { registerOAuthRoutes } from "./oauth";

describe("registerOAuthRoutes", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockResolvedValue({
      data: {
        user: {
          id: "test-user-id",
          email: "user@example.com",
          user_metadata: {},
          app_metadata: { provider: "google" },
        },
        session: { access_token: "access", refresh_token: "refresh" },
      },
      error: null,
    });
  });

  it("rejects an external next URL after a successful OAuth callback", async () => {
    const get = vi.fn();
    const app = { get, post: vi.fn() } as unknown as Express;
    registerOAuthRoutes(app);

    const handler = get.mock.calls.find(([path]) => path === "/auth/callback")?.[1];
    const res = {
      cookie: vi.fn(),
      redirect: vi.fn(),
    } as unknown as Response;

    await handler(
      {
        query: { code: "one-time-code", next: "https://attacker.example" },
        protocol: "https",
        headers: {},
      } as unknown as Request,
      res
    );

    expect(res.redirect).toHaveBeenCalledWith(302, "/");
  });
});
