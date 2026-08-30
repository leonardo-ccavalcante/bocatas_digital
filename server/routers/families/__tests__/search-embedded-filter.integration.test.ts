/**
 * search-embedded-filter.integration.test.ts — RC-08 against a REAL PostgREST.
 *
 * The unit tests (search-embedded-filter.test.ts) assert query SHAPE only —
 * mocked chains are false-green for embedded-filter semantics (exactly how
 * F072/F073 shipped: FamiliasList.test.tsx mocks the query, so the 500 was
 * invisible). This runs the real routers against a live local Supabase and
 * asserts matched rows:
 *   - getAll text search returns ONLY matching families (was PGRST100 → 500);
 *   - verifyIdentity name search filters parent rows (was: first 5 active
 *     families with titular_nombre "") and matches apellidos too.
 *
 * Requires RUN_LOCAL_SUPABASE_TESTS=true + local stack; skips otherwise.
 * Pattern: server/__tests__/postgrest-ilike-escaping.integration.test.ts.
 */
import { it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "../../../../client/src/lib/supabase/server";
import {
  getRealSupabaseDescribe,
  hasRealSupabaseEnv,
} from "../../../__tests__/db-test-env";
import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";
import { crudRouter } from "../crud";
import { complianceRouter } from "../compliance";

const describeDb = getRealSupabaseDescribe();
const db = hasRealSupabaseEnv() ? createAdminClient() : null;

// Unique tag so probe rows cannot collide with real/seed data.
const TAG = `ZZRC08${Date.now()}`;
const APELLIDOS = `${TAG}AP`;

function ctxAdmin(): TrpcContext {
  const user: NonNullable<TrpcContext["user"]> = {
    id: "test-user-1",
    openId: "test-user",
    email: "admin@bocatas.org",
    name: "admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "families-search-embedded-filter-integration",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describeDb("families search — embedded titular filter, real transport (RC-08)", () => {
  let personId = "";
  let familyId = "";

  beforeAll(async () => {
    const { data: person, error: pErr } = await db!
      .from("persons")
      .insert({ nombre: TAG, apellidos: APELLIDOS })
      .select("id")
      .single();
    expect(pErr).toBeNull();
    personId = (person as { id: string }).id;

    const { data: fam, error: fErr } = await db!
      .from("families")
      .insert({
        titular_id: personId,
        estado: "activa",
        num_adultos: 1,
        num_menores_18: 0,
        persona_recoge: TAG,
      })
      .select("id")
      .single();
    expect(fErr).toBeNull();
    familyId = (fam as { id: string }).id;
  });

  afterAll(async () => {
    if (!db) return;
    if (familyId) await db.from("families").delete().eq("id", familyId);
    if (personId) await db.from("persons").delete().eq("id", personId);
  });

  it("getAll name search returns ONLY the matching family (no 500, no over-match)", async () => {
    const caller = crudRouter.createCaller(ctxAdmin());
    const rows = await caller.getAll({ search: TAG, estado: "all" });
    expect(rows.map((r: { id: string }) => r.id)).toEqual([familyId]);

    const none = await caller.getAll({ search: `${TAG}nope`, estado: "all" });
    expect(none).toEqual([]);
  });

  it("verifyIdentity name search filters parents; returns titular_nombre + estado", async () => {
    const caller = complianceRouter.createCaller(ctxAdmin());
    const rows = await caller.verifyIdentity({ query: TAG });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: familyId,
      titular_nombre: `${TAG} ${APELLIDOS}`,
      estado: "activa",
    });

    const none = await caller.verifyIdentity({ query: `${TAG}nope` });
    expect(none).toEqual([]);
  });

  it("verifyIdentity matches by apellidos too", async () => {
    const caller = complianceRouter.createCaller(ctxAdmin());
    const rows = await caller.verifyIdentity({ query: APELLIDOS });
    expect(rows.map((r) => r.id)).toEqual([familyId]);
  });
});
