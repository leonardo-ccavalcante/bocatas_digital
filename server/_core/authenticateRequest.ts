/**
 * authenticateRequest — extracts and verifies the Supabase Auth session
 * from an Express request (cookie or Authorization header).
 *
 * Replaces sdk.authenticateRequest() from the Manus OAuth era.
 */
import type { Request } from "express";
import { createClient } from "@supabase/supabase-js";
import { getUserById, type User } from "../db";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticateRequest(req: Request): Promise<User> {
  // 1. Try Authorization header
  const authHeader = req.headers.authorization;
  let token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // 2. Try sb-access-token cookie
  if (!token) {
    const cookies = req.headers.cookie ?? "";
    const match = cookies.match(/sb-access-token=([^;]+)/);
    token = match ? decodeURIComponent(match[1]) : null;
  }

  if (!token) {
    throw new Error("No auth token found");
  }

  const supabase = getSupabaseAdmin();
  const { data: { user: authUser }, error } = await supabase.auth.getUser(token);

  if (error || !authUser) {
    throw new Error("Invalid auth token");
  }

  const user = await getUserById(authUser.id);
  if (!user) {
    throw new Error("User not found in app_users");
  }

  return user;
}
