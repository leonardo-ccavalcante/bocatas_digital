/**
 * User database helpers — backed by Supabase PostgreSQL (public.app_users).
 * Replaces the legacy drizzle/mysql2 implementation.
 */
import { createClient } from "@supabase/supabase-js";

/** Untyped admin client for app_users (table not yet in generated Database types) */
function getAppUsersClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface AppUser {
  id: string;
  legacy_mysql_id: number | null;
  open_id: string | null;
  name: string | null;
  email: string | null;
  login_method: string | null;
  role: "user" | "admin" | "superadmin" | "voluntario" | "beneficiario";
  created_at: string;
  updated_at: string;
  last_signed_in: string;
}

/**
 * Backward-compatible User type that matches the shape expected by ctx.user consumers.
 * - `id` is now the UUID string (was MySQL int)
 * - `openId` maps to `open_id` (preserved for transition)
 */
export type User = {
  id: string;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin" | "superadmin" | "voluntario" | "beneficiario";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

function toUser(row: AppUser): User {
  return {
    id: row.id,
    openId: row.open_id ?? row.id,
    name: row.name,
    email: row.email,
    loginMethod: row.login_method,
    role: row.role,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastSignedIn: new Date(row.last_signed_in),
  };
}

/**
 * Get a user by their Supabase Auth UUID.
 */
export async function getUserById(authId: string): Promise<User | undefined> {
  const db = getAppUsersClient();
  const { data, error } = await db
    .from("app_users")
    .select("*")
    .eq("id", authId)
    .single();

  if (error || !data) return undefined;
  return toUser(data as AppUser);
}

/**
 * Get a user by their legacy Manus openId (for transition period).
 */
export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = getAppUsersClient();
  const { data, error } = await db
    .from("app_users")
    .select("*")
    .eq("open_id", openId)
    .single();

  if (error || !data) return undefined;
  return toUser(data as AppUser);
}

/**
 * Upsert a user in app_users. Used during auth callback.
 */
export async function upsertUser(user: {
  id: string; // auth.users UUID
  openId?: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: string;
  lastSignedIn?: Date;
}): Promise<void> {
  const db = getAppUsersClient();

  const row: Record<string, unknown> = { id: user.id };
  if (user.openId !== undefined) row.open_id = user.openId;
  if (user.name !== undefined) row.name = user.name;
  if (user.email !== undefined) row.email = user.email;
  if (user.loginMethod !== undefined) row.login_method = user.loginMethod;
  if (user.role !== undefined) row.role = user.role;
  if (user.lastSignedIn !== undefined) row.last_signed_in = user.lastSignedIn.toISOString();
  row.updated_at = new Date().toISOString();

  const { error } = await db.from("app_users").upsert(row, { onConflict: "id" });
  if (error) {
    console.error("[Database] Failed to upsert user:", error.message);
    throw error;
  }
}

// Legacy compatibility: getDb is no longer needed but some test files may reference it.
export async function getDb() {
  console.warn("[Database] getDb() is deprecated — use Supabase client directly");
  return null;
}
