/**
 * END-TO-END proof (env-gated) that the legacy "Programa de Familia" importer
 * WORKS, locally, against the Docker Supabase — with SYNTHETIC data only, so it
 * needs neither prod nor the RGPD/EIPD legal gates (those gate PROD go-live, not
 * local verification).
 *
 * It drives the REAL tRPC procedures the UI calls (appRouter.createCaller), from
 * a raw CSV string all the way to real DB rows:
 *   1. ROSTER: previewLegacyImport(synthetic CSV) -> confirmLegacyImport('skip')
 *      -> families + persons + familia_miembros + programa_familias enrollments.
 *   2. UPDATE: re-import with mode='update' -> updated_count, idempotent re-sync.
 *   3. INFORMES: previewInformesImport -> confirmInformesImport -> the Art.9
 *      narrative is backfilled onto the existing family.
 *
 * Run it: from repo root, with the local stack up,
 *   set -a; . ./.env.test.local; set +a
 *   corepack pnpm exec vitest run server/__tests__/legacy-familias-e2e.integration.test.ts
 */

import { readFileSync } from "node:fs";
import { it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { Logger } from "../_core/logger";
import { getRealSupabaseDescribe, hasRealSupabaseEnv } from "./db-test-env";

const describeDb = getRealSupabaseDescribe({ requireJwtSecret: true });
const hasDb = hasRealSupabaseEnv({ requireJwtSecret: true });
const adminDb = hasDb
  ? createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  : null;

// The 5 synthetic families in the fixture (no real PII).
const FIXTURE = "tests/fixtures/legacy-familias-prueba.csv";
const LEGACY_NUMS = ["1030", "1032", "1033", "1034", "1035"];

// A matching synthetic INFORMES SOCIALES row for family 1030.
const INFORMES_CSV =
  "NUMERO FAMILIA BOCATAS,FECHA ALTA,NOMBRE,APELLIDOS,TELEFONO,DNI/ PASAPORTE,PAIS," +
  "Fecha Nacimiento,DIRECCION,CODIGO POSTAL,Localidad,DESCRIPCION SITUACIÓN FAMILIAR,NOTAS NECESIDADES\n" +
  '1030,30/09/2020,Luís Alfredo,Alburquerque Gutierrez,604372950,Y-8206459-G,España,17/03/1983,' +
  '"C/ Prueba 1",28020,Madrid,"Situación familiar de prueba (E2E).","Necesidad de alimentos (E2E)."';

function adminCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "e2e-admin-open-id",
      email: "e2e@bocatas.org",
      name: "E2E Admin",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "e2e-correlation-id",
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

async function cleanup() {
  if (!adminDb) return;
  const { data: fams } = await adminDb
    .from("families")
    .select("id, titular_id")
    .in("legacy_numero", LEGACY_NUMS);
  for (const f of (fams ?? []) as { id: string; titular_id: string | null }[]) {
    const { data: mems } = await adminDb
      .from("familia_miembros")
      .select("person_id")
      .eq("familia_id", f.id);
    const personIds = [
      f.titular_id,
      ...((mems ?? []) as { person_id: string | null }[]).map((m) => m.person_id),
    ].filter((x): x is string => Boolean(x));
    if (personIds.length) await adminDb.from("program_enrollments").delete().in("person_id", personIds);
    await adminDb.from("familia_miembros").delete().eq("familia_id", f.id);
    await adminDb.from("families").delete().eq("id", f.id);
    if (personIds.length) await adminDb.from("persons").delete().in("id", personIds);
  }
}

beforeAll(cleanup);
afterAll(cleanup);

describeDb("legacy-familias importer — full CSV→DB end-to-end (synthetic)", () => {
  it("imports a real synthetic CSV through the UI's tRPC procedures into real rows", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const csv = readFileSync(FIXTURE, "utf8");

    // ── 1. ROSTER preview ──────────────────────────────────────────────────
    const preview = await caller.families.previewLegacyImport({
      csv,
      src_filename: "prueba.csv",
    });
    expect(preview.total_families).toBe(5);
    expect(preview.error_families).toBe(0);

    // ── 2. ROSTER confirm (skip mode) → real rows ──────────────────────────
    const confirmed = await caller.families.confirmLegacyImport({
      preview_token: preview.preview_token,
      src_filename: "prueba.csv",
      mode: "skip",
    });
    expect(confirmed.created_count).toBe(5);
    expect(confirmed.error_count).toBe(0);

    // Real families exist, with members + enrollment.
    const { data: fam1030 } = await adminDb!
      .from("families")
      .select("id, titular_id, num_miembros")
      .eq("legacy_numero", "1030")
      .single();
    expect(fam1030).toBeTruthy();
    const familyId = (fam1030 as { id: string }).id;
    const titularId = (fam1030 as { titular_id: string }).titular_id;

    const { count: memberCount } = await adminDb!
      .from("familia_miembros")
      .select("id", { count: "exact", head: true })
      .eq("familia_id", familyId);
    expect(memberCount).toBeGreaterThan(0); // family 1030 has dependents

    const { data: program } = await adminDb!
      .from("programs").select("id").eq("slug", "programa_familias").single();
    const { count: enrollCount } = await adminDb!
      .from("program_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("person_id", titularId)
      .eq("program_id", (program as { id: string }).id)
      .eq("estado", "activo");
    expect(enrollCount).toBe(1); // titular enrolled in programa_familias

    // ── 3. UPDATE mode re-sync (idempotent) ────────────────────────────────
    const preview2 = await caller.families.previewLegacyImport({ csv, src_filename: "prueba.csv" });
    const updated = await caller.families.confirmLegacyImport({
      preview_token: preview2.preview_token,
      src_filename: "prueba.csv",
      mode: "update",
    });
    expect(updated.updated_count).toBe(5);
    expect(updated.created_count).toBe(0);

    // ── 4. INFORMES enrich → narrative backfilled onto family 1030 ─────────
    const infPreview = await caller.families.previewInformesImport({
      csv: INFORMES_CSV,
      src_filename: "informes.csv",
    });
    expect(infPreview.families_to_enrich).toBe(1);
    const enriched = await caller.families.confirmInformesImport({
      preview_token: infPreview.preview_token,
      src_filename: "informes.csv",
    });
    expect(enriched.enriched_count).toBe(1);

    const { data: famAfter } = await adminDb!
      .from("families")
      .select("situacion_familiar_texto")
      .eq("id", familyId)
      .single();
    expect((famAfter as { situacion_familiar_texto: string }).situacion_familiar_texto).toBe(
      "Situación familiar de prueba (E2E)."
    );
  });
});
