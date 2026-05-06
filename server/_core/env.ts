export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
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
   */
  qrSigningSecret:
    process.env.QR_SIGNING_SECRET ?? process.env.JWT_SECRET ?? "",
  /**
   * Supabase JWT secret (HS256) used to sign short-lived impersonation tokens
   * so server-side tRPC procedures can call SECURITY DEFINER RPCs that check
   * `auth.jwt() -> 'app_metadata' ->> 'role'` (e.g. confirm_legacy_familias_import).
   * Set via SUPABASE_JWT_SECRET env var (Supabase Dashboard → Settings → API → JWT Secret).
   */
  supabaseJwtSecret: process.env.SUPABASE_JWT_SECRET ?? "",
};
