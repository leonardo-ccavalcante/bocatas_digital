/**
 * sessionEnlace.ts — Magic-link token helpers for the session enlace flow.
 *
 * Pattern: opaque random token returned ONCE to the caller.
 * Only HMAC-SHA256(token, secret) is stored in the DB (enlace_token_hash).
 * Even a DB read attacker cannot reconstruct the token without knowing
 * SESSION_LINK_SECRET — unlike a bare-SHA256 approach.
 *
 * Uses the Web Crypto API (globalThis.crypto.subtle) — same code path on
 * the browser and on Node 22+ (no node:crypto import needed).
 *
 * The server passes SESSION_LINK_SECRET via ENV.sessionLinkSecret.
 * Minimum secret length: 32 characters (enforced by hashSessionToken).
 */

const textEncoder = new TextEncoder();

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(message)
  );
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generates a cryptographically random session token (32 bytes = 64 hex chars).
 *
 * The caller MUST return this plaintext token to the client ONCE and NEVER
 * persist it. Only the hash (see hashSessionToken) is stored.
 */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Returns HMAC-SHA256(token, secret) as a 64-character hex string.
 * This is the value that MUST be persisted in program_sessions.enlace_token_hash.
 *
 * Throws if secret is shorter than 32 characters (misconfiguration guard).
 */
export async function hashSessionToken(token: string, secret: string): Promise<string> {
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_LINK_SECRET must be at least 32 characters — set it via environment variable"
    );
  }
  return hmacSha256Hex(token, secret);
}

/**
 * Constant-time-ish comparison of HMAC(token, secret) vs storedHash.
 *
 * Returns false (never throws) for any input that would prevent a secure
 * comparison: empty token, empty hash, short secret, or hash mismatch.
 * This ensures timing-channel surface is minimal for the 64-char comparison.
 */
export async function verifySessionToken(
  token: string,
  storedHash: string,
  secret: string
): Promise<boolean> {
  if (!secret || secret.length < 32) return false;
  if (!token || !storedHash) return false;
  let expected: string;
  try {
    expected = await hmacSha256Hex(token, secret);
  } catch {
    return false;
  }
  if (expected.length !== storedHash.length) return false;
  // Length-equal constant-time XOR compare (both 64-char hex strings)
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}
