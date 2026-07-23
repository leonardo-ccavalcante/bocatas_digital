/**
 * sessionEnlace.test.ts — unit tests for the session magic-link token helper.
 *
 * RED phase: these tests target shared/sessionEnlace.ts which does not exist
 * yet. All tests will fail until the implementation is created (GREEN phase).
 */
import { describe, it, expect } from "vitest";
import {
  generateSessionToken,
  hashSessionToken,
  verifySessionToken,
} from "../sessionEnlace";

const TEST_SECRET = "test-session-link-secret-min-32-chars-ok";

describe("generateSessionToken", () => {
  it("returns a 64-character hex string", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generates unique tokens on each call", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
  });

  it("does not contain PII or structured data — only hex chars", () => {
    const token = generateSessionToken();
    expect(token).not.toContain(".");
    expect(token).not.toContain("-");
  });
});

describe("hashSessionToken", () => {
  it("returns a 64-character hex hash", async () => {
    const token = generateSessionToken();
    const hash = await hashSessionToken(token, TEST_SECRET);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic — same token + secret produces same hash", async () => {
    const token = generateSessionToken();
    const hash1 = await hashSessionToken(token, TEST_SECRET);
    const hash2 = await hashSessionToken(token, TEST_SECRET);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different tokens", async () => {
    const hash1 = await hashSessionToken("aaaa", TEST_SECRET);
    const hash2 = await hashSessionToken("bbbb", TEST_SECRET);
    expect(hash1).not.toBe(hash2);
  });

  it("produces different hashes for different secrets", async () => {
    const token = generateSessionToken();
    const hash1 = await hashSessionToken(token, TEST_SECRET);
    const hash2 = await hashSessionToken(token, TEST_SECRET + "-other");
    expect(hash1).not.toBe(hash2);
  });

  it("throws if secret is shorter than 32 characters", async () => {
    await expect(hashSessionToken("token", "short")).rejects.toThrow();
  });
});

describe("verifySessionToken", () => {
  it("returns true for a valid token + stored hash", async () => {
    const token = generateSessionToken();
    const hash = await hashSessionToken(token, TEST_SECRET);
    const valid = await verifySessionToken(token, hash, TEST_SECRET);
    expect(valid).toBe(true);
  });

  it("returns false for the wrong token against a stored hash", async () => {
    const realToken = generateSessionToken();
    const hash = await hashSessionToken(realToken, TEST_SECRET);
    const attackToken = generateSessionToken(); // different token
    const valid = await verifySessionToken(attackToken, hash, TEST_SECRET);
    expect(valid).toBe(false);
  });

  it("returns false for a tampered hash (REPLAY guard)", async () => {
    const token = generateSessionToken();
    const hash = await hashSessionToken(token, TEST_SECRET);
    const tamperedHash = hash.slice(0, -1) + (hash.endsWith("a") ? "b" : "a");
    const valid = await verifySessionToken(token, tamperedHash, TEST_SECRET);
    expect(valid).toBe(false);
  });

  it("returns false for empty token", async () => {
    const hash = await hashSessionToken("real", TEST_SECRET);
    expect(await verifySessionToken("", hash, TEST_SECRET)).toBe(false);
  });

  it("returns false for empty stored hash", async () => {
    expect(await verifySessionToken("token", "", TEST_SECRET)).toBe(false);
  });

  it("returns false for a short secret (misconfiguration guard)", async () => {
    const token = generateSessionToken();
    const hash = await hashSessionToken(token, TEST_SECRET);
    // Short secret → should fail safely, not throw
    const valid = await verifySessionToken(token, hash, "short");
    expect(valid).toBe(false);
  });

  it("is constant-time-ish — both false branches have the same code path", async () => {
    // We can't measure timing precisely in a unit test, but we can verify
    // that both a wrong-token and a wrong-hash case both return false.
    const token = generateSessionToken();
    const hash = await hashSessionToken(token, TEST_SECRET);
    expect(await verifySessionToken("wrong", hash, TEST_SECRET)).toBe(false);
    const wrongHash = "0".repeat(64);
    expect(await verifySessionToken(token, wrongHash, TEST_SECRET)).toBe(false);
  });
});
