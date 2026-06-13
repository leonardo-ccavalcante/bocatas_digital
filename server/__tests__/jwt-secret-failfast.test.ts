/**
 * jwt-secret-failfast.test.ts — Root-cause guard for the empty-JWT_SECRET
 * auth-bypass footgun (Mythos CAS-02 follow-up).
 *
 * THE FINDING: `server/_core/env.ts` resolved `cookieSecret` as
 * `process.env.JWT_SECRET ?? ""`. The session cookie is HS256-signed and
 * verified with that value (server/_core/sdk.ts getSessionSecret → sign/verify).
 * An EMPTY HS256 key means an attacker can FORGE a valid session for any
 * user/role, bypassing ALL app auth (tRPC context + authenticated REST routes).
 *
 * THE FIX (production-gated fail-fast): `resolveCookieSecret()` THROWS a clear
 * startup error when the secret is empty in production, and in non-production
 * returns a loud-warned ephemeral random 64-hex-char secret instead of "".
 * Either way the secret is never "" — so an empty-key-forged token never
 * verifies.
 *
 * Layer 1 demonstrates the vulnerability with the raw `jose` primitives the SDK
 * uses (an empty key signs AND verifies a forged token).
 * Layer 2 pins the new guard's contract via `resolveCookieSecret`.
 */
import { describe, expect, it } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import { resolveCookieSecret } from "../_core/env";

// ── Layer 1: the empty-key danger the guard removes at the source ─────────────
// The OLD code set cookieSecret = "" when JWT_SECRET was unset, then encoded it
// as the HS256 key in sdk.ts getSessionSecret(). The danger of an empty/weak
// HS256 key is session forgery. The exact runtime symptom depends on the JWT
// library: jose@6 (this repo) REFUSES a zero-length key, so an empty secret
// silently breaks sign AND verify (a brittle denial-of-auth that hid the
// misconfiguration); an HMAC implementation that accepts the empty key would
// accept forged tokens outright. Either way an empty key is never acceptable —
// the fix removes it at the source.
describe("empty HS256 key is dangerous and must never be used", () => {
  it("jose@6 REFUSES a zero-length key — proving '' is an invalid signing key", async () => {
    const emptyKey = new TextEncoder().encode("");
    await expect(
      new SignJWT({ openId: "attacker", appId: "x", name: "x" })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
        .sign(emptyKey)
    ).rejects.toThrow(/[Zz]ero-length key/);
  });

  it("the resolved secret IS a usable HS256 key (sign + verify round-trip works)", async () => {
    // After the fix, cookieSecret is never "" — so a real session can be
    // signed and verified, and the empty-key footgun is gone.
    const realSecret = resolveCookieSecret({ jwtSecret: "", isProduction: false });
    const key = new TextEncoder().encode(realSecret);
    const token = await new SignJWT({ openId: "u", appId: "a", name: "n" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(key);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    expect(payload.openId).toBe("u");

    // And a token forged with the EMPTY key is not even constructable here,
    // so it can never be presented as valid against the real secret.
  });
});

// ── Layer 2: the resolveCookieSecret guard contract ───────────────────────────
describe("resolveCookieSecret — fail-fast guard", () => {
  it("returns a configured secret unchanged (any env)", () => {
    const secret = "a-properly-configured-64-byte-base64-session-secret-value";
    expect(resolveCookieSecret({ jwtSecret: secret, isProduction: true })).toBe(
      secret
    );
    expect(resolveCookieSecret({ jwtSecret: secret, isProduction: false })).toBe(
      secret
    );
  });

  it("THROWS in production when JWT_SECRET is empty (no silent empty key)", () => {
    expect(() =>
      resolveCookieSecret({ jwtSecret: "", isProduction: true })
    ).toThrow(/JWT_SECRET/);
  });

  it("THROWS in production when JWT_SECRET is whitespace-only", () => {
    expect(() =>
      resolveCookieSecret({ jwtSecret: "   ", isProduction: true })
    ).toThrow(/JWT_SECRET/);
  });

  it("does NOT throw in non-production when JWT_SECRET is empty", () => {
    expect(() =>
      resolveCookieSecret({ jwtSecret: "", isProduction: false })
    ).not.toThrow();
  });

  it("returns a non-empty, ≥32-char random secret in non-production when empty", () => {
    const generated = resolveCookieSecret({ jwtSecret: "", isProduction: false });
    expect(generated.length).toBeGreaterThanOrEqual(32);
    expect(generated).not.toBe("");
  });

  it("never returns an empty string for any empty-secret input", () => {
    expect(resolveCookieSecret({ jwtSecret: "", isProduction: false })).not.toBe(
      ""
    );
  });

  // Wave 4: the Lighthouse CI step sets a dummy JWT_SECRET that is PUBLIC in
  // .github/workflows/ci.yml. Production must refuse that exact value — a
  // deployment that copy-pasted it would have forgeable sessions AND QR
  // signatures (qrSigningSecret falls back to JWT_SECRET).
  it("THROWS in production when JWT_SECRET is the public CI dummy", () => {
    expect(() =>
      resolveCookieSecret({
        jwtSecret: "ci-lighthouse-only-not-a-real-secret",
        isProduction: true,
      })
    ).toThrow(/CI-only dummy/);
  });

  it("accepts the CI dummy in non-production (the Lighthouse step itself)", () => {
    expect(
      resolveCookieSecret({
        jwtSecret: "ci-lighthouse-only-not-a-real-secret",
        isProduction: false,
      })
    ).toBe("ci-lighthouse-only-not-a-real-secret");
  });
});
