export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

/**
 * Generic, PII-free Spanish message returned to the client for any server-fault
 * (INTERNAL_SERVER_ERROR) error. The raw Supabase/Postgres message — which can
 * leak schema internals or column VALUES (= PII) — is scrubbed at the tRPC
 * errorFormatter boundary and replaced with this. A correlationId is appended
 * so support can cross-reference the full error in the server logs.
 * See server/_core/trpc.ts (errorFormatter) and CLAUDE.md §Compliance.
 */
export const GENERIC_SERVER_ERROR_MSG =
  'Error interno del servidor. Inténtalo de nuevo.';
