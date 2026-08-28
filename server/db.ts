/**
 * The `User` type used by `ctx.user` across the app.
 *
 * ⚠️ The `public.app_users` helpers below are DEAD (#144). `authenticateRequest`
 * no longer reads that table — `auth.users` is the single source of truth for
 * identity and role, because that is where the admin UI writes them. While the
 * app read `app_users` and the UI wrote `app_metadata`, new staff could log in
 * with no permissions, `revokeStaffAccess` never revoked, and `setUserRole`
 * never applied.
 *
 * Do NOT wire these helpers back up, and do NOT add a second user store. The
 * table still exists in production, unused, pending retirement; it has never
 * had a migration in this repo, so it does not exist locally or in CI at all.
 *
 * `upsertUser` / `getUserByOpenId` are reachable only from `server/_core/sdk.ts`
 * (the Manus OAuth path), which itself has zero importers. Retiring all of it is
 * a follow-up, kept out of the #144 fix to keep a P0 diff small.
 */
import { createClient } from "@supabase/supabase-js";

/** Untyped admin client for app_users (table not in generated Database types yet) */
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
 * Backward-compatible User type for ctx.user consumers.
 * id is now UUID string (was MySQL int). openId preserved for transition.
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

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = getAppUsersClient();
  const { data, error } = await db
    .from("app_users")
    .select("*")
    .eq("email", email)
    .single();
  if (error || !data) return undefined;
  return toUser(data as AppUser);
}

export async function upsertUser(user: {
  id: string;
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

/** @deprecated — kept for test compatibility */
export async function getDb() {
  return null;
}
