/**
 * shared/qr/payload — canonical QR URI for Bocatas Digital.
 *
 * Format: `bocatas://person/<uuid>?sig=<hmac8>`
 *
 * - `<uuid>`  is the Supabase `persons.id` (opaque, RGPD-compliant — no PII).
 * - `<hmac8>` is the first 8 hex chars of HMAC-SHA256(uuid, secret).
 *   Used as anti-spoof; verified server-side. 32-bit collision space is
 *   sufficient because every guess requires a server roundtrip → tRPC
 *   rate-limit + Vercel edge defaults push brute-force time well beyond
 *   any practical attack window. Bump via `QR_SIG_LENGTH` env knob if
 *   needed (not yet implemented; documented for future rotation).
 *
 * Used by:
 *   - server: `server/routers/persons/qr.ts` (build + verify)
 *   - client: `client/src/features/persons/components/QRCodeCard.tsx` (render only via build)
 *   - client: `client/src/features/checkin/...` (parse on scan)
 *
 * Web/Node interop:
 *   - In Node, `globalThis.crypto.subtle` is available since Node 19+; Bocatas
 *     stack runs Node 22 so we use the Web Crypto API uniformly. No `node:crypto`
 *     import needed → same code path on browser and server.
 */

const SIG_LENGTH_HEX = 8;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYLOAD_REGEX = new RegExp(
  `^bocatas://person/([0-9a-f-]{36})\\?sig=([a-f0-9]{${SIG_LENGTH_HEX}})$`
);

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

export async function buildQrPayload(uuid: string, secret: string): Promise<string> {
  if (!UUID_REGEX.test(uuid)) {
    throw new Error(`Invalid UUID for QR payload: ${uuid}`);
  }
  if (!secret || secret.length < 32) {
    throw new Error("QR signing secret must be at least 32 characters");
  }
  const fullSig = await hmacSha256Hex(uuid, secret);
  const sig = fullSig.slice(0, SIG_LENGTH_HEX);
  return `bocatas://person/${uuid}?sig=${sig}`;
}

export interface ParsedQrPayload {
  uuid: string;
  sig: string;
}

export function parseQrPayload(raw: string): ParsedQrPayload | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const match = raw.match(PAYLOAD_REGEX);
  if (!match) return null;
  const [, uuid, sig] = match;
  if (!UUID_REGEX.test(uuid)) return null;
  return { uuid: uuid.toLowerCase(), sig: sig.toLowerCase() };
}

/**
 * Verifies that `sig` is a valid HMAC for `uuid` under `secret`.
 * Constant-time-ish on the JS string compare; sufficient for 8-hex
 * signature where timing-channel surface is small.
 */
export async function verifySig(
  uuid: string,
  sig: string,
  secret: string
): Promise<boolean> {
  if (!UUID_REGEX.test(uuid)) return false;
  if (!/^[a-f0-9]+$/i.test(sig) || sig.length !== SIG_LENGTH_HEX) return false;
  const expected = (await hmacSha256Hex(uuid, secret)).slice(0, SIG_LENGTH_HEX);
  // Length-equal constant-time-ish compare.
  let diff = 0;
  for (let i = 0; i < SIG_LENGTH_HEX; i++) {
    diff |= expected.charCodeAt(i) ^ sig.toLowerCase().charCodeAt(i);
  }
  return diff === 0;
}
