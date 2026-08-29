/**
 * authenticateRequest — extracts and verifies the Supabase Auth session
 * from an Express request, and resolves it to the app's `User`.
 *
 * Token sources (checked in order):
 * 1. Authorization: Bearer <token>
 * 2. @supabase/ssr cookie: sb-<ref>-auth-token (may be chunked: .0, .1, ...)
 * 3. Legacy cookie: sb-access-token (fallback)
 *
 * `auth.users` is the SINGLE source of truth for identity and role (#144).
 * Identity and role are read from the record `supabase.auth.getUser(token)`
 * returns. That call is an HTTP round-trip to GoTrue's `/user`, authenticated
 * with the CALLER's token (the service-role key rides along only as `apikey`),
 * and GoTrue resolves it against the live `auth.users` row. It is NOT a local
 * decode of the caller's (possibly stale) JWT claims — which is what makes
 * `admin.revokeStaffAccess` and `admin.setUserRole` take effect on the very
 * next request rather than at the next token refresh.
 *
 * This used to read `public.app_users` instead, while the admin UI wrote only
 * to `auth.users.app_metadata` — so new staff could log in with no permissions,
 * revocation never revoked, and role changes never applied. There is no second
 * user store any more; do not reintroduce one.
 */
import type { Request } from "express";
import { createClient } from "@supabase/supabase-js";
import type { User } from "../db";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const PROJECT_REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
const COOKIE_KEY = `sb-${PROJECT_REF}-auth-token`;

function getSupabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Parse cookies from the Cookie header into a map.
 */
function parseCookies(header: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const raw = part.slice(eq + 1).trim();
    // A malformed %-escape (`%ZZ`) makes decodeURIComponent throw URIError. That
    // used to escape this function: `handleStorageProxy` awaits us OUTSIDE its
    // try/catch, and Express 4 does not catch async rejections — so an anonymous
    // `Cookie: junk=%ZZ` hung the request and raised an unhandledRejection.
    // A cookie we cannot decode is simply not a session cookie; keep it raw.
    try {
      map[key] = decodeURIComponent(raw);
    } catch {
      map[key] = raw;
    }
  }
  return map;
}

/**
 * Reassemble a chunked @supabase/ssr cookie.
 * The session is stored as JSON in a cookie named `sb-<ref>-auth-token`.
 * If the JSON is too large, it's split into `.0`, `.1`, etc.
 */
function getSessionFromCookies(cookies: Record<string, string>): string | null {
  // Try the non-chunked cookie first
  if (cookies[COOKIE_KEY]) {
    try {
      const parsed = JSON.parse(cookies[COOKIE_KEY]);
      return parsed?.access_token ?? null;
    } catch {
      return null;
    }
  }

  // Try chunked cookies: sb-<ref>-auth-token.0, .1, .2, ...
  let assembled = "";
  for (let i = 0; i < 10; i++) {
    const chunk = cookies[`${COOKIE_KEY}.${i}`];
    if (!chunk) break;
    assembled += chunk;
  }
  if (assembled) {
    try {
      const parsed = JSON.parse(assembled);
      return parsed?.access_token ?? null;
    } catch {
      return null;
    }
  }

  // Legacy fallback: sb-access-token (raw token, not JSON)
  return cookies["sb-access-token"] ?? null;
}

/** The roles the app understands. Anything else is treated as "no role". */
const APP_ROLES = ["user", "admin", "superadmin", "voluntario", "beneficiario"] as const;

/**
 * Read the app role out of `app_metadata` — the only place the admin UI ever
 * writes it (`admin.createStaffUser` / `setUserRole` / `revokeStaffAccess`).
 *
 * Fails closed: absent, null (what `revokeStaffAccess` writes), or an
 * unrecognised value all yield `null`, which denies the request. A
 * self-registered account never gets a role, so it never gets access.
 *
 * NB: this is NOT Supabase's own `authUser.role` — that one is the Postgres
 * role ("authenticated") and says nothing about app permissions.
 */
function readAppRole(appMetadata: unknown): User["role"] | null {
  const role = (appMetadata as { role?: unknown } | null | undefined)?.role;
  if (typeof role !== "string") return null;
  return (APP_ROLES as readonly string[]).includes(role)
    ? (role as User["role"])
    : null;
}

/**
 * Trimmed, length-capped, non-empty string — or null.
 *
 * `user_metadata` is writable by the account holder itself (`auth.updateUser`
 * needs only the anon key and their own token), and it is unbounded. Values
 * from it are DISPLAY ONLY: they reach `autor_nombre`, `actor_name` and the
 * derivation PDFs, so cap them rather than persisting arbitrary length. Never
 * treat a name as an identity — `actor_id` / `autor_id` carry the auth UUID,
 * which only the server writes.
 */
const MAX_METADATA_LEN = 120;

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, MAX_METADATA_LEN);
}

/**
 * A valid `Date`, or null when absent/unparseable.
 *
 * These timestamps now arrive as JSON from GoTrue rather than from NOT NULL
 * columns, so the guarantee is weaker than it was. This does NOT prevent a
 * crash: superjson's `isDate` is `payload instanceof Date && !isNaN(valueOf())`,
 * so an `Invalid Date` skips the Date transformer and degrades to plain JSON,
 * where `Date.prototype.toJSON` yields `null`. What it prevents is quieter —
 * `auth.me` shipping `createdAt: null` for a field the `User` type declares as
 * `Date`. A three-line guard against a type lie, not against an outage.
 */
function date(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function authenticateRequest(req: Request): Promise<User | null> {
  // 1. Try Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  let token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // 2. Try cookies
  if (!token) {
    const cookieHeader = req.headers.cookie ?? "";
    const cookies = parseCookies(cookieHeader);
    token = getSessionFromCookies(cookies);
  }

  if (!token) return null;

  const supabase = getSupabaseAdmin();
  const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
  if (error || !authUser) return null;

  const role = readAppRole(authUser.app_metadata);
  if (!role) return null;

  // `nombre` before `name`: createStaffUser writes both (server/routers/admin.ts),
  // but accounts created elsewhere (Google OAuth, magic link) carry only `name`.
  const meta = authUser.user_metadata as { nombre?: unknown; name?: unknown } | null;
  // Nothing reads createdAt (verified repo-wide), so a missing timestamp falls
  // back to "now" — any valid Date will do; an invalid one would not (see date()).
  const createdAt = date(authUser.created_at) ?? new Date();

  return {
    id: authUser.id,
    // Kept for the `User` contract. Manus openIds are gone; the auth UUID is
    // the one identity now, so this is deliberately the same value as `id`.
    openId: authUser.id,
    name: str(meta?.nombre) ?? str(meta?.name),
    email: authUser.email ?? null,
    loginMethod: str((authUser.app_metadata as { provider?: unknown } | null)?.provider),
    role,
    createdAt,
    updatedAt: date(authUser.updated_at) ?? createdAt,
    lastSignedIn: date(authUser.last_sign_in_at) ?? createdAt,
  };
}
