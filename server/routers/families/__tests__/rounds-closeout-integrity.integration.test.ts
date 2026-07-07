/**
 * Integration test for #113 — reparto close-out attendance integrity.
 *
 * A 'cerrado' turno is finalised: cerrar_turno records its still-pending
 * assignments as no-show (attended=false). Before migration 20260707000005,
 * several paths could still mutate that finalised attendance — markAttendance,
 * undo, bulkMarkAttendance (flip a no-show), reschedule/reassign (move it out,
 * resetting attended=NULL) — corrupting getAbsentismoByRound. The app runs as
 * service_role and the tables carry permissive `authenticated` RLS, so the guard
 * is a DB trigger (bypass-proof for every role).
 *
 * These assertions are RED-capable: pre-migration the writes SUCCEED (no error),
 * so `expect(error).toMatch(/turno_cerrado/)` fails. Post-migration the trigger
 * rejects them.
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

  it("cerrar_turno records no-show, then blocks flipping it back (no-show preserved)", async () => {
    expect(programId, "seed needs a program").toBeTruthy();
    expect(familyId, "seed needs a family").toBeTruthy();
    await seedActiveRound();

    const { error: closeErr } = await db!.rpc("cerrar_turno", { p_slot_id: slotId, p_actor: "it-113" });
    expect(closeErr).toBeNull();
    const { data: afterClose } = await db!.from("delivery_round_assignments").select("attended").eq("id", assignmentId).single();
    expect(afterClose!.attended).toBe(false);

    const { error: flipErr } = await db!.from("delivery_round_assignments").update({ attended: true }).eq("id", assignmentId);
    expect(flipErr?.message ?? "").toMatch(/turno_cerrado/);

    const { data: afterFlip } = await db!.from("delivery_round_assignments").select("attended").eq("id", assignmentId).single();
    expect(afterFlip!.attended).toBe(false); // still a recorded no-show
  });

  it("blocks INSERT of a new assignment into a closed slot", async () => {
    await seedActiveRound(false); // close an empty slot, then try to insert into it
    await db!.rpc("cerrar_turno", { p_slot_id: slotId, p_actor: "it-113" });

    const { error } = await db!.from("delivery_round_assignments")
      .insert({ round_id: ROUND_ID, family_id: familyId, assigned_day: DAY, day_slot: 1, total_miembros: 1, turno: "manana" });
    expect(error?.message ?? "").toMatch(/turno_cerrado/);
  });

  it("move_assignment_to_open_slot rejects a closed SOURCE slot", async () => {
    await seedActiveRound();
    await db!.from("delivery_round_slots").insert({ round_id: ROUND_ID, slot_date: DAY, turno: "tarde", estado: "abierto" });
    await db!.rpc("cerrar_turno", { p_slot_id: slotId, p_actor: "it-113" }); // close the source (manana)

    const { error } = await db!.rpc("move_assignment_to_open_slot", {
      p_assignment_id: assignmentId, p_new_day: DAY, p_new_turno: "tarde", p_actor: "it-113", p_log_entry: {},
    });
    expect(error?.message ?? "").toMatch(/turno_origen_cerrado/);
  });

  it("still allows attendance writes while the slot is OPEN (no regression)", async () => {
    await seedActiveRound();
    const { error } = await db!.from("delivery_round_assignments").update({ attended: true }).eq("id", assignmentId);
    expect(error).toBeNull();
    const { data } = await db!.from("delivery_round_assignments").select("attended").eq("id", assignmentId).single();
    expect(data!.attended).toBe(true);
  });
});
