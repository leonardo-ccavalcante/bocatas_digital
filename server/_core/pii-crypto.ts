/**
 * pii-crypto.ts — App-layer encryption for GDPR special-category free-text PII.
 *
 * Used for high-risk FREE-TEXT fields that are NOT aggregated or indexed
 * (e.g. persons.colectivo_otros). Structured/aggregatable special-category
 * fields (e.g. persons.colectivos enum[]) are deliberately NOT encrypted here —
 * they must remain queryable for the IRPF report and are protected instead by
 * disk-encryption-at-rest + redaction (rlsRedaction.ts) + column grants + k-anon.
 *
 * Scheme: AES-256-GCM, random 12-byte IV per value, versioned ciphertext.
 * Key: derived (SHA-256) from process.env.PII_ENCRYPTION_KEY (Manus IM secret),
 * NEVER stored in the database, migrations, or git.
 *
 * FAIL-CLOSED: if the key is absent/too short, encryptPII THROWS rather than
 * silently persisting special-category plaintext. decryptPII returns legacy
 * plaintext (pre-encryption values) unchanged, but throws on a malformed or
 * undecryptable ciphertext — misconfiguration must be loud, not silent.
 *
 * Ciphertext format (single string): "v1:<ivB64>:<tagB64>:<ctB64>".
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

const SCHEME = "v1";
const IV_LEN = 12; // GCM standard nonce length
const MIN_KEY_LEN = 16;

function getKey(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw || raw.length < MIN_KEY_LEN) {
    throw new Error(
      "PII_ENCRYPTION_KEY is not set (or shorter than 16 chars). Refusing to " +
        "handle GDPR special-category data without encryption (fail-closed). " +
        "Set PII_ENCRYPTION_KEY in the environment.",
    );
  }
  // Derive a fixed 32-byte key from the configured secret so the env var can be
  // any sufficiently-long passphrase (mirrors QR_SIGNING_SECRET usage).
  return createHash("sha256").update(raw, "utf8").digest();
}

/** Whether the encryption key is configured. Callers can gate feature exposure. */
export function isPiiCryptoConfigured(): boolean {
  const raw = process.env.PII_ENCRYPTION_KEY;
  return !!raw && raw.length >= MIN_KEY_LEN;
}

/**
 * Encrypt a free-text special-category value. Returns null for null/empty
 * input. THROWS if the key is not configured (fail-closed — never persist
 * special-category plaintext).
 */
export function encryptPII(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SCHEME, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

/**
 * Decrypt a value produced by encryptPII. Returns null for null/empty input.
 * A value without the scheme prefix is treated as legacy plaintext and
 * returned unchanged (tolerates data that predates encryption). THROWS on a
 * malformed or undecryptable ciphertext (e.g. wrong/absent key, tampering).
 */
export function decryptPII(payload: string | null | undefined): string | null {
  if (payload === null || payload === undefined || payload === "") return null;
  if (!payload.startsWith(SCHEME + ":")) return payload; // legacy plaintext
  const parts = payload.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed encrypted PII payload");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
  return pt.toString("utf8");
}
