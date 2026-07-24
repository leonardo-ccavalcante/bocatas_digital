/**
 * record_reparto_pickup_family_check.migration.test.ts
 *
 * MYTHOS: MYT-129A — defense-in-depth (gh #129). record_reparto_pickup (the RPC
 * backing recordRepartoSignature) currently validates p_signer_person_id ONLY
 * via the FK to persons(id) — it never checks that the signer belongs to the
 * delivery_round_assignments row's family. The tRPC layer
 * (server/routers/families/rounds-signature.ts) already does this IDOR check
 * before calling the RPC — this locks in the belt-and-suspenders DB-level check
 * requested by the PR #125 reviews, so any future caller of the RPC that
 * bypasses the app-layer guard (a new procedure, a script, an admin backfill)
 * cannot record a pickup signed by someone from a DIFFERENT family.
 *
 * Content-assert against the SQL text only (mirrors firma.migration.test.ts /
 * rls-column-grants.migration.test.ts) — this run had no usable local SQL
 * harness: the worktree's local Supabase/Docker stack was unresponsive
 * (`docker exec` / `docker ps` hung, `docker restart` failed with "tried to
 * kill container, but did not receive an exit event", the REST API connection
 * timed out) — almost certainly host-level resource contention from several
 * concurrent wave worktrees' Docker stacks. This is the documented fallback
 * from the finding's fix_hint, not a stylistic choice. Once the local DB stack
 * is healthy again, also exercise this via a real RPC call in
 * reparto-carryover.integration.test.ts (RUN_LOCAL_SUPABASE_TESTS=true) for the
 * stronger behavioural proof.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../supabase/migrations/20260724110000_record_reparto_pickup_family_check.sql",
);

// The six exception literals record_reparto_pickup already raises BEFORE this
// fix (from 20260723000003_reparto_signature_audit.sql). The family-check
// migration must preserve every one (CREATE OR REPLACE = no behavioural
// regression) while adding at least one NEW guard for the family mismatch.
const PRE_EXISTING_EXCEPTIONS = [
  "asignacion_no_encontrada",
  "turno_no_encontrado",
  "slot_ajeno",
  "turno_cerrado",
  "ya_atendida",
  "firma_conflicto",
];

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("record_reparto_pickup family-membership check migration (MYT-129A)", () => {
  it("the migration file exists", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
  });

  it("redefines record_reparto_pickup via CREATE OR REPLACE, keeping the exact same argument signature", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.record_reparto_pickup\s*\(\s*p_assignment_id\s+UUID,\s*p_slot_id\s+UUID,\s*p_signer_person_id\s+UUID,\s*p_storage_path\s+TEXT,\s*p_ip_hash\s+TEXT,\s*p_actor\s+TEXT\s*\)/i,
    );
  });

  it("does NOT DROP the function (CREATE OR REPLACE preserves the service_role EXECUTE grant — AGENTS.md landmine)", () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/DROP\s+FUNCTION\s+(IF\s+EXISTS\s+)?public\.record_reparto_pickup/i);
  });

  it("preserves every pre-existing RAISE EXCEPTION guard (no behavioural regression)", () => {
    const sql = readMigration();
    for (const code of PRE_EXISTING_EXCEPTIONS) {
      expect(sql).toMatch(new RegExp(`RAISE\\s+EXCEPTION\\s+'${code}'`, "i"));
    }
  });

  it("adds a NEW guard checking the signer belongs to the assignment's family (familia_miembros) — the documented defect", () => {
    const sql = readMigration();
    expect(sql).toMatch(/familia_miembros/i);

    const raised = Array.from(sql.matchAll(/RAISE\s+EXCEPTION\s+'([a-z_]+)'/gi)).map((m) => m[1]);
    const newGuards = raised.filter((code) => !PRE_EXISTING_EXCEPTIONS.includes(code));
    expect(newGuards.length).toBeGreaterThan(0); // at least one NEW exception beyond the original six
  });
});
