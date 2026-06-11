/**
 * Integration regression test for POS-01 (Mythos audit, P0).
 *
 * Bug: server/routers/persons/consents.ts upserts with
 * `.upsert(rows, { onConflict: "person_id,purpose" })`, but the repo migration
 * chain created NO UNIQUE constraint on consents(person_id, purpose) (prod has
 * one; the repo lacked it). On any fresh DB the upsert failed at plan time:
 *   ERROR: there is no unique or exclusion constraint matching the
 *          ON CONFLICT specification  (SQLSTATE 42P10)
 * → recording legal consent (Grupo-A) was broken at runtime everywhere built
 * from the repo. Reproduced on a fresh `supabase db reset`.
 *
 * Fix: migration 20260612000001 recovers the prod constraint
 * `consents_person_id_purpose_unique UNIQUE (person_id, purpose)` (non-partial,
 * so PostgREST `onConflict=` can infer it — a partial index cannot; ADR-0007).
 *
 * This performs REAL upserts via the service-role client to verify the
 * ON CONFLICT clause resolves (no 42P10) and that a repeat upsert UPDATES in
 * place rather than duplicating.
 *
 * Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; skips gracefully
 * without them (CI has no live DB until the ephemeral test DB lands — DIO-04).
 *
 * MYTHOS: POS-01
 */
import { it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getRealSupabaseDescribe, hasRealSupabaseEnv } from "./db-test-env";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = hasRealSupabaseEnv();
const describeDb = getRealSupabaseDescribe();

describeDb(
  "consents upsert onConflict(person_id,purpose) — POS-01 regression",
  () => {
    const db = hasDb ? createClient(supabaseUrl!, serviceKey!) : null;
    let personId: string | null = null;

    afterAll(async () => {
      if (!db || !personId) return;
      await db.from("consents").delete().eq("person_id", personId);
      await db.from("persons").delete().eq("id", personId);
    });

    it("repeat upsert on (person_id,purpose) resolves ON CONFLICT (no 42P10) and updates in place", async () => {
      // persons requires only `nombre`; everything else has a DB default.
      const { data: person, error: pErr } = await db!
        .from("persons")
        .insert({ nombre: "POS-01 Regression" })
        .select("id")
        .single();
      expect(pErr).toBeNull();
      personId = (person as { id: string }).id;

      const base = {
        person_id: personId,
        purpose: "tratamiento_datos_bocatas",
        idioma: "es",
        consent_text: "t",
        consent_version: "1",
      };

      // First upsert → INSERT.
      const r1 = await db!
        .from("consents")
        .upsert({ ...base, granted: true }, { onConflict: "person_id,purpose" })
        .select("id");
      expect(r1.error).toBeNull();

      // Second upsert, SAME (person_id, purpose) → before POS-01 this threw 42P10
      // ("no unique or exclusion constraint matching the ON CONFLICT spec").
      const r2 = await db!
        .from("consents")
        .upsert(
          { ...base, granted: false },
          { onConflict: "person_id,purpose" },
        )
        .select("id, granted");
      expect(r2.error).toBeNull();

      // Upsert UPDATED in place: exactly one row, `granted` flipped to false.
      const { data: rows, error: selErr } = await db!
        .from("consents")
        .select("id, granted")
        .eq("person_id", personId)
        .eq("purpose", "tratamiento_datos_bocatas");
      expect(selErr).toBeNull();
      expect(rows).toHaveLength(1);
      expect((rows as { granted: boolean }[])[0].granted).toBe(false);
    });
  },
);
