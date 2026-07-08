/**
 * Integration regression for #116 (Mythos TES-04, P2).
 *
 * Bug: the repo migration chain produced `deliveries.registrado_por` as `uuid`
 * (earliest create wins — 20260411081841; the later v2 TEXT creates are
 * CREATE TABLE IF NOT EXISTS no-ops), while PROD is `text`. entregas.createDelivery
 * writes `String(ctx.user.id)` — a non-UUID Manus app-user id — so a clean CI/dev
 * reset raised `22P02 invalid input syntax for type uuid`.
 *
 * Fix (migration 20260707000007 + ADR-0011): ALTER registrado_por TYPE text.
 *
 * RED→GREEN: inserting a delivery with a non-UUID `registrado_por` must NOT raise
 * 22P02. We use a non-existent family_id, so the row is rejected at the FK layer
 * (23503) AFTER the value is type-coerced — proving the column now accepts a
 * non-UUID string. Pre-fix (uuid column) the same insert fails with 22P02.
 * Uses service_role (RLS bypassed), so this exercises the COLUMN TYPE, not RLS.
 *
 * Requires real Supabase env; skips otherwise.
 * MYTHOS: TES-04 (#116)
 */
import { describe, it, expect } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRealSupabaseDescribe, hasRealSupabaseEnv } from "./db-test-env";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = hasRealSupabaseEnv();
const describeDb = getRealSupabaseDescribe();

const adminDb: SupabaseClient | null =
  hasDb && supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    : null;

describeDb("deliveries.registrado_por is TEXT (TES-04 / #116)", () => {
  it("accepts a non-UUID actor id without raising 22P02", async () => {
    const { error } = await adminDb!
      .from("deliveries")
      .insert({
        // Non-existent family → FK violation (23503) AFTER type coercion; not our concern.
        family_id: "00000000-0000-0000-0000-000000000000",
        fecha_entrega: "2026-01-01",
        // The assertion target: a non-UUID string (what String(ctx.user.id) produces).
        registrado_por: "nonuuid-actor-123",
      })
      .select()
      .single();

    // RED→GREEN, positively: pre-fix (uuid column) the non-UUID value raises 22P02;
    // post-fix (text) it is coerced/accepted and the ONLY remaining failure is the FK
    // violation on the non-existent family_id. Asserting the EXACT FK code (23503) —
    // not merely "not 22P02" — proves the value passed type-coercion into a text column,
    // so the test can't pass vacuously on some unrelated error.
    expect(error?.code).toBe("23503");
  });
});
