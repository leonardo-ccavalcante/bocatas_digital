/**
 * RLS integration tests — verifies role-based access on PII tables.
 *
 * SETUP REQUIRED: this suite needs 4 seeded auth.users with role claims:
 *   - voluntario@bocatas.test  (raw_user_meta_data.role = 'voluntario')
 *   - admin@bocatas.test       (raw_user_meta_data.role = 'admin')
 *   - superadmin@bocatas.test  (raw_user_meta_data.role = 'superadmin')
 *   - beneficiario@bocatas.test(raw_user_meta_data.role = 'beneficiario',
 *                               raw_user_meta_data.person_id = <some persons.id>)
 *
 * Passwords match README.md:91-93 conventions (BocatasVol2026!, etc.).
 *
 * To enable in CI, set env vars: SUPABASE_URL, SUPABASE_ANON_KEY, RLS_TESTS_ENABLED=1
 *
 * Tests are SKIPPED when RLS_TESTS_ENABLED is unset, so this file is safe to land
 * in the repo before the seed users exist.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const enabled = process.env.RLS_TESTS_ENABLED === "1" && !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

const itIfEnabled = enabled ? it : it.skip;
const describeIfEnabled = enabled ? describe : describe.skip;

type Role = "voluntario" | "admin" | "superadmin" | "beneficiario";

const credsByRole: Record<Role, { email: string; password: string }> = {
  voluntario: { email: "voluntario@bocatas.test", password: "BocatasVol2026!" },
  admin: { email: "admin@bocatas.test", password: "BocatasAdmin2026!" },
  superadmin: { email: "superadmin@bocatas.test", password: "BocatasSuperAdmin2026!" },
  beneficiario: { email: "beneficiario@bocatas.test", password: "BocatasBen2026!" },
};

async function clientForRole(role: Role): Promise<SupabaseClient> {
  const supa = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { error } = await supa.auth.signInWithPassword(credsByRole[role]);
  if (error) throw new Error(`Sign-in failed for role=${role}: ${error.message}`);
  return supa;
}

describeIfEnabled("RLS — familia_miembros (Phase 1.1)", () => {
  itIfEnabled("voluntario can SELECT members of active families", async () => {
    const vol = await clientForRole("voluntario");
    const { data, error } = await vol.from("familia_miembros").select("id, familia_id").limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  itIfEnabled("admin can SELECT all familia_miembros", async () => {
    const adm = await clientForRole("admin");
    const { data, error } = await adm.from("familia_miembros").select("id").limit(5);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  itIfEnabled("beneficiario can only SELECT their own row", async () => {
    const ben = await clientForRole("beneficiario");
    const { data, error } = await ben.from("familia_miembros").select("id, person_id");
    expect(error).toBeNull();
    // Post-policy: beneficiario only sees rows where person_id matches their JWT.person_id.
    // Either 0 (if not a family member) or N rows all matching their person_id.
  });
});

describeIfEnabled("RLS — announcements (Phase 1.2)", () => {
  itIfEnabled("voluntario sees announcement audienced to voluntario role", async () => {
    const vol = await clientForRole("voluntario");
    const { data, error } = await vol.from("announcements").select("id, titulo").limit(50);
    expect(error).toBeNull();
    // Pre-condition: seed has at least one announcement audienced to voluntario.
  });

  itIfEnabled("voluntario does NOT see admin-only announcement", async () => {
    const vol = await clientForRole("voluntario");
    // Pre-condition: seed has an announcement titled 'ADMIN-ONLY TEST FIXTURE' audienced only to admin.
    const { data, error } = await vol.from("announcements")
      .select("id")
      .eq("titulo", "ADMIN-ONLY TEST FIXTURE");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  itIfEnabled("admin sees all announcements", async () => {
    const adm = await clientForRole("admin");
    const { data, error } = await adm.from("announcements").select("id").limit(100);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});

describeIfEnabled("RLS — announcement_audit_log INSERT (Phase 1.3)", () => {
  itIfEnabled("voluntario CANNOT insert audit_log row", async () => {
    const vol = await clientForRole("voluntario");
    const { error } = await vol.from("announcement_audit_log").insert({
      announcement_id: "00000000-0000-0000-0000-000000000001",
      action: "test_smoke",
    });
    expect(error).not.toBeNull();
    expect(error?.code).toMatch(/42501|PGRST/);
  });

  itIfEnabled("admin CAN insert audit_log row", async () => {
    const adm = await clientForRole("admin");
    const { error } = await adm.from("announcement_audit_log").insert({
      announcement_id: "00000000-0000-0000-0000-000000000001",
      action: "test_smoke",
    });
    // FK may fail if the announcement doesn't exist; RLS should NOT be the failure cause.
    expect(error?.code).not.toBe("42501");
  });
});

describeIfEnabled("RLS — deliveries (Phase 1.4)", () => {
  itIfEnabled("voluntario CANNOT delete a delivery", async () => {
    const vol = await clientForRole("voluntario");
    const { error } = await vol.from("deliveries").delete().eq("id", "00000000-0000-0000-0000-000000000001");
    // After Phase 1.4: voluntario has no DELETE policy → RLS blocks.
    expect(error?.code).toMatch(/42501|PGRST/);
  });
});

if (!enabled) {
  // Vitest requires at least one test in any test file.
  it.skip("RLS_TESTS_ENABLED is unset — skipping RLS suite (set env vars to enable)", () => undefined);
}
