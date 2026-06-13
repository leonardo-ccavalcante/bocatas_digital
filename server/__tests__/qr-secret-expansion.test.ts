/**
 * qr-secret-expansion.test.ts — Contract tests for the QR signing secret
 * expansion logic in env.ts.
 *
 * Root cause: JWT_SECRET in dev/prod may be < 32 chars, causing
 * ensureSecret() to throw "QR signing secret not configured".
 *
 * Fix: env.ts expands short secrets via HMAC-SHA256 so that
 * qrSigningSecret is always ≥ 32 chars when any secret is set.
 *
 * Two layers of tests:
 *   1. Pure function contract (local reimplementation) — fast, no side effects.
 *   2. Integration test — imports expandSecret from env.ts directly to ensure
 *      the actual implementation matches the contract.
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { expandSecret as expandSecretFromEnv, QR_KEY_CONTEXT } from "../_core/env";

// ── Pure function under test ──────────────────────────────────────────────────
// Local reimplementation for fast contract tests (no module-load side effects).
function expandSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length >= 32) return secret;
  return createHmac("sha256", secret).update(QR_KEY_CONTEXT).digest("hex");
}

describe("expandSecret — QR signing secret expansion (env.ts fix)", () => {
  it("returns empty string when input is empty", () => {
    expect(expandSecret("")).toBe("");
  });

  it("returns the secret unchanged when it is already ≥ 32 chars", () => {
    const longSecret = "this-secret-is-exactly-32-chars!";
    expect(longSecret.length).toBe(32);
    expect(expandSecret(longSecret)).toBe(longSecret);
  });

  it("returns the secret unchanged when it is > 32 chars", () => {
    const longSecret = "this-secret-is-longer-than-32-chars-for-sure!!";
    expect(expandSecret(longSecret)).toBe(longSecret);
  });

  it("expands a short secret (< 32 chars) to exactly 64 hex chars via HMAC-SHA256", () => {
    const shortSecret = "short-jwt-22-chars!"; // 19 chars
    const expanded = expandSecret(shortSecret);
    expect(expanded.length).toBe(64);
    expect(expanded).toMatch(/^[a-f0-9]{64}$/);
  });

  it("expanded secret always passes the ensureSecret length check (≥ 32)", () => {
    const shortSecret = "short"; // 5 chars
    const expanded = expandSecret(shortSecret);
    expect(expanded.length).toBeGreaterThanOrEqual(32);
  });

  it("expansion is deterministic — same input always produces same output", () => {
    const shortSecret = "jwt-secret-22-chars!!";
    const result1 = expandSecret(shortSecret);
    const result2 = expandSecret(shortSecret);
    expect(result1).toBe(result2);
  });

  it("expansion is unique per input — different short secrets produce different outputs", () => {
    const secret1 = "short-secret-one!";
    const secret2 = "short-secret-two!";
    expect(expandSecret(secret1)).not.toBe(expandSecret(secret2));
  });

  it("a 22-char JWT_SECRET (like the current dev env) expands to a valid 64-char secret", () => {
    // This is the exact scenario that causes the bug in production:
    // JWT_SECRET has 22 chars → qrSigningSecret = 22 chars → ensureSecret() throws
    const devJwtSecret = "a".repeat(22); // 22 chars, simulating the dev JWT_SECRET
    const expanded = expandSecret(devJwtSecret);
    expect(expanded.length).toBe(64);
    expect(expanded.length).toBeGreaterThanOrEqual(32);
    // Verify it would pass ensureSecret() check
    expect(expanded.length < 32).toBe(false);
  });
});

// ── Integration tests — verify env.ts implementation matches contract ─────────
describe("expandSecret (imported from env.ts) — integration contract", () => {
  it("env.ts expandSecret matches the local contract implementation for empty string", () => {
    expect(expandSecretFromEnv("")).toBe(expandSecret(""));
  });

  it("env.ts expandSecret matches the local contract for a long secret (≥ 32 chars)", () => {
    const longSecret = "this-secret-is-exactly-32-chars!";
    expect(expandSecretFromEnv(longSecret)).toBe(expandSecret(longSecret));
  });

  it("env.ts expandSecret matches the local contract for a short secret (< 32 chars)", () => {
    const shortSecret = "short-jwt-22-chars!!";
    expect(expandSecretFromEnv(shortSecret)).toBe(expandSecret(shortSecret));
  });

  it("env.ts QR_KEY_CONTEXT is the expected value (changing it would break existing QRs)", () => {
    // This test acts as a guard: if someone changes QR_KEY_CONTEXT, this test
    // will fail loudly, preventing silent invalidation of existing QR codes.
    expect(QR_KEY_CONTEXT).toBe("qr-signing-key");
  });
});
