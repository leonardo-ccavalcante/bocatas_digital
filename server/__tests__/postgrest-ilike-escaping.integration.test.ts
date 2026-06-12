/**
 * Integration regression test for CAS-04 (Mythos audit, cassandra follow-up).
 *
 * The unit tests in server/_core/__tests__/postgrestFilter.test.ts only assert
 * STRING SHAPE — they are false-green at the transport layer and cannot prove
 * what PostgREST actually matches. This test runs the REAL helpers against a
 * REAL PostgREST and asserts the matched rows, for BOTH usage contexts:
 *
 *   (a) ilikeForOr → embedded in a `.or(...)` filter list
 *   (b) ilikeValue → positional `.ilike(column, value)`
 *
 * Empirically (see postgrestFilter.ts), the two contexts need DIFFERENT
 * escaping; a single helper was wrong for both (the prior quoted/single-bs
 * helper over-matched in `.or()` and matched ZERO rows in positional `.ilike`).
 *
 * Asserts, against the live DB:
 *   1. A literal-`%` search matches ONLY the literal-`%` row (no wildcard widening).
 *   2. A literal-`_` search matches ONLY the literal-`_` row.
 *   3. A comma/paren injection payload (`x,nombre.ilike.*`) does NOT inject an
 *      extra filter (no breakout, no over-match, no 500).
 *
 * Requires a live DB: SUPABASE_URL/VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
 * and RUN_LOCAL_SUPABASE_TESTS=true for a local stack. Skips gracefully otherwise.
 *
 * MYTHOS: CAS-04
 */
import { it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRealSupabaseDescribe, hasRealSupabaseEnv } from "./db-test-env";
import { ilikeForOr, ilikeValue } from "../../shared/postgrestFilter";

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const hasDb = hasRealSupabaseEnv();
const describeDb = getRealSupabaseDescribe();

// Unique tag so the probe rows can't collide with real data and are easy to purge.
const TAG = `ZZCAS04${Date.now()}`;
const LITERAL_PERCENT = `${TAG}100%lit`; // literal '%'
const PERCENT_DECOY = `${TAG}100x`; // would be hit if '%' acted as a wildcard
const LITERAL_UNDER = `${TAG}a_b`; // literal '_'
const UNDER_DECOY = `${TAG}axb`; // would be hit if '_' acted as a wildcard
const QUOTE_ROW = `${TAG}qa"bq`; // contains a literal double-quote (the escape-grammar case)
const ROWS = [LITERAL_PERCENT, PERCENT_DECOY, LITERAL_UNDER, UNDER_DECOY, QUOTE_ROW];

function names(data: { nombre: string | null }[] | null): string[] {
  return (data ?? []).map((r) => r.nombre ?? "").sort();
}

