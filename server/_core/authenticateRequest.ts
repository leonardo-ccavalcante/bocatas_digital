/**
 * authenticateRequest — extracts and verifies the Supabase Auth session
 * from an Express request.
 *
 * Token sources (checked in order):
 * 1. Authorization: Bearer <token>
 * 2. @supabase/ssr cookie: sb-<ref>-auth-token (may be chunked: .0, .1, ...)
 * 3. Legacy cookie: sb-access-token (fallback)
 */
import type { Request } from "express";
import { createClient } from "@supabase/supabase-js";
import { getUserById, type User } from "../db";

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
    const val = part.slice(eq + 1).trim();
    map[key] = decodeURIComponent(val);
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

  return await getUserById(authUser.id) ?? null;
}
