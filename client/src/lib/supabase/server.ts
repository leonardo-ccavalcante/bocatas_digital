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