describeDb("PostgREST ilike escaping — CAS-04 (real transport)", () => {
  const db: SupabaseClient | null = hasDb
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    : null;

  beforeAll(async () => {
    if (!db) return;
    await db.from("persons").delete().like("nombre", `${TAG}%`);
    const { error } = await db
      .from("persons")
      .insert(ROWS.map((nombre) => ({ nombre })));
    expect(error).toBeNull();
  });

  afterAll(async () => {
    if (!db) return;
    await db.from("persons").delete().like("nombre", `${TAG}%`);
  });

  // ── (a) .or() filter-list context ─────────────────────────────────────────
  it("(a) .or(): literal-% search matches ONLY the literal-% row (no widening)", async () => {
    const token = ilikeForOr(`${TAG}100%`);
    const { data, error } = await db!
      .from("persons")
      .select("nombre")
      .or(`nombre.ilike.${token},apellidos.ilike.${token}`)
      .like("nombre", `${TAG}%`);
    expect(error).toBeNull();
    expect(names(data)).toEqual([LITERAL_PERCENT]);
  });

  it("(a) .or(): literal-_ search matches ONLY the literal-_ row", async () => {
    const token = ilikeForOr(`${TAG}a_b`);
    const { data, error } = await db!
      .from("persons")
      .select("nombre")
      .or(`nombre.ilike.${token},apellidos.ilike.${token}`)
      .like("nombre", `${TAG}%`);
    expect(error).toBeNull();
    expect(names(data)).toEqual([LITERAL_UNDER]);
  });

  it("(a) .or(): comma/paren injection payload does NOT inject or over-match", async () => {
    // Unescaped, `x,nombre.ilike.*` would break out and match every row (or 500).
    const token = ilikeForOr("x,nombre.ilike.*");
    const { data, error } = await db!
      .from("persons")
      .select("nombre")
      .or(`nombre.ilike.${token},apellidos.ilike.${token}`)
      .like("nombre", `${TAG}%`);
    expect(error).toBeNull();
    // No row literally contains the payload → no breakout, no widening.
    expect(names(data)).toEqual([]);
  });

  it('(a) .or(): a literal double-quote search matches its row (backslash-escape, not doubling)', async () => {
    // Regression for the quoted-token escape grammar: doubling (`""`) early-closes
    // the token and returns nothing; backslash (`\"`) is consumed to a literal `"`.
    const token = ilikeForOr(`qa"bq`);
    const { data, error } = await db!
      .from("persons")
      .select("nombre")
      .or(`nombre.ilike.${token},apellidos.ilike.${token}`)
      .like("nombre", `${TAG}%`);
    expect(error).toBeNull();
    expect(names(data)).toEqual([QUOTE_ROW]);
  });

  // ── (b) positional .ilike(col, value) context ─────────────────────────────
  it("(b) .ilike(col,val): literal-% search matches ONLY the literal-% row", async () => {
    const { data, error } = await db!
      .from("persons")
      .select("nombre")
      .ilike("nombre", ilikeValue(`${TAG}100%`))
      .like("nombre", `${TAG}%`);
    expect(error).toBeNull();
    expect(names(data)).toEqual([LITERAL_PERCENT]);
  });

  it("(b) .ilike(col,val): literal-_ search matches ONLY the literal-_ row", async () => {
    const { data, error } = await db!
      .from("persons")
      .select("nombre")
      .ilike("nombre", ilikeValue(`${TAG}a_b`))
      .like("nombre", `${TAG}%`);
    expect(error).toBeNull();
    expect(names(data)).toEqual([LITERAL_UNDER]);
  });

  it("(b) .ilike(col,val): comma payload is inert (encoded value, no over-match)", async () => {
    const { data, error } = await db!
      .from("persons")
      .select("nombre")
      .ilike("nombre", ilikeValue("x,nombre.ilike.*"))
      .like("nombre", `${TAG}%`);
    expect(error).toBeNull();
    expect(names(data)).toEqual([]);
  });

  it('(b) .ilike(col,val): a literal double-quote search matches its row', async () => {
    const { data, error } = await db!
      .from("persons")
      .select("nombre")
      .ilike("nombre", ilikeValue(`qa"bq`))
      .like("nombre", `${TAG}%`);
    expect(error).toBeNull();
    expect(names(data)).toEqual([QUOTE_ROW]);
  });

  // ── A normal substring search still works in both contexts ────────────────
  it("substring search still works (sanity) in both contexts", async () => {
    const orRes = await db!
      .from("persons")
      .select("nombre")
      .or(`nombre.ilike.${ilikeForOr(TAG)},apellidos.ilike.${ilikeForOr(TAG)}`)
      .like("nombre", `${TAG}%`);
    expect(orRes.error).toBeNull();
    expect(names(orRes.data).sort()).toEqual([...ROWS].sort());

    const posRes = await db!
      .from("persons")
      .select("nombre")
      .ilike("nombre", ilikeValue(TAG))
      .like("nombre", `${TAG}%`);
    expect(posRes.error).toBeNull();
    expect(names(posRes.data).sort()).toEqual([...ROWS].sort());
  });
});
