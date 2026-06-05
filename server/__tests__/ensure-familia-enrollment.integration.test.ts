/**
 * Integration test (env-gated) for the intake-path helper ensureFamiliaEnrollment.
 *
 * Double-check finding: the helper had the SAME 23505 class the legacy-import RPC
 * fixed — an active-only guard + a bare INSERT against the non-partial
 * uq_enrollment_person_program. With a pre-existing INACTIVE / soft-deleted
 * (person, programa_familias) row (a normal baja → re-intake), the guard passes
 * and the INSERT 23505s. The helper swallows the error (no error check), so the
 * person is SILENTLY left un-enrolled (analytics undercount) — not a crash, but
 * a real gap, and it falsifies the migration comment's "ensureFamiliaEnrollment
 * parity". Fix: upsert onConflict to revive the inactive row.
 */
import { it, expect, afterAll } from "vitest";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { ensureFamiliaEnrollment } from "../routers/families/_shared";
import { getRealSupabaseDescribe, hasRealSupabaseEnv } from "./db-test-env";

const describeDb = getRealSupabaseDescribe();
const db = hasRealSupabaseEnv() ? createAdminClient() : null;

const createdPersonIds: string[] = [];

afterAll(async () => {
  if (!db) return;
  for (const pid of createdPersonIds) {
    await db.from("program_enrollments").delete().eq("person_id", pid);
    await db.from("persons").delete().eq("id", pid);
  }
});

describeDb("ensureFamiliaEnrollment — 23505 safety", () => {
  it("revives an inactive enrollment instead of silently failing to enroll (re-intake)", async () => {
    const { data: prog } = await db!
      .from("programs").select("id").eq("slug", "programa_familias").single();
    const programId = (prog as { id: string }).id;

    const { data: person } = await db!
      .from("persons")
      .insert({ nombre: "Re", apellidos: "Intake", canal_llegada: "programa_familias", idioma_principal: "es" })
      .select("id")
      .single();
    const personId = (person as { id: string }).id;
    createdPersonIds.push(personId);

    // Pre-existing INACTIVE enrollment (normal baja/unenroll lifecycle).
    await db!.from("program_enrollments").insert({
      person_id: personId,
      program_id: programId,
      estado: "completado",
    });

    // Re-intake: must end with an ACTIVE enrollment, not a silent no-op.
    await ensureFamiliaEnrollment(
      db!, personId, programId, "00000000-0000-0000-0000-000000000000", 0
    );

    const { count: active } = await db!
      .from("program_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("person_id", personId)
      .eq("program_id", programId)
      .eq("estado", "activo")
      .is("deleted_at", null);
    expect(active).toBe(1); // revived, not silently dropped

    const { count: total } = await db!
      .from("program_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("person_id", personId)
      .eq("program_id", programId);
    expect(total).toBe(1); // no duplicate row
  });
});
