// server/__tests__/resolveClientIpHash.test.ts
/**
 * MYTHOS: MYT-129D — resolveClientIpHash(db, req) must be the single
 * extraction of the "x-forwarded-for → salt lookup (app_settings) →
 * hashClientIp" block that is currently copy-pasted verbatim in
 * server/routers/families/rounds-signature.ts and
 * server/routers/entregas/signature.ts (issue #129).
 *
 * This test fails RED until shared/ipHash.ts exports resolveClientIpHash.
 * It asserts the EXACT same hash format hashClientIp already produces
 * (SHA-256(rawIp:dailySalt)) so existing stored client_ip_hash values are
 * never invalidated by the extraction.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { resolveClientIpHash } from "../../shared/ipHash";

const SALT = "test-daily-salt-abc123";
const IP = "81.47.102.200";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// Minimal Supabase-like stub for the app_settings.select().eq().maybeSingle() chain.
function makeDb(saltValue: string | null) {
  return {
    from: (table: string) => {
      if (table !== "app_settings") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: saltValue === null ? null : { value: saltValue },
              error: null,
            }),
          }),
        }),
      };
    },
  };
}

function makeReq(headers: Record<string, string | undefined>, remoteAddress?: string) {
  return { headers, socket: { remoteAddress } } as never;
}

describe("resolveClientIpHash (MYT-129D shared extraction)", () => {
  it("hashes the first x-forwarded-for hop with the daily salt from app_settings", async () => {
    const db = makeDb(SALT);
    const req = makeReq({ "x-forwarded-for": `${IP}, 10.0.0.1` });
    const result = await resolveClientIpHash(db as never, req);
    expect(result).toBe(sha256(`${IP}:${SALT}`));
  });

  it("falls back to socket.remoteAddress when x-forwarded-for is absent", async () => {
    const db = makeDb(SALT);
    const req = makeReq({}, IP);
    const result = await resolveClientIpHash(db as never, req);
    expect(result).toBe(sha256(`${IP}:${SALT}`));
  });

  it("returns null (not the raw IP) when the salt row is missing", async () => {
    const db = makeDb(null);
    const req = makeReq({ "x-forwarded-for": IP });
    const result = await resolveClientIpHash(db as never, req);
    expect(result).toBeNull();
  });

  it("returns null when there is no IP at all", async () => {
    const db = makeDb(SALT);
    const req = makeReq({});
    const result = await resolveClientIpHash(db as never, req);
    expect(result).toBeNull();
  });
});
