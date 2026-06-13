/**
 * Integration regression test for Wave 7 (Mythos CAS-ANON-RPC, P1).
 *
 * Bug: on PROD, 6 SECURITY DEFINER functions in `public` were EXECUTE-able by
 * the `anon`/PUBLIC role (verified via MCP). SECURITY DEFINER bypasses RLS, so a
 * browser holding the public anon key could call them via PostgREST
 * `/rest/v1/rpc/<fn>` — bypassing the tRPC + redaction boundary (#50). Direct
 * anon TABLE access is already RLS-denied, so these were the only anon RLS bypass.
 *
 * Fix (migration 20260613000001): REVOKE EXECUTE FROM PUBLIC, anon on all 6
 * (+ authenticated on the 4 non-import helpers), then GRANT back ONLY the role
 * that calls each (service_role / authenticated / postgres-internal).
 *
 * REPO vs PROD honesty (laquesis): on a fresh repo reset the ONLY net-new
 * anon-reachable leak this migration closes is `get_eligible_families_for_reparto`
 * (created default-PUBLIC in 20260606000001). The other 5 were already
 * PUBLIC-revoked by earlier migrations (20260605*, 20260612000004) in REPO state;
 * the REVOKEs on them converge the DRIFTED prod ACL (where un-applied 20260605
 * revokes left anon) + are defense-in-depth. So the genuine local RED→GREEN is
 * get_eligible; the other anon-denied checks are lockdown guards.
 *
 * RED-capable assertion: post-fix, anon is rejected at the EXECUTE layer with
 * `42501 permission denied for function <name>`. We assert THAT specific signal —
 * NOT a bare truthy error — so the test cannot be fooled by a function's own
 * internal role-guard RAISE (confirm/enrich RAISE `42501 forbidden: requires
 * admin role` for non-admins, which would be truthy even if EXECUTE were granted).
 *
 * Requires real Supabase env (+ JWT secret); skips otherwise.
 *
 * MYTHOS: CAS-ANON-RPC (Wave 7)
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { getRealSupabaseDescribe, hasRealSupabaseEnv } from "./db-test-env";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
const hasDb = hasRealSupabaseEnv({ requireJwtSecret: true });
const describeDb = getRealSupabaseDescribe({ requireJwtSecret: true });

// A client that authenticates with the bare ANON key (PostgREST role = anon) —
// exactly what a browser holding the public key can do.
const anonDb = hasDb
  ? createClient(supabaseUrl!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// A client carrying a server-minted `authenticated` JWT (mirrors
// createUserImpersonationClient). Only reachable with SUPABASE_JWT_SECRET.
async function makeAuthenticatedClient(role = "admin") {
  const jwt = await new SignJWT({
    sub: "wave7-test-actor",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { role },
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(jwtSecret!));
  return createClient(supabaseUrl!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const RANDOM_UUID = "00000000-0000-4000-8000-000000000abc";

// The EXECUTE-layer denial signal — fires BEFORE the function body, so it can't
// be confused with a function's own internal guard RAISE (which carries a
// different message like "forbidden: requires admin role"). This is what makes
// the anon-denied assertions RED-capable + isolated to the EXECUTE revoke.
function expectExecuteDenied(error: { code?: string; message?: string } | null) {
  expect(error).toBeTruthy();
  expect(error?.code).toBe("42501");
  expect(error?.message ?? "").toMatch(/permission denied for function/);
}

describeDb("Wave 7 — anon cannot execute SECURITY DEFINER RPCs (CAS-ANON-RPC)", () => {
  // get_eligible is the genuine local RED→GREEN (was default-PUBLIC). Pre-fix,
  // anon executed it (no error → these assertions FAIL); post-fix, EXECUTE-denied.
  it("anon is EXECUTE-denied on get_eligible_families_for_reparto (the net-new repo leak)", async () => {
    const { error } = await anonDb!.rpc("get_eligible_families_for_reparto", {
      p_program_id: RANDOM_UUID,
    });
    expectExecuteDenied(error);
  });

  // The remaining 5: lockdown guards (already PUBLIC-revoked in repo; close the
  // drifted prod anon grants). Asserting the EXECUTE-denial message proves it's
  // the grant, not an internal RAISE.
  it("anon is EXECUTE-denied on upsert_familia_enrollment", async () => {
    const { error } = await anonDb!.rpc("upsert_familia_enrollment", {
      p_person_id: RANDOM_UUID,
      p_program_id: RANDOM_UUID,
      p_family_id: RANDOM_UUID,
      p_member_index: 0,
    });
    expectExecuteDenied(error);
  });

  it("anon is EXECUTE-denied on backfill_legacy_person", async () => {
    const { error } = await anonDb!.rpc("backfill_legacy_person", {
      p_person_id: RANDOM_UUID,
      p_person: {},
    });
    expectExecuteDenied(error);
  });

  it("anon is EXECUTE-denied on check_soft_delete_schema", async () => {
    const { error } = await anonDb!.rpc("check_soft_delete_schema", {
      table_names: ["persons"],
    });
    expectExecuteDenied(error);
  });

  // The 7th fn cassandra caught: default-PUBLIC + SECURITY DEFINER, dead (no
  // caller) but anon-executable → RLS bypass leaking family ids. Genuine
  // RED→GREEN on local (was PUBLIC pre-migration).
  it("anon is EXECUTE-denied on get_documentos_faltantes (the 7th, was default-PUBLIC)", async () => {
    const { error } = await anonDb!.rpc("get_documentos_faltantes", {
      p_programa_id: RANDOM_UUID,
    });
    expectExecuteDenied(error);
  });

  it("anon is EXECUTE-denied on confirm_legacy_familias_import (not its internal admin-guard)", async () => {
    const { error } = await anonDb!.rpc("confirm_legacy_familias_import", {
      p_token: RANDOM_UUID,
      p_src_filename: "x.csv",
      p_mode: "merge",
      p_excluded_numbers: [],
    });
    expectExecuteDenied(error);
    // Distinguishes the EXECUTE revoke from the body's own RAISE.
    expect(error?.message ?? "").not.toMatch(/forbidden|admin role/i);
  });

  it("anon is EXECUTE-denied on enrich_families_from_informes (not its internal admin-guard)", async () => {
    const { error } = await anonDb!.rpc("enrich_families_from_informes", {
      p_token: RANDOM_UUID,
      p_src_filename: "x.csv",
    });
    expectExecuteDenied(error);
    expect(error?.message ?? "").not.toMatch(/forbidden|admin role/i);
  });
});

describeDb("Wave 7 — authenticated KEEPS the legacy-import RPCs (no app regression)", () => {
  // The fix must NOT break the import flow, which calls these as `authenticated`.
  // A permission/visibility rejection would be code 42501 (permission denied) or
  // PGRST202 (function not exposed to this role). Any other outcome (clean run
  // or a logic/token error from inside the function) proves authenticated can
  // still execute it.
  const isPermissionBlocked = (error: { code?: string } | null) =>
    error?.code === "42501" || error?.code === "PGRST202";

  it("authenticated can still EXECUTE confirm_legacy_familias_import", async () => {
    const authDb = await makeAuthenticatedClient();
    const { error } = await authDb.rpc("confirm_legacy_familias_import", {
      p_token: RANDOM_UUID,
      p_src_filename: "x.csv",
      p_mode: "merge",
      p_excluded_numbers: [],
    });
    expect(isPermissionBlocked(error)).toBe(false);
  });

  it("authenticated can still EXECUTE enrich_families_from_informes", async () => {
    const authDb = await makeAuthenticatedClient();
    const { error } = await authDb.rpc("enrich_families_from_informes", {
      p_token: RANDOM_UUID,
      p_src_filename: "x.csv",
    });
    expect(isPermissionBlocked(error)).toBe(false);
  });

  // Regression guard: get_eligible relied on the default PUBLIC grant, so a bare
  // REVOKE FROM PUBLIC silently stripped service_role too (server path = 42501).
  // The migration GRANTs service_role back explicitly — assert the server path
  // still works (the 8/8-green test originally MISSED this; systematic-debugging).
  it("service_role can still EXECUTE get_eligible_families_for_reparto (server reparto path)", async () => {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const svcDb = createClient(supabaseUrl!, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await svcDb.rpc("get_eligible_families_for_reparto", {
      p_program_id: RANDOM_UUID,
    });
    expect(isPermissionBlocked(error)).toBe(false);
  });

  it("service_role can still EXECUTE check_soft_delete_schema", async () => {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const svcDb = createClient(supabaseUrl!, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await svcDb.rpc("check_soft_delete_schema", {
      table_names: ["persons"],
    });
    expect(error).toBeNull(); // null ⇒ not permission-blocked; stronger than isPermissionBlocked
    expect(Array.isArray(data)).toBe(true);
  });
});
