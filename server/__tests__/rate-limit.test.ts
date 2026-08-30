/**
 * Rate-limit tests (#166).
 *
 * Import the REAL exported config (server/_core/rateLimitConfig.ts) instead of
 * mirrored constants, so the test tracks the limiter's actual values. The #166
 * fix raises the per-IP cap (a sede behind one NAT shares one IP bucket, and a
 * Familias tab load fires ~20 procedures, so the old 200 tripped and the 429
 * read as a logout). Keying stays per-IP on purpose: the limiter runs before
 * tRPC auth, so the Authorization header is unverified and MUST NOT be the key
 * (rotating bogus bearers would bypass the limiter).
 */
import { describe, it, expect } from "vitest";
import { API_MAX, API_WINDOW_MS } from "../_core/rateLimitConfig";

const AUTH_MAX = 20; // /api/oauth brute-force limiter (per-IP, in index.ts)

describe("apiLimiter configuration (#166)", () => {
  it("window is 15 minutes", () => {
    expect(API_WINDOW_MS).toBe(900_000);
  });

  it("is far more generous than the auth (brute-force) limiter", () => {
    expect(API_MAX).toBeGreaterThan(AUTH_MAX);
    // A single Familias tab load fires ~20 procedures; the old 200 tripped.
    expect(API_MAX).toBeGreaterThanOrEqual(1000);
  });
});
