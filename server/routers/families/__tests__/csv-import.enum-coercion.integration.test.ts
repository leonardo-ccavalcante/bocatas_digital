/**
 * Integration regression test for TES-08 (Mythos audit).
 *
 * Bug: server/routers/families/csv-import.ts (importFamiliesWithMembers) wrote
 * family `estado` and member `rol`/`relacion`/`estado` straight from the raw GUF
 * CSV cell, with no coercion to the DB CHECK-allowed sets:
 *   • families.estado          CHECK ('activa','baja')   — and the code DEFAULTED
 *                              the missing value to "activo" (member spelling),
 *                              itself an invalid value → 23514 on every such row.
 *   • familia_miembros.rol     CHECK ('head_of_household','dependent','other') NOT NULL
 *   • familia_miembros.relacion CHECK (parent,child,sibling,other + Spanish set)
 *   • familia_miembros.estado  CHECK ('activo','inactivo')
 * A GUF CSV carrying free-text / Spanish / capitalized enum cells aborted the
 * insert with a raw 23514 CHECK violation; the per-row catch turned that into a
 * SILENTLY DROPPED family/member.
 *
 * Fix: csv-import.ts coerces each CHECK-constrained cell to a DB-valid value
 * (case-insensitive, with a valid fallback) before insert.
 *
 * This drives the REAL tRPC resolver (createCaller → importFamiliesWithMembers)
 * against a live DB and asserts:
 *   - the import completes with errorCount 0 (no 23514),
 *   - and the STORED values are the coerced, DB-valid ones (which raw passthrough
 *     could never produce — the CHECK would have rejected them). So a revert of the
 *     coercion makes this RED: the rows fail to insert and the lookups find nothing.
 *
 * Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (+ RUN_LOCAL_SUPABASE_TESTS
 * for a local stack); skips gracefully without them.
 *
 * MYTHOS: TES-08
 */
import { it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { csvImportRouter } from "../csv-import";
import type { TrpcContext } from "../../../_core/context";
import { getRealSupabaseDescribe, hasRealSupabaseEnv } from "../../../__tests__/db-test-env";

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = hasRealSupabaseEnv();
const describeDb = getRealSupabaseDescribe();

// Stable, hex-shaped UUIDs (isValidUUID accepts the shape; values are test-only).
const FAM1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const FAM2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const MEM1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const MEM2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

function adminCtx(): TrpcContext {
  return {
    req: {} as never,
    res: {} as never,
    user: { id: 1, role: "admin", name: "TES-08", email: "t@t.com" } as never,
    logger: { info() {}, warn() {}, error() {} } as never,
    correlationId: "tes08",
  } as TrpcContext;
}

describeDb("csv-import enum coercion to DB CHECK — TES-08 regression", () => {
  const db = hasDb ? createClient(supabaseUrl!, serviceKey!) : null;

  afterAll(async () => {
    if (!db) return;
    await db.from("familia_miembros").delete().in("id", [MEM1, MEM2]);
    await db.from("families").delete().in("id", [FAM1, FAM2]);
  });

  it("imports GUF rows with invalid/Spanish/capitalized enum cells, coercing to DB-valid values", async () => {
    // Two single-member families (the validator rejects a repeated familia_id),
    // each carrying enum cells the DB CHECK would reject if written raw:
    //   F1: family estado "activo" (invalid for families) + member rol "Dependent"
    //       (capitalized), relacion "esposa" (not in DB set), estado "Activo".
    //   F2: family estado "" (empty → default) + member rol "primo" (invalid),
    //       relacion "hijo_a" (valid Spanish, must be kept), estado "" (default).
    const csv = [
      "familia_id,familia_numero,nombre_familia,contacto_principal,estado,miembro_id,miembro_nombre,miembro_rol,miembro_relacion,miembro_fecha_nacimiento,miembro_estado",
      `${FAM1},90001,Fam TES08 Uno,Contacto Uno,activo,${MEM1},Miembro Uno,Dependent,esposa,1990-01-01,Activo`,
      `${FAM2},90002,Fam TES08 Dos,Contacto Dos,,${MEM2},Miembro Dos,primo,hijo_a,2015-05-05,`,
    ].join("\n");

    const caller = csvImportRouter.createCaller(adminCtx());
    const res = await caller.importFamiliesWithMembers({
      csvContent: csv,
      mergeStrategy: "merge",
    });

    // No row was dropped by a CHECK violation.
    expect(res.errorCount, JSON.stringify(res.errors)).toBe(0);
    expect(res.familySuccessCount).toBe(2);
    expect(res.memberSuccessCount).toBe(2);

    // The family estado the code defaulted to "activo" was coerced to "activa".
    const { data: fam1 } = await db!.from("families").select("estado").eq("id", FAM1).single();
    expect(fam1!.estado).toBe("activa");
    const { data: fam2 } = await db!.from("families").select("estado").eq("id", FAM2).single();
    expect(fam2!.estado).toBe("activa");

    // M1: capitalized→lowercased, unknown relacion→'otro'.
    const { data: m1 } = await db!
      .from("familia_miembros")
      .select("rol, relacion, estado")
      .eq("id", MEM1)
      .single();
    expect(m1).toEqual({ rol: "dependent", relacion: "otro", estado: "activo" });

    // M2: invalid rol→'other', valid Spanish relacion kept, empty estado→'activo'.
    const { data: m2 } = await db!
      .from("familia_miembros")
      .select("rol, relacion, estado")
      .eq("id", MEM2)
      .single();
    expect(m2).toEqual({ rol: "other", relacion: "hijo_a", estado: "activo" });
  });
});
