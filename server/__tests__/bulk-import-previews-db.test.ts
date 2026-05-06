/**
 * Integration regression test for the bulk_import_previews constraint fix.
 *
 * Bug: constraint `bulk_import_previews_parsed_rows_max` called
 * `jsonb_array_length()` on the top-level JSONB value, which is an object
 * `{groups: [...], src_filename: ...}` — not an array. PostgreSQL raised
 * error 22023 "cannot get array length of a non-array" on every INSERT.
 *
 * Fix: migration 20260506000002 replaced the constraint with one that
 * checks `jsonb_typeof(parsed_rows) = 'object'` AND
 * `jsonb_array_length(parsed_rows -> 'groups') <= 10000`.
 *
 * This test performs a REAL INSERT into `bulk_import_previews` using the
 * service-role key (bypasses RLS) to verify the constraint accepts the
 * correct `{groups, src_filename}` payload shape.
 *
 * Requires: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 * Skip gracefully if not available (CI without DB access).
 */
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasDb = !!supabaseUrl && !!serviceKey;

// Tokens inserted during this test run — cleaned up in afterAll.
const insertedTokens: string[] = [];

describe.skipIf(!hasDb)(
  "bulk_import_previews — DB integration (constraint regression)",
  () => {
    const db = hasDb ? createClient(supabaseUrl!, serviceKey!) : null;

    afterAll(async () => {
      if (!db || insertedTokens.length === 0) return;
      await db
        .from("bulk_import_previews")
        .delete()
        .in("token", insertedTokens);
    });

    it("INSERT with {groups: [], src_filename} succeeds (constraint accepts object shape)", async () => {
      const payload = { groups: [], src_filename: "test-regression.csv" };
      const { data, error } = await db!
        .from("bulk_import_previews")
        .insert({ parsed_rows: payload, created_by: "test-regression-user" })
        .select("token")
        .single();

      // Before the fix, this threw PostgreSQL error 22023:
      // "cannot get array length of a non-array"
      expect(error).toBeNull();
      expect(data?.token).toBeTruthy();
      if (data?.token) insertedTokens.push(data.token);
    });

    it("INSERT with {groups: [{legacy_numero_familia: '001'}], src_filename} succeeds", async () => {
      const payload = {
        groups: [{ legacy_numero_familia: "001", rows: [], person_dedup_hits: [] }],
        src_filename: "bocatas-legacy.csv",
      };
      const { data, error } = await db!
        .from("bulk_import_previews")
        .insert({ parsed_rows: payload, created_by: "test-regression-user" })
        .select("token")
        .single();

      expect(error).toBeNull();
      expect(data?.token).toBeTruthy();
      if (data?.token) insertedTokens.push(data.token);
    });

    it("INSERT with 10000 groups succeeds (at constraint limit)", async () => {
      const groups = Array.from({ length: 10000 }, (_, i) => ({
        legacy_numero_familia: String(i).padStart(5, "0"),
      }));
      const payload = { groups, src_filename: "large-import.csv" };
      const { data, error } = await db!
        .from("bulk_import_previews")
        .insert({ parsed_rows: payload, created_by: "test-regression-user" })
        .select("token")
        .single();

      expect(error).toBeNull();
      expect(data?.token).toBeTruthy();
      if (data?.token) insertedTokens.push(data.token);
    });

    it("INSERT with 10001 groups is rejected by constraint (over limit)", async () => {
      const groups = Array.from({ length: 10001 }, (_, i) => ({
        legacy_numero_familia: String(i).padStart(5, "0"),
      }));
      const payload = { groups, src_filename: "over-limit.csv" };
      const { error } = await db!
        .from("bulk_import_previews")
        .insert({ parsed_rows: payload, created_by: "test-regression-user" })
        .select("token")
        .single();

      // Constraint violation: groups array length > 10000
      expect(error).not.toBeNull();
      // PostgreSQL check violation code
      expect(error?.code).toBe("23514");
    });
  }
);
