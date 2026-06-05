/**
 * Integration test (env-gated) — follow-up M-1: a committed integration test
 * for the INFORMES enrich RPC (enrich_families_from_informes), which was
 * previously proven only via direct SQL.
 *
 * Asserts against a live local Supabase (RUN_LOCAL_SUPABASE_TESTS):
 *   1. enrich backfills the social-report narrative (write-when-empty), the
 *      titular person fields (COALESCE), and a STRONG-tier matched member
 *      (relacion + documento), and returns enriched_count=1.
 *   2. a legacy_numero with no roster family → skipped_missing (never creates).
 *
 * Also pins the actor-derivation fix: the RPC derives the actor from
 * auth.jwt() ->> 'sub' (Manus openId is non-UUID), so a non-UUID actorId must
 * NOT raise 42501/22P02.
 */

import { it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { getRealSupabaseDescribe, hasRealSupabaseEnv } from "./db-test-env";

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.SUPABASE_JWT_SECRET;
const hasDb = hasRealSupabaseEnv({ requireJwtSecret: true });
const describeDb = getRealSupabaseDescribe({ requireJwtSecret: true });

const adminDb = hasDb
  ? createClient(supabaseUrl!, supabaseServiceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

async function makeUserClient(actorId: string, role: string) {
  const secretKey = new TextEncoder().encode(jwtSecret!);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    sub: actorId,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { role },
    iat: now,
    exp: now + 300,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(secretKey);
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function stashAndConfirm(
  userClient: Awaited<ReturnType<typeof makeUserClient>>,
  actorId: string,
  groups: unknown[]
) {
  const { data: preview } = await adminDb!
    .from("bulk_import_previews")
    .insert({ parsed_rows: { groups, src_filename: "m1.csv" }, created_by: actorId })
    .select("token")
    .single();
  await userClient.rpc("confirm_legacy_familias_import", {
    p_token: (preview as { token: string }).token,
  });
}

const createdLegacyNums: string[] = [];

async function cleanupFamily(legacyNum: string) {
  if (!adminDb) return;
  const { data: fams } = await adminDb
    .from("families")
    .select("id, titular_id")
    .eq("legacy_numero", legacyNum);
  for (const f of (fams ?? []) as { id: string; titular_id: string | null }[]) {
    const { data: mems } = await adminDb
      .from("familia_miembros")
      .select("person_id")
      .eq("familia_id", f.id);
    const personIds = [
      f.titular_id,
      ...((mems ?? []) as { person_id: string | null }[]).map((m) => m.person_id),
    ].filter((x): x is string => Boolean(x));
    if (personIds.length > 0) {
      await adminDb.from("program_enrollments").delete().in("person_id", personIds);
    }
    await adminDb.from("familia_miembros").delete().eq("familia_id", f.id);
    await adminDb.from("families").delete().eq("id", f.id);
    if (personIds.length > 0) {
      await adminDb.from("persons").delete().in("id", personIds);
    }
  }
}

afterAll(async () => {
  for (const n of createdLegacyNums) await cleanupFamily(n);
});

describeDb("enrich_families_from_informes — M-1 integration", () => {
  it("backfills narrative + titular + strong-tier member; enriched_count=1", async () => {
    const actorId = `m1-enrich-${Date.now()}`;
    const legacyNum = `M1-ENR-${Date.now()}`;
    const titDoc = `M1T-${Date.now()}`;
    createdLegacyNums.push(legacyNum);
    const userClient = await makeUserClient(actorId, "admin");

    // 1. Roster family: titular with NO telefono, 1 member with relacion 'other'
    //    and NO document.
    await stashAndConfirm(userClient, actorId, [
      {
        legacy_numero_familia: legacyNum,
        titular_index: 0,
        person_dedup_hits: [],
        errors: [],
        family_already_imported: false,
        rows: [
          {
            estado: "activa",
            relacion_db: "other",
            fecha_alta: "2024-01-10",
            person: {
              nombre: "Tit",
              apellidos: "Enrich",
              fecha_nacimiento: "1980-01-01",
              numero_documento: titDoc,
              telefono: null,
              metadata: {},
            },
          },
          {
            estado: "activa",
            relacion_db: "other",
            fecha_alta: "2024-01-10",
            person: {
              nombre: "Hijo",
              apellidos: "Enrich",
              fecha_nacimiento: "2012-02-02",
              numero_documento: null,
              metadata: {},
            },
          },
        ],
      },
    ]);

    const { data: fam } = await adminDb!
      .from("families")
      .select("id, titular_id")
      .eq("legacy_numero", legacyNum)
      .single();
    const familyId = (fam as { id: string }).id;
    const titularId = (fam as { titular_id: string }).titular_id;
    const { data: mems } = await adminDb!
      .from("familia_miembros")
      .select("id, person_id")
      .eq("familia_id", familyId);
    const member = (mems as { id: string; person_id: string }[])[0];

    // 2. INFORMES enrich stash for this family: narrative + titular telefono +
    //    a STRONG (documento) member match writing relacion + documento.
    const enrichStash = {
      kind: "informes_enrich_v1",
      src_filename: "m1-enrich.csv",
      families: [
        {
          legacy_numero_familia: legacyNum,
          family_id: familyId,
          titular_id: titularId,
          situacion_familiar_texto: "Situación de prueba M1.",
          necesidades_texto: "Necesidades de prueba M1.",
          titular: {
            nombre: "Tit",
            apellidos: "Enrich",
            telefono: "600555444", // roster titular has none → backfill
            direccion: null,
            municipio: null,
            pais_origen: null,
            codigo_postal: null,
            tipo_documento: null,
            numero_documento: null,
            fecha_nacimiento: null,
            warnings: [],
          },
          members: [
            {
              slot: 2,
              nombre: "Hijo",
              apellidos: "Enrich",
              fecha_nacimiento: "2012-02-02",
              relacion_db: "hijo_a", // roster member is 'other' → backfill
              parentesco_original: "Hijo",
              tipo_documento: "DNI",
              numero_documento: "M1MEMBERDOC",
              warnings: [],
            },
          ],
          member_matches: [
            {
              slot: 2,
              matched_member_id: member.id,
              matched_person_id: member.person_id,
              match_tier: "documento",
            },
          ],
          members_truncated: false,
          warnings: [],
        },
      ],
    };

    const { data: preview } = await adminDb!
      .from("bulk_import_previews")
      .insert({ parsed_rows: enrichStash, created_by: actorId })
      .select("token")
      .single();

    const { data, error } = await userClient.rpc("enrich_families_from_informes", {
      p_token: (preview as { token: string }).token,
      p_src_filename: "m1-enrich.csv",
    });

    // Actor fix: no role/uuid errors for a non-UUID actorId.
    expect(error?.code).not.toBe("42501");
    expect(error?.code).not.toBe("22P02");
    expect(error).toBeNull();
    expect((data as Record<string, number>).enriched_count).toBe(1);

    // Narrative written.
    const { data: famAfter } = await adminDb!
      .from("families")
      .select("situacion_familiar_texto, necesidades_texto")
      .eq("id", familyId)
      .single();
    expect((famAfter as { situacion_familiar_texto: string }).situacion_familiar_texto).toBe(
      "Situación de prueba M1."
    );

    // Titular telefono backfilled.
    const { data: tit } = await adminDb!
      .from("persons")
      .select("telefono")
      .eq("id", titularId)
      .single();
    expect((tit as { telefono: string }).telefono).toBe("600555444");

    // Member relacion + documento backfilled (strong tier).
    const { data: memAfter } = await adminDb!
      .from("familia_miembros")
      .select("relacion, documento")
      .eq("id", member.id)
      .single();
    expect((memAfter as { relacion: string }).relacion).toBe("hijo_a");
    expect((memAfter as { documento: string }).documento).toBe("M1MEMBERDOC");
  });

  it("a legacy_numero with no roster family → skipped_missing (never creates)", async () => {
    const actorId = `m1-missing-${Date.now()}`;
    const legacyNum = `M1-MISSING-${Date.now()}`;
    const userClient = await makeUserClient(actorId, "admin");
    const enrichStash = {
      kind: "informes_enrich_v1",
      src_filename: "m1-missing.csv",
      families: [
        {
          legacy_numero_familia: legacyNum,
          family_id: null,
          titular_id: null,
          situacion_familiar_texto: "x",
          necesidades_texto: "y",
          titular: { nombre: "N", apellidos: "A", telefono: null, direccion: null, municipio: null, pais_origen: null, codigo_postal: null, tipo_documento: null, numero_documento: null, fecha_nacimiento: null, warnings: [] },
          members: [],
          member_matches: [],
          members_truncated: false,
          warnings: [],
        },
      ],
    };
    const { data: preview } = await adminDb!
      .from("bulk_import_previews")
      .insert({ parsed_rows: enrichStash, created_by: actorId })
      .select("token")
      .single();
    const { data, error } = await userClient.rpc("enrich_families_from_informes", {
      p_token: (preview as { token: string }).token,
    });
    expect(error).toBeNull();
    expect((data as Record<string, number>).skipped_missing_count).toBe(1);
    // No family was created.
    const { count } = await adminDb!
      .from("families")
      .select("id", { count: "exact", head: true })
      .eq("legacy_numero", legacyNum);
    expect(count).toBe(0);
  });
});
