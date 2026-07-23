import { createHmac, randomBytes } from "node:crypto";

/**
 * HMAC context string used when expanding short secrets.
 *
 * ⚠️  DO NOT CHANGE THIS VALUE after any QR codes have been issued.
 * Changing it would silently invalidate all existing signed QR codes
 * (verifySig would return false for previously valid codes).
 * If rotation is needed, set QR_SIGNING_SECRET explicitly instead.
 */
export const QR_KEY_CONTEXT = "qr-signing-key";

/**
 * Expands a short secret to ≥ 32 chars via HMAC-SHA256 (64 hex chars).
 *
 * Rationale: JWT_SECRET in dev/prod may be < 32 chars. ensureSecret() in
 * persons/qr.ts requires ≥ 32 chars. Rather than requiring a separate
 * QR_SIGNING_SECRET in every environment, we expand the fallback secret
 * deterministically so it always passes the length check.
 *
 * - Empty string → empty string (no secret configured at all).
 * - Already ≥ 32 chars → returned unchanged (no expansion needed).
 * - < 32 chars → HMAC-SHA256 with context → 64 hex chars.
 *
 * The expansion is deterministic and unique per (secret, context) pair.
 * A rotated JWT_SECRET automatically rotates all derived secrets.
 *
 * IMPORTANT: Pass a unique context string per derived key so that
 * qrSigningSecret and sessionLinkSecret produce DISTINCT derived values
 * even when both fall back to the same short JWT_SECRET. Without distinct
 * contexts, a short shared JWT_SECRET would yield colliding keys.
 *
 * Production SHOULD set QR_SIGNING_SECRET and SESSION_LINK_SECRET
 * explicitly (≥ 32 chars each) so each can be rotated independently.
 * See docs/runbooks/qr-secret-rotation.md.
 */
export function expandSecret(secret: string, context: string = QR_KEY_CONTEXT): string {
  if (!secret) return "";
  if (secret.length >= 32) return secret;
  return createHmac("sha256", secret).update(context).digest("hex");
}

/**
 * Resolves the HS256 session-cookie signing secret with a fail-fast guard.
 *
 * ⚠️  ROOT-CAUSE FIX (CAS-02 follow-up): the old `process.env.JWT_SECRET ?? ""`
 * meant the session cookie was signed AND verified (see sdk.ts
 * getSessionSecret → signSession/verifySession) with an EMPTY HS256 key when
 * JWT_SECRET was unset. An empty key lets an attacker forge a valid session
 * for any user/role, bypassing ALL app auth.
 *
 * - Production + empty/whitespace secret → THROW a clear startup error
 *   (mirrors the createUserImpersonationClient guard in
 *   client/src/lib/supabase/server.ts). Prod MUST set JWT_SECRET.
 * - Non-production + empty secret → generate a loud-warned ephemeral random
 *   64-hex-char secret. This keeps dev/CI/test green without threading
 *   JWT_SECRET into every harness, while still guaranteeing the secret is
 *   never "" — so an empty-key-forged token can never verify. The secret is
 *   per-process: restarting dev re-rolls it (existing dev cookies are dropped),
 *   which is acceptable in non-production.
 */
// Dummy that briefly lived in .github/workflows/ci.yml (now the Lighthouse
// step generates a per-run random secret instead). The literal remains in git
// history, so production refuses it outright: a deployment that copy-pasted it
// would have forgeable sessions AND QR signatures (qrSigningSecret falls back
// to JWT_SECRET).
const KNOWN_DUMMY_SECRETS = new Set(["ci-lighthouse-only-not-a-real-secret"]);

export function resolveCookieSecret(opts: {
  jwtSecret: string;
  isProduction: boolean;
}): string {
  const secret = opts.jwtSecret.trim();
  if (secret && opts.isProduction && KNOWN_DUMMY_SECRETS.has(secret)) {
    throw new Error(
      "[Auth] JWT_SECRET is set to a known CI-only dummy value, which is " +
        "public in this repository. Refusing to start in production — set a " +
        "real secret (e.g. `openssl rand -base64 64`)."
    );
  }
  if (secret) return opts.jwtSecret;

  if (opts.isProduction) {
    throw new Error(
      "[Auth] JWT_SECRET is not set. It is required in production to sign and " +
        "verify session cookies; an empty secret would let an attacker forge a " +
        "valid session for any user. Set JWT_SECRET (e.g. `openssl rand -base64 64`)."
    );
  }

  const ephemeral = randomBytes(32).toString("hex");
  console.warn(
    "[Auth] JWT_SECRET is not set — generated an EPHEMERAL random session " +
      "secret for this process. Sessions will not survive a restart and this " +
      "secret is per-process. Set JWT_SECRET for stable dev sessions. This " +
      "fallback is REFUSED in production."
  );
  return ephemeral;
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: resolveCookieSecret({
    jwtSecret: process.env.JWT_SECRET ?? "",
    isProduction: process.env.NODE_ENV === "production",
  }),
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  appUrl: process.env.APP_URL ?? "https://bocatasdg-mvcpdsc2.manus.space",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /**
   * 256-bit secret used to HMAC-sign QR-code payloads (Phase 6 QA-1A).
   * Falls back to JWT_SECRET in dev so existing dev environments keep
   * working without an extra env var; production MUST set this explicitly
   * via QR_SIGNING_SECRET. See `shared/qr/payload.ts` for usage and
   * `docs/runbooks/qr-secret-rotation.md` for rotation procedure.
   *
   * Short secrets (< 32 chars) are expanded via HMAC-SHA256 so they always
   * pass the ensureSecret() length check. See expandSecret() above.
   */
  qrSigningSecret: expandSecret(
    process.env.QR_SIGNING_SECRET ?? process.env.JWT_SECRET ?? "",
    "qr-signing-key"
  ),
  /**
   * Supabase JWT secret (HS256) used to sign short-lived impersonation tokens
   * so server-side tRPC procedures can call SECURITY DEFINER RPCs that check
   * `auth.jwt() -> 'app_metadata' ->> 'role'` (e.g. confirm_legacy_familias_import).
   * Set via SUPABASE_JWT_SECRET env var (Supabase Dashboard → Settings → API → JWT Secret).
   */
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? "",
  /**
   * HMAC-SHA256 secret for session enlace (magic-link) tokens (cierre de sesión).
   * Only the hash of the token is stored in the DB; the plaintext token is
   * returned once to the coordinator and never persisted.
   *
   * Falls back to JWT_SECRET in dev so existing environments work without an
   * extra env var. Production MUST set SESSION_LINK_SECRET independently so
   * the link secret can be rotated without invalidating active sessions.
   * Minimum 32 characters. See shared/sessionEnlace.ts.
   */
  sessionLinkSecret: expandSecret(
    process.env.SESSION_LINK_SECRET ?? process.env.JWT_SECRET ?? "",
    "session-link-key" // distinct context from qr-signing-key to prevent collision
  ),
};
