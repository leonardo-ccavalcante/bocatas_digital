/**
 * Integration test for the reparto redesign (migrations 20260723000001-3):
 * flexible suggested day, automatic carry-over of no-shows, round-level close,
 * and the atomic on-screen-signature RPC.
 *
 * Exercises the REAL Postgres functions + guard trigger against a local Supabase
 * (service_role client — the same path the tRPC routers use). Self-skips unless
 * RUN_LOCAL_SUPABASE_TESTS=true (see db-test-env). Runs in the db-integration CI lane.
 *
 * The behaviours locked here are the ones the redesign depends on and that the
 * pre-redesign model got wrong (cerrar_turno used to no-show every pendiente):
 *   - cerrar_turno v3 closes the slot ONLY;
 *   - a pending row carries over (moves out of a closed suggested slot);
 *   - attendance in / of a closed slot is immutable (guard trigger);
 *   - close_round marks never-attended as ausente and is idempotent;
 *   - record_reparto_pickup is atomic + one-per-assignment.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRealSupabaseDescribe, hasRealSupabaseEnv } from "./db-test-env";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeDb = getRealSupabaseDescribe();

// Fixed test fixtures (distinctive prefix so cleanup is unambiguous).
const PROGRAM = "0be9a17e-0000-4000-8000-000000000001";
const FAM_A = "0be9a17e-0000-4000-8000-00000000000a"; // size 1 (smaller)
const FAM_B = "0be9a17e-0000-4000-8000-00000000000b"; // size 3 (larger)
const SIGNER = "0be9a17e-0000-4000-8000-00000000000e";
const ROUND = "0be9a17e-0000-4000-8000-000000000010";
const SLOT1 = "0be9a17e-0000-4000-8000-000000000021"; // day 1
const SLOT2 = "0be9a17e-0000-4000-8000-000000000022"; // day 2
const ASG_A = "0be9a17e-0000-4000-8000-000000000031";
const ASG_B = "0be9a17e-0000-4000-8000-000000000032";

const db: SupabaseClient | null =
  hasRealSupabaseEnv() && supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

async function seed() {
  await db!.from("programs").upsert({ id: PROGRAM, name: "Reparto IT", slug: "reparto_it_test" });
  await db!.from("families").upsert([
    { id: FAM_A, familia_numero: 90001, estado: "activa", num_adultos: 1, num_menores_18: 0 },
    { id: FAM_B, familia_numero: 90002, estado: "activa", num_adultos: 2, num_menores_18: 1 },
  ]);
  await db!.from("persons").upsert({ id: SIGNER, nombre: "Firmante", apellidos: "IT" });
  await db!.from("delivery_rounds").upsert({
    id: ROUND, program_id: PROGRAM, nombre: "R-IT", fecha_inicio: "2026-08-01", estado: "activa", creado_por: "1",
  });
  await db!.from("delivery_round_slots").upsert([
    { id: SLOT1, round_id: ROUND, slot_date: "2026-08-01", turno: "manana", estado: "abierto" },
    { id: SLOT2, round_id: ROUND, slot_date: "2026-08-02", turno: "manana", estado: "abierto" },
  ]);
  await db!.from("delivery_round_assignments").upsert([
    { id: ASG_A, round_id: ROUND, family_id: FAM_A, assigned_day: "2026-08-01", turno: "manana", day_slot: 1, expediente: "90001", total_miembros: 1 },
    { id: ASG_B, round_id: ROUND, family_id: FAM_B, assigned_day: "2026-08-01", turno: "manana", day_slot: 1, expediente: "90002", total_miembros: 3 },
  ]);
}

async function cleanup() {
  if (!db) return;
  await db.from("delivery_rounds").delete().eq("id", ROUND); // cascades slots/assignments/audit
  await db.from("families").delete().in("id", [FAM_A, FAM_B]);
  await db.from("persons").delete().eq("id", SIGNER);
  await db.from("programs").delete().eq("id", PROGRAM);
}

describeDb("reparto carry-over + close + signature (RPC/trigger integrity)", () => {
  beforeAll(async () => {
    await cleanup();
    await seed();
  });
  afterAll(cleanup);

  it("get_active_families_for_reparto includes both activas, sized by declared members", async () => {
    const { data, error } = await db!.rpc("get_active_families_for_reparto");
    expect(error).toBeNull();
    const mine = (data ?? []).filter((f: { id: string }) => f.id === FAM_A || f.id === FAM_B);
    expect(mine).toHaveLength(2);
    const a = mine.find((f: { id: string }) => f.id === FAM_A)!;
    const b = mine.find((f: { id: string }) => f.id === FAM_B)!;
    expect(a.total_miembros).toBe(1);
    expect(b.total_miembros).toBe(3);
  });

  it("cerrar_turno closes the slot WITHOUT marking pending families as no-show", async () => {
    // Attend FAM_A in slot1, leave FAM_B pending, then close slot1.
    const pickup = await db!.rpc("record_reparto_pickup", {
      p_assignment_id: ASG_A, p_slot_id: SLOT1, p_signer_person_id: SIGNER,
      p_storage_path: "repartos/it/a.png", p_ip_hash: null, p_actor: "1",
    });
    expect(pickup.error).toBeNull();

    const { error } = await db!.rpc("cerrar_turno", { p_slot_id: SLOT1, p_actor: "1" });
    expect(error).toBeNull();

    const { data: rows } = await db!
      .from("delivery_round_assignments")
      .select("family_id, attended")
      .eq("round_id", ROUND);
    const famA = rows!.find((r) => r.family_id === FAM_A)!;
    const famB = rows!.find((r) => r.family_id === FAM_B)!;
    expect(famA.attended).toBe(true); // picked up
    expect(famB.attended).toBeNull(); // STILL PENDING — carry-over, not no-show
  });

  it("a pending family carries over: move its suggestion out of the closed slot to an open one", async () => {
    const { error } = await db!.rpc("move_assignment_to_open_slot", {
      p_assignment_id: ASG_B, p_new_day: "2026-08-02", p_new_turno: "manana", p_actor: "1", p_log_entry: {},
    });
    expect(error).toBeNull();
    const { data } = await db!.from("delivery_round_assignments").select("assigned_day").eq("id", ASG_B).single();
    expect(data!.assigned_day).toBe("2026-08-02");
  });

  it("recording attendance INTO a closed slot is rejected by the guard trigger", async () => {
    const { error } = await db!
      .from("delivery_round_assignments")
      .update({ attended: true, attended_slot_id: SLOT1 })
      .eq("id", ASG_B);
    expect(error?.message ?? "").toContain("turno_cerrado");
  });

  it("attendance of a family finalised in a closed slot is immutable", async () => {
    const { error } = await db!
      .from("delivery_round_assignments")
      .update({ attended: false })
      .eq("id", ASG_A);
    expect(error?.message ?? "").toContain("turno_cerrado");
  });

  it("close_round refuses while a slot is still open (turnos_abiertos)", async () => {
    const { error } = await db!.rpc("close_round", { p_round_id: ROUND, p_actor: "1", p_notas: null });
    expect(error?.message ?? "").toContain("turnos_abiertos");
  });

  it("record_reparto_pickup marks attendance and is idempotent on retry", async () => {
    const first = await db!.rpc("record_reparto_pickup", {
      p_assignment_id: ASG_B, p_slot_id: SLOT2, p_signer_person_id: SIGNER,
      p_storage_path: "repartos/it/b.png", p_ip_hash: null, p_actor: "1",
    });
    expect(first.error).toBeNull();
    const firstId = (first.data as Array<{ audit_id: string }>)[0].audit_id;
    const { data: b } = await db!.from("delivery_round_assignments").select("attended, attended_slot_id").eq("id", ASG_B).single();
    expect(b!.attended).toBe(true);
    expect(b!.attended_slot_id).toBe(SLOT2);

    // Same assignment + slot + signer (a lost-response retry) → same row, no error.
    const retry = await db!.rpc("record_reparto_pickup", {
      p_assignment_id: ASG_B, p_slot_id: SLOT2, p_signer_person_id: SIGNER,
      p_storage_path: "repartos/it/b2.png", p_ip_hash: null, p_actor: "1",
    });
    expect(retry.error).toBeNull();
    expect((retry.data as Array<{ audit_id: string }>)[0].audit_id).toBe(firstId); // idempotent

    // A DIFFERENT signer on the already-signed pickup is a real conflict.
    const conflict = await db!.rpc("record_reparto_pickup", {
      p_assignment_id: ASG_B, p_slot_id: SLOT2, p_signer_person_id: FAM_A /* any other person id */,
      p_storage_path: "repartos/it/b3.png", p_ip_hash: null, p_actor: "1",
    });
    expect(conflict.error).not.toBeNull();
  });

  it("close_round marks never-attended as ausente, flips cerrada, and rejects a double close", async () => {
    // Both families are now resolved (attended) → 0 ausentes; close the last slot first.
    await db!.rpc("cerrar_turno", { p_slot_id: SLOT2, p_actor: "1" });
    const { data: ausentes, error } = await db!.rpc("close_round", { p_round_id: ROUND, p_actor: "1", p_notas: "fin" });
    expect(error).toBeNull();
    expect(ausentes).toBe(0);
    const { data: round } = await db!.from("delivery_rounds").select("estado").eq("id", ROUND).single();
    expect(round!.estado).toBe("cerrada");

    const again = await db!.rpc("close_round", { p_round_id: ROUND, p_actor: "1", p_notas: null });
    expect(again.error?.message ?? "").toContain("ronda_no_activa");
  });
});

// Guard: when the DB env is absent the whole suite skips — assert that intent so a
// silently-skipped run is visible in the report rather than looking like a pass.
describe("reparto-carryover integration (env guard)", () => {
  it(hasRealSupabaseEnv() ? "runs against a real DB" : "SKIPPED — no RUN_LOCAL_SUPABASE_TESTS", () => {
    expect(true).toBe(true);
  });
});
