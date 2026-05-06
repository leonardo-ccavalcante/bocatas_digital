/**
 * Regression test: confirm_legacy_familias_import RPC must succeed when called
 * with a user-impersonation JWT (not service-role key).
 *
 * Root cause of bug: the tRPC handler used createAdminClient() (service-role key)
 * to call the RPC. The RPC is SECURITY DEFINER and calls get_user_role() →
 * auth.jwt() -> 'app_metadata' ->> 'role'. With service-role key there is no
 * user JWT, so get_user_role() returns 'beneficiario' and the role check fails
 * with code 42501.
 *
 * Fix: createUserImpersonationClient() signs a short-lived Supabase JWT with
 * the user's actorId (String(user.id)) as `sub` and role in app_metadata.
 *
 * IMPORTANT: `sub` must be String(ctx.user.id) NOT openId, because:
 *   - auth.uid() in Supabase casts sub to UUID → fails for numeric IDs
 *   - The function now uses auth.jwt() ->> 'sub' (no UUID cast)
 *   - created_by is stored as String(ctx.user.id) — must match sub for ownership check
 */

import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !jwtSecret) {
  throw new Error(
    "Missing required env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, " +
    "SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET"
  );
}

const adminDb = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Helper: create a Supabase client impersonating a user with the given actorId and role */
async function makeUserClient(actorId: string, role: string) {
  const secretKey = new TextEncoder().encode(jwtSecret!);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    sub: actorId,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { role },
    iat: now,
    exp: now + 300,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(secretKey);

  return createClient(supabaseUrl!, supabaseAnonKey!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// Tokens created during tests — cleaned up in afterAll
const createdTokens: string[] = [];

afterAll(async () => {
  if (createdTokens.length > 0) {
    await adminDb
      .from("bulk_import_previews")
      .delete()
      .in("token", createdTokens);
  }
});

describe("createUserImpersonationClient — SUPABASE_JWT_SECRET integration", () => {
  it("role check passes for admin (no 42501 error)", async () => {
    // A fake token — the RPC will fail with 'preview expired or not found',
    // NOT with 'forbidden: legacy import requires admin role'. This proves
    // the role check passed.
    const adminClient = await makeUserClient("999", "admin");
    const { error } = await adminClient.rpc("confirm_legacy_familias_import", {
      p_token: "00000000-0000-0000-0000-000000000001",
      p_src_filename: "test.csv",
    });

    // Must NOT be a role/auth error (42501)
    expect(error?.code).not.toBe("42501");
    // Expected: preview not found (because the token doesn't exist)
    expect(error?.message).not.toContain("forbidden");
    expect(error?.message).not.toContain("admin role");
  });

  it("rejects non-admin role (beneficiario) with 42501", async () => {
    const beneficiarioClient = await makeUserClient("998", "beneficiario");
    const { error } = await beneficiarioClient.rpc("confirm_legacy_familias_import", {
      p_token: "00000000-0000-0000-0000-000000000002",
      p_src_filename: "test.csv",
    });

    expect(error?.code).toBe("42501");
    expect(error?.message).toContain("forbidden");
  });

  it("full flow: insert preview with actorId, confirm with matching sub in JWT", async () => {
    // actorId = String(ctx.user.id) — must match created_by and JWT sub
    const actorId = `test-actor-${Date.now()}`;

    const payload = {
      groups: [
        {
          legacy_numero_familia: `TEST-RPC-${Date.now()}`,
          titular_index: 0,
          rows: [],
          person_dedup_hits: [],
          errors: [],
          family_already_imported: false,
        },
      ],
      src_filename: "test-confirm.csv",
    };

    const { data: preview, error: insertErr } = await adminDb
      .from("bulk_import_previews")
      .insert({ parsed_rows: payload, created_by: actorId })
      .select("token")
      .single();

    expect(insertErr).toBeNull();
    expect(preview?.token).toBeTruthy();
    createdTokens.push(preview!.token);

    // Call RPC with user-impersonation client — sub = actorId (same as created_by)
    const userClient = await makeUserClient(actorId, "admin");
    const { data, error: rpcErr } = await userClient.rpc(
      "confirm_legacy_familias_import",
      {
        p_token: preview!.token,
        p_src_filename: "test-confirm.csv",
      }
    );

    // Must NOT be a role/auth error or UUID cast error (the original bugs)
    if (rpcErr) {
      expect(rpcErr.code).not.toBe("42501"); // forbidden: role check
      expect(rpcErr.code).not.toBe("22P02"); // invalid UUID cast (original bug)
      expect(rpcErr.message).not.toContain("forbidden");
      expect(rpcErr.message).not.toContain("unauthenticated");
    }

    // RPC succeeded — data should have the expected shape
    if (!rpcErr) {
      expect(data).toMatchObject({
        created: expect.any(Number),
        skipped: expect.any(Number),
        errors: expect.any(Number),
      });
    }
  });
});
