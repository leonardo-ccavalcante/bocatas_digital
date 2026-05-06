/**
 * Supabase server-side client.
 *
 * This module provides a Supabase client intended for server-side use
 * (tRPC procedures, Edge Functions, server actions) where cookies are
 * managed manually rather than via the browser's document.cookie.
 *
 * In the Manus template the "server" runs as Express + tRPC, so we
 * expose a factory that accepts the raw Authorization header value so
 * that RLS policies are evaluated against the authenticated user.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import type { Database } from "../database.types";

/**
 * Creates a Supabase client that impersonates the authenticated user
 * by forwarding their JWT in the Authorization header.
 *
 * Use this inside tRPC procedures that need to query Supabase with
 * row-level security enforced for the current user.
 *
 * @param authorizationHeader - The raw "Bearer <token>" header value
 */
export function createServerClient(authorizationHeader?: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authorizationHeader
        ? { Authorization: authorizationHeader }
        : {},
    },
    auth: {
      // Disable automatic session persistence — server context is stateless
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Creates a Supabase admin client using the service role key.
 * SECURITY: Only use this in trusted server-side code.
 * Never expose the service role key to the browser.
 *
 * In tRPC procedures, access via process.env.SUPABASE_SERVICE_ROLE_KEY.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!serviceRoleKey) {
    throw new Error(
      "[Supabase] SUPABASE_SERVICE_ROLE_KEY is not set. " +
      "Admin client requires the service role key."
    );
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Creates a short-lived Supabase client that impersonates a specific user
 * by signing a Supabase-compatible JWT with their actorId (sub) and role.
 *
 * Use this when calling SECURITY DEFINER RPCs that check `auth.jwt()` or
 * `auth.uid()` internally — e.g. `confirm_legacy_familias_import`.
 * The token expires in 5 minutes (single-use, fire-and-forget).
 *
 * IMPORTANT: `actorId` must be the same value stored in `created_by` on the
 * preview row (i.e. `String(ctx.user.id)`, the numeric DB id as a string).
 * The RPC checks `created_by = auth.uid()::text` for ownership verification.
 *
 * @param actorId - String(ctx.user.id) — the numeric DB id used as JWT `sub`
 * @param role    - The user's app role ('admin' | 'superadmin' | 'user')
 */
export async function createUserImpersonationClient(
  actorId: string,
  role: string
) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY ?? "";
  const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? "";

  if (!jwtSecret) {
    throw new Error(
      "[Supabase] SUPABASE_JWT_SECRET is not set. " +
      "Required for user-impersonation RPC calls."
    );
  }

  const secretKey = new TextEncoder().encode(jwtSecret);
  const now = Math.floor(Date.now() / 1000);
  const userJwt = await new SignJWT({
    sub: actorId,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { role },
    iat: now,
    exp: now + 300, // 5 minutes — single-use, fire-and-forget
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(secretKey);

  return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
