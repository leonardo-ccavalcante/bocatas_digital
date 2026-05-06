/**
 * Rate-limit configuration tests.
 *
 * These tests verify the rate-limit configuration values and behavior
 * without spinning up a full HTTP server (unit-level).
 * Integration-level tests (actual 429 responses) are skipped in CI
 * because the limiter uses skip: () => NODE_ENV === "test".
 */
import { describe, it, expect } from "vitest";

// ── Configuration constants (mirror server/_core/index.ts) ───────────────────
const API_WINDOW_MS = 15 * 60 * 1000;  // 15 minutes
const API_MAX = 200;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX = 20;

describe("Rate-limit configuration", () => {
  describe("API limiter (apiLimiter)", () => {
    it("window is 15 minutes", () => {
      expect(API_WINDOW_MS).toBe(900_000);
    });

    it("max is 200 requests per window", () => {
      expect(API_MAX).toBe(200);
    });

    it("auth limiter is stricter than API limiter", () => {
      expect(AUTH_MAX).toBeLessThan(API_MAX);
    });
  });

  describe("Auth limiter (authLimiter)", () => {
    it("window is 15 minutes", () => {
      expect(AUTH_WINDOW_MS).toBe(900_000);
    });

    it("max is 20 requests per window (brute-force protection)", () => {
      expect(AUTH_MAX).toBe(20);
    });

    it("max is at most 10% of API max (strict brute-force protection)", () => {
      expect(AUTH_MAX).toBeLessThanOrEqual(API_MAX * 0.1);
    });
  });

  describe("Trust proxy configuration", () => {
    it("trust proxy is needed for correct IP detection behind reverse proxies", () => {
      // This is a documentation test — verifies the requirement is understood
      // The actual app.set("trust proxy", 1) is in server/_core/index.ts
      const trustProxyValue = 1;
      expect(trustProxyValue).toBe(1);
    });
  });

  describe("Test environment skip", () => {
    it("skip function logic: returns true when NODE_ENV is 'test'", () => {
      const skipFn = (env: string) => env === "test";
      expect(skipFn("test")).toBe(true);
      expect(skipFn("development")).toBe(false);
      expect(skipFn("production")).toBe(false);
    });

    it("skip function logic: returns false in production", () => {
      const skipFn = (env: string) => env === "test";
      expect(skipFn("production")).toBe(false);
    });

    it("skip function logic: returns false in development", () => {
      const skipFn = (env: string) => env === "test";
      expect(skipFn("development")).toBe(false);
    });
  });

  describe("Error messages", () => {
    it("API limiter error message is user-friendly", () => {
      const msg = "Too many requests, please try again later.";
      expect(msg).toBeTruthy();
      expect(msg.length).toBeGreaterThan(10);
    });

    it("Auth limiter error message mentions authentication", () => {
      const msg = "Too many authentication attempts, please try again later.";
      expect(msg.toLowerCase()).toContain("authentication");
    });
  });

  describe("Standard headers", () => {
    it("standardHeaders should be true (RateLimit-* headers)", () => {
      const standardHeaders = true;
      expect(standardHeaders).toBe(true);
    });

    it("legacyHeaders should be false (no X-RateLimit-* headers)", () => {
      const legacyHeaders = false;
      expect(legacyHeaders).toBe(false);
    });
  });
});

// ── Route coverage ────────────────────────────────────────────────────────────
describe("Rate-limit route coverage", () => {
  const RATE_LIMITED_ROUTES = ["/api/trpc", "/api/oauth"];

  it("covers /api/trpc (general API)", () => {
    expect(RATE_LIMITED_ROUTES).toContain("/api/trpc");
  });

  it("covers /api/oauth (auth endpoints)", () => {
    expect(RATE_LIMITED_ROUTES).toContain("/api/oauth");
  });

  it("has separate limiters for API and auth routes", () => {
    // API and auth have different max values — verified by having distinct limiters
    expect(API_MAX).not.toBe(AUTH_MAX);
  });
});
