/**
 * Integration test for #113 — reparto close-out attendance integrity, updated for
 * the carry-over redesign (ADR-0013, migration 20260723000001).
 *
 * NEW model: closing a turno LOCKS that day's records only — it does NOT mark
 * pendientes as no-show; they stay `attended IS NULL` and roll forward, and a
 * pending suggestion may move OUT of a closed slot (that IS carry-over). Only
 * close_round marks never-attended families as ausente.
 *
 * The surviving #113 guarantee: a family FINALISED (attended IS NOT NULL) in a
 * closed turno is immutable — the guard trigger rejects any later flip. The app
 * runs as service_role over permissive `authenticated` RLS, so the guard is a DB
 * trigger (bypass-proof for every role).
 *
 * Requires a real (local) Supabase with migrations applied; skips otherwise
 * (RUN_LOCAL_SUPABASE_TESTS=true). Runs in CI's "DB Integration Tests" job.
 */
import { it, expect, beforeAll, afterEach } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRealSupabaseDescribe, hasRealSupabaseEnv } from "../../../__tests__/db-test-env";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeDb = getRealSupabaseDescribe();
const db: SupabaseClient | null =
  hasRealSupabaseEnv() && url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

const ROUND_ID = "b1130000-0000-4000-8000-000000000001"; // dedicated test id, cleaned per test
const DAY = "2099-03-15";

describeDb("reparto close-out integrity (#113) — a closed turno is immutable", () => {
  let programId: string | undefined;
  let familyId: string | undefined;
  let slotId: string | undefined;
  let assignmentId: string | undefined;

  beforeAll(async () => {
    const { data: progs } = await db!.from("programs").select("id").limit(1);
    const { data: fams } = await db!.from("families").select("id").limit(1);
    programId = progs?.[0]?.id as string | undefined;
    familyId = fams?.[0]?.id as string | undefined;
  });

  afterEach(async () => {
    if (db) await db.from("delivery_rounds").delete().eq("id", ROUND_ID); // cascade slots + assignments
  });

  async function seedActiveRound(withAssignment = true) {
    await db!.from("delivery_rounds").delete().eq("id", ROUND_ID); // idempotent: clear any leftover
    const r = await db!.from("delivery_rounds").insert({
      id: ROUND_ID, program_id: programId, nombre: "IT-113", fecha_inicio: DAY,
      logos: [], estado: "activa", creado_por: "it-113",
    });
    if (r.error) throw new Error(`round insert: ${r.error.message}`);
    const s = await db!.from("delivery_round_slots").insert({ round_id: ROUND_ID, slot_date: DAY, turno: "manana", estado: "abierto" });
    if (s.error) throw new Error(`slot insert: ${s.error.message}`);
    const { data: slot } = await db!.from("delivery_round_slots")
      .select("id").eq("round_id", ROUND_ID).eq("slot_date", DAY).eq("turno", "manana").single();
    slotId = slot!.id;
    if (withAssignment) {
      const a = await db!.from("delivery_round_assignments")
        .insert({ round_id: ROUND_ID, family_id: familyId, assigned_day: DAY, day_slot: 1, total_miembros: 3, turno: "manana" })
        .select("id").single();
      if (a.error) throw new Error(`assignment insert: ${a.error.message}`);
      assignmentId = a.data!.id;
    }
  }

  it("cerrar_turno closes the slot WITHOUT no-show — pending carries over (attended stays NULL)", async () => {
    expect(programId, "seed needs a program").toBeTruthy();
    expect(familyId, "seed needs a family").toBeTruthy();
    await seedActiveRound();

    const { error: closeErr } = await db!.rpc("cerrar_turno", { p_slot_id: slotId, p_actor: "it-113" });
    expect(closeErr).toBeNull();
    const { data: afterClose } = await db!.from("delivery_round_assignments").select("attended").eq("id", assignmentId).single();
    // Carry-over (ADR-0013): closing a turno does NOT no-show pendientes — they
    // stay attended IS NULL and roll forward. Only close_round marks ausentes.
    expect(afterClose!.attended).toBeNull();
  });

  it("a family FINALISED before close is immutable afterwards (turno_cerrado)", async () => {
    await seedActiveRound();
    // Finalise attendance while the turno is still OPEN…
    const { error: attendErr } = await db!.from("delivery_round_assignments").update({ attended: true }).eq("id", assignmentId);
    expect(attendErr).toBeNull();
    // …then close it. A later flip of the finalised attendance is rejected by the guard.
    await db!.rpc("cerrar_turno", { p_slot_id: slotId, p_actor: "it-113" });
    const { error: flipErr } = await db!.from("delivery_round_assignments").update({ attended: false }).eq("id", assignmentId);
    expect(flipErr?.message ?? "").toMatch(/turno_cerrado/);
    const { data: after } = await db!.from("delivery_round_assignments").select("attended").eq("id", assignmentId).single();
    expect(after!.attended).toBe(true); // finalised attendance preserved
  });

  it("move_assignment_to_open_slot ALLOWS carrying a pending row OUT of a closed source slot", async () => {
    await seedActiveRound();
    await db!.from("delivery_round_slots").insert({ round_id: ROUND_ID, slot_date: DAY, turno: "tarde", estado: "abierto" });
    await db!.rpc("cerrar_turno", { p_slot_id: slotId, p_actor: "it-113" }); // close the source (manana)

    // New model: a pending suggestion moving out of a closed source to an open
    // target is exactly what carry-over needs — it must SUCCEED, not be rejected.
    const { error } = await db!.rpc("move_assignment_to_open_slot", {
      p_assignment_id: assignmentId, p_new_day: DAY, p_new_turno: "tarde", p_actor: "it-113", p_log_entry: {},
    });
    expect(error).toBeNull();
    const { data: moved } = await db!.from("delivery_round_assignments").select("turno").eq("id", assignmentId).single();
    expect(moved!.turno).toBe("tarde");
  });

  it("still allows attendance writes while the slot is OPEN (no regression)", async () => {
    await seedActiveRound();
    const { error } = await db!.from("delivery_round_assignments").update({ attended: true }).eq("id", assignmentId);
    expect(error).toBeNull();
    const { data } = await db!.from("delivery_round_assignments").select("attended").eq("id", assignmentId).single();
    expect(data!.attended).toBe(true);
  });
});
