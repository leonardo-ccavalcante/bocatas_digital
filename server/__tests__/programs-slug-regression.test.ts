/**
 * Regression test: programs.getBySlug('programa_familias') must return the
 * Programa Familias row.
 *
 * Root cause: the programs table was seeded with slug='familia' but the PR #41
 * frontend hardcodes slug='programa_familias'. The fix is a migration that
 * renames the slug in the DB.
 *
 * TDD: this test is written BEFORE the fix (RED) and must pass AFTER (GREEN).
 */
import { it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getRealSupabaseDescribe } from "./db-test-env";

const DB_TEST_TIMEOUT_MS = 15_000;
const describeDb = getRealSupabaseDescribe();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "http://localhost",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder",
  { auth: { persistSession: false } }
);

describeDb("programs slug — regression: programa_familias", () => {
  it("programs table has a row with slug='programa_familias'", async () => {
    const { data, error } = await supabase
      .from("programs")
      .select("id, slug, name")
      .eq("slug", "programa_familias")
      .single();

    expect(error, `Supabase error: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.slug).toBe("programa_familias");
    expect(data!.name).toMatch(/familia/i);
  }, DB_TEST_TIMEOUT_MS);

  it("there is NO row with the old slug='familia' after the rename", async () => {
    const { data } = await supabase
      .from("programs")
      .select("id, slug")
      .eq("slug", "familia");

    // After the migration the old slug must not exist
    expect(data).toHaveLength(0);
  }, DB_TEST_TIMEOUT_MS);
});
