// shared/ipHash.ts
/**
 * hashClientIp — SHA-256(rawIp + ":" + dailySalt).
 *
 * Returns null when:
 *   - rawIp is null/undefined/empty (no IP available — e.g. local test)
 *   - dailySalt is null (app_settings row missing — tolerated, salt policy TBD)
 *
 * NEVER returns the raw IP.
 *
 * Salt policy: dailySalt rotates daily and is stored in
 *   app_settings { key: "ip_daily_salt", value: "<hex-string>" }.
 * If the salt is absent, client_ip_hash is NULL on the audit row — acceptable
 * per the migration spec (client_ip_hash TEXT is nullable).
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Database } from "../client/src/lib/database.types";

export function hashClientIp(
  rawIp: string | null | undefined,
  dailySalt: string | null | undefined
): string | null {
  if (!rawIp || !dailySalt) return null;
  return createHash("sha256").update(`${rawIp}:${dailySalt}`).digest("hex");
}

/**
 * resolveClientIpHash — MYT-129D: single extraction of the
 * "x-forwarded-for → app_settings.ip_daily_salt lookup → hashClientIp" block
 * that was previously copy-pasted verbatim in
 * server/routers/families/rounds-signature.ts and
 * server/routers/entregas/signature.ts (issue #129).
 *
 * Behaviourally identical to both duplicates: same header/fallback order and
 * the same hashClientIp() call, so already-stored client_ip_hash values are
 * never invalidated.
 */
export async function resolveClientIpHash(
  db: Pick<SupabaseClient<Database>, "from">,
  req: CreateExpressContextOptions["req"]
): Promise<string | null> {
  const rawIp =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket?.remoteAddress ??
    null;
  const { data: saltRow } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "ip_daily_salt")
    .maybeSingle();
  return hashClientIp(rawIp, saltRow?.value ?? null);
}
