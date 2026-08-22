import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLoginUrl } from "../const";

describe("getLoginUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { origin: "https://bocatasdigital-production.up.railway.app" } });
    vi.stubEnv("VITE_OAUTH_PORTAL_URL", "https://legacy-auth.example.test");
    vi.stubEnv("VITE_APP_ID", "legacy-app");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the local Supabase login route instead of constructing a Manus OAuth URL", () => {
    expect(getLoginUrl()).toBe("/login");
  });
});
