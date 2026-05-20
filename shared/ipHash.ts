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

export function hashClientIp(
  rawIp: string | null | undefined,
  dailySalt: string | null | undefined
): string | null {
  if (!rawIp || !dailySalt) return null;
  return createHash("sha256").update(`${rawIp}:${dailySalt}`).digest("hex");
}
