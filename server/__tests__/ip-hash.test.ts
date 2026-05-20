// server/__tests__/ip-hash.test.ts
/**
 * ip-hash.test.ts — Pure-function tests for hashClientIp utility.
 * No DB, no mocks needed — crypto only.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { hashClientIp } from "../../shared/ipHash";

const SALT = "test-daily-salt-abc123";
const IP = "81.47.102.200";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

describe("hashClientIp", () => {
  it("returns SHA-256(ip:salt) when both are provided", () => {
    const result = hashClientIp(IP, SALT);
    expect(result).toBe(sha256(`${IP}:${SALT}`));
  });

  it("NEVER returns the raw IP address", () => {
    const result = hashClientIp(IP, SALT);
    expect(result).not.toContain(IP);
    expect(result).not.toBe(IP);
  });

  it("returns null when rawIp is null", () => {
    expect(hashClientIp(null, SALT)).toBeNull();
  });

  it("returns null when rawIp is undefined", () => {
    expect(hashClientIp(undefined, SALT)).toBeNull();
  });

  it("returns null when rawIp is empty string", () => {
    expect(hashClientIp("", SALT)).toBeNull();
  });

  it("returns null when dailySalt is null (salt row missing from app_settings)", () => {
    expect(hashClientIp(IP, null)).toBeNull();
  });

  it("returns null when dailySalt is undefined", () => {
    expect(hashClientIp(IP, undefined)).toBeNull();
  });

  it("returns null when both are null", () => {
    expect(hashClientIp(null, null)).toBeNull();
  });

  it("output is a 64-char hex string for valid inputs", () => {
    const result = hashClientIp(IP, SALT);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different IPs with same salt produce different hashes", () => {
    const h1 = hashClientIp("1.2.3.4", SALT);
    const h2 = hashClientIp("5.6.7.8", SALT);
    expect(h1).not.toBe(h2);
  });

  it("same IP with different salts produce different hashes", () => {
    const h1 = hashClientIp(IP, "salt-a");
    const h2 = hashClientIp(IP, "salt-b");
    expect(h1).not.toBe(h2);
  });
});
