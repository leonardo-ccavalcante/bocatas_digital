/**
 * Integration regression test for POS-02 (Mythos audit, P0).
 *
 * Bug: server/routers/checkin.ts flushes the offline queue with
 * `.upsert(rows, { onConflict: "person_id,location_id,programa,checked_in_date",
 *   ignoreDuplicates: true })`, but no inferable arbiter index existed for those
 * columns: prod's `attendances_unique_checkin` is DEFERRABLE (rejected as an
 * ON CONFLICT arbiter) and the other matching index is PARTIAL (not inferable).
 * So the offline flush failed at plan time with 42P10 ("there is no unique or
 * exclusion constraint matching the ON CONFLICT specification") on every env —
 * the queue gets stuck and a volunteer's offline check-ins are silently lost.
 *
 * Fix: migration 20260612000003 adds a NON-partial, NON-deferrable unique index
 * `attendances_checkin_upsert_arbiter` over the exact onConflict columns.
 *
 * Verifies REAL upserts via service-role: the ON CONFLICT resolves (no 42P10),
 * a repeated flush of the same row deduplicates (ignoreDuplicates), and
 * anonymous (NULL person_id) check-ins are NOT deduplicated.
 *
 * Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; skips without them
 * (CI has no live DB until the ephemeral test DB lands — DIO-04).
 *
 * MYTHOS: POS-02
 */
import { it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getRealSupabaseDescribe, hasRealSupabaseEnv } from "./db-test-env";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasDb = hasRealSupabaseEnv();
const describeDb = getRealSupabaseDescribe();

describeDb(
  "checkin offline upsert onConflict(4 cols) — POS-02 regression",
  () => {
    const db = hasDb ? createClient(supabaseUrl!, serviceKey!) : null;
    let personId: string | null = null;
    let locationId: string | null = null;
    const today = new Date().toISOString().slice(0, 10);

    afterAll(async () => {
      if (!db) return;
      // delete by location_id to also clean the anonymous (NULL person_id) rows.
      if (locationId) await db.from("attendances").delete().eq("location_id", locationId);
      if (personId) await db.from("persons").delete().eq("id", personId);
      if (locationId) await db.from("locations").delete().eq("id", locationId);
    });

    it("repeated offline flush resolves ON CONFLICT (no 42P10) and deduplicates", async () => {
      const { data: person, error: pErr } = await db!
        .from("persons")
        .insert({ nombre: "POS-02 Regression" })
        .select("id")
        .single();
      expect(pErr).toBeNull();
      personId = (person as { id: string }).id;

      const { data: loc, error: lErr } = await db!
        .from("locations")
        .insert({ nombre: "POS-02 Loc", tipo: "comedor" })
        .select("id")
        .single();
      expect(lErr).toBeNull();
      locationId = (loc as { id: string }).id;

      const row = {
        person_id: personId,
        location_id: locationId,
        programa: "comedor",
        metodo: "qr_scan",
        es_demo: false,
        checked_in_date: today,
      };

      // First flush → INSERT.
      const r1 = await db!
        .from("attendances")
        .upsert([row], {
          onConflict: "person_id,location_id,programa,checked_in_date",
          ignoreDuplicates: true,
        });
      expect(r1.error).toBeNull();

      // Second flush of the SAME row → before POS-02 this threw 42P10. Now it
      // resolves and ignoreDuplicates keeps it at one row (queue replay is safe).
      const r2 = await db!
        .from("attendances")
        .upsert([row], {
          onConflict: "person_id,location_id,programa,checked_in_date",
          ignoreDuplicates: true,
        });
      expect(r2.error).toBeNull();

      const { data: rows, error: selErr } = await db!
        .from("attendances")
        .select("id")
        .eq("person_id", personId)
        .eq("location_id", locationId)
        .eq("programa", "comedor")
        .eq("checked_in_date", today);
      expect(selErr).toBeNull();
      expect(rows).toHaveLength(1);

      // Anonymous (NULL person_id) check-ins must NOT deduplicate: the arbiter
      // index covers NULL rows, but NULL <> NULL in Postgres, so two anonymous
      // flushes at the same location/programa/date both insert (matches
      // syncOfflineQueue's "anonymous always synced" behavior).
      const anonRow = { ...row, person_id: null };
      const a1 = await db!
        .from("attendances")
        .upsert([anonRow], {
          onConflict: "person_id,location_id,programa,checked_in_date",
          ignoreDuplicates: true,
        });
      expect(a1.error).toBeNull();
      const a2 = await db!
        .from("attendances")
        .upsert([anonRow], {
          onConflict: "person_id,location_id,programa,checked_in_date",
          ignoreDuplicates: true,
        });
      expect(a2.error).toBeNull();
      const { data: anonRows } = await db!
        .from("attendances")
        .select("id")
        .is("person_id", null)
        .eq("location_id", locationId)
        .eq("checked_in_date", today);
      expect(anonRows).toHaveLength(2);
    });
  },
);
