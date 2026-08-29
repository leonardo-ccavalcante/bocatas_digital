/**
 * secdef-rpc-service-role-grants.integration.test.ts — RC-02 (F025/F048/F251/F157/F204).
 *
 * Migration 20260506000007 revoked EXECUTE FROM PUBLIC, authenticated on the
 * SECURITY DEFINER RPCs claiming "service_role retains EXECUTE" — false:
 * find_duplicate_persons, confirm_bulk_announcement_import and
 * upload_family_document only ever had EXECUTE via `authenticated` + the
 * PUBLIC default, so every createAdminClient().rpc() call 42501s.
 *
 * Part 1 content-asserts the fix migration's SQL text (runs in every env —
 * mirrors record_reparto_pickup_family_check.migration.test.ts).
 * Part 2 is the behavioral proof against a live local Supabase
 * (RUN_LOCAL_SUPABASE_TESTS=true — mirrors enrich-informes-rpc.integration.test.ts).
 */
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getRealSupabaseDescribe, hasRealSupabaseEnv } from "./db-test-env";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../supabase/migrations/20260830100000_grant_service_role_secdef_rpcs.sql",
);

describe("grant_service_role_secdef_rpcs migration content (RC-02)", () => {
  it("exists and grants EXECUTE to service_role for the three broken RPC signatures", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toContain("public.find_duplicate_persons(text, text, double precision)");
    expect(sql).toContain("public.confirm_bulk_announcement_import(uuid, text, text)");
    expect(sql).toContain("public.upload_family_document(uuid, integer, uuid, text, text, text)");
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION %s TO service_role/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.upload_family_document\(UUID, INTEGER, UUID, TEXT, TEXT, TEXT\) TO service_role/,
    );
  });

  it("replaces upload_family_document via CREATE OR REPLACE (no DROP — grants survive), without the role gate, and re-grants nothing to anon/authenticated", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.upload_family_document/);
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
    expect(sql).not.toMatch(/get_user_role/);
    expect(sql).not.toMatch(/TO authenticated/);
    expect(sql).not.toMatch(/TO anon/);
  });
});

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = hasRealSupabaseEnv();
const describeDb = getRealSupabaseDescribe();

const adminDb = hasDb
  ? createClient(supabaseUrl!, supabaseServiceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const createdFamilyIds: string[] = [];

afterAll(async () => {
  if (!adminDb) return;
  for (const id of createdFamilyIds) {
    await adminDb.from("family_member_documents").delete().eq("family_id", id);
    await adminDb.from("families").delete().eq("id", id);
  }
});

describeDb("service_role can execute the SECURITY DEFINER RPCs (RC-02)", () => {
  it("find_duplicate_persons runs as service_role (no 42501)", async () => {
    const { data, error } = await adminDb!.rpc("find_duplicate_persons", {
      p_nombre: "QA-RC02",
      p_apellidos: "GrantsCheck",
      p_threshold: 0.7,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it("confirm_bulk_announcement_import reaches the function body (domain error, not permission denied)", async () => {
    const { error } = await adminDb!.rpc("confirm_bulk_announcement_import", {
      p_token: "00000000-0000-4000-8000-000000000000",
      p_autor_id: "qa-rc02",
      p_autor_nombre: "QA RC02",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("preview expired or not found");
  });

  it("upload_family_document inserts a current row and NULLs verified_by for a non-UUID actor id (dev session id)", async () => {
    const { data: fam, error: famErr } = await adminDb!
      .from("families")
      .insert({})
      .select("id")
      .single();
    expect(famErr).toBeNull();
    const familyId = (fam as { id: string }).id;
    createdFamilyIds.push(familyId);

    const { data: inserted, error } = await adminDb!.rpc("upload_family_document", {
      p_family_id: familyId,
      p_member_index: -1,
      p_member_person_id: null,
      p_documento_tipo: "padron_municipal",
      p_documento_url: `qa-rc02/${familyId}/padron.pdf`,
      p_verified_by: "dev-admin-uuid",
    });
    expect(error).toBeNull();
    const row = inserted as {
      id: string;
      family_id: string;
      is_current: boolean;
      verified_by: string | null;
    };
    expect(row.family_id).toBe(familyId);
    expect(row.is_current).toBe(true);
    expect(row.verified_by).toBeNull();
  });
});
