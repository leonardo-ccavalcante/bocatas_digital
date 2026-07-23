/**
 * Integration test (env-gated) — Phase 3 of the legacy FAMILIAS importer:
 * confirm_legacy_familias_import REPEATABLE UPSERT (p_mode skip|update) +
 * familia-program enrollment.
 *
 * Behaviours asserted against a live local Supabase (RUN_LOCAL_SUPABASE_TESTS):
 *   1. create (default) — first import writes families/persons/familia_miembros
 *      AND enrolls titular + members in the `programa_familias` program.
 *   2. update — re-import of an existing legacy_numero with p_mode='update'
 *      OVERWRITES family operational fields (estado, num_*), BACKFILLS person
 *      fields (COALESCE — never clobbers a non-empty value), ADDS a
 *      newly-appearing member, and enrolls the new member.
 *   3. update is IDEMPOTENT — a second identical update run creates no new
 *      persons / members / enrollments and leaves counts stable.
 *   4. skip (default) — re-import of an existing legacy_numero without
 *      update mode is skipped, leaving the existing family untouched.
 *
 * This is also follow-up M-1 (a committed integration test for the confirm
 * RPC writing real rows — previously the RPC was proven only via direct SQL).
 *
 * Cleanup: every family created here is torn down in afterAll by legacy_numero
 * (members → enrollments → families → persons), so the suite is self-contained.
 */

import { it, expect, afterAll, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

// ── Test data builders ──────────────────────────────────────────────────────

type TestPerson = {
  nombre: string;
  apellidos: string;
  fecha_nacimiento: string | null;
  numero_documento?: string | null;
  codigo_postal?: string | null;
  telefono?: string | null;
  // Legacy metadata.colectivos tags (capitalized, as the CSV mapper emits them).
  colectivos?: string[];
};

type TestRow = {
  estado: "activa" | "baja";
  relacion_db: string;
  fecha_alta?: string;
  person: TestPerson;
};

function group(legacyNum: string, titularIndex: number, rows: TestRow[]) {
  return {
    legacy_numero_familia: legacyNum,
    titular_index: titularIndex,
    rows: rows.map((r) => ({
      estado: r.estado,
      relacion_db: r.relacion_db,
      fecha_alta: r.fecha_alta ?? "2024-01-10",
      person: {
        nombre: r.person.nombre,
        apellidos: r.person.apellidos,
        fecha_nacimiento: r.person.fecha_nacimiento,
        numero_documento: r.person.numero_documento ?? null,
        codigo_postal: r.person.codigo_postal ?? null,
        telefono: r.person.telefono ?? null,
        metadata: r.person.colectivos ? { colectivos: r.person.colectivos } : {},
      },
    })),
    person_dedup_hits: [],
    errors: [],
    family_already_imported: false,
  };
}

async function stashAndConfirm(
  db: SupabaseClient,
  actorId: string,
  groups: unknown[],
  mode?: "skip" | "update"
) {
  const { data: preview, error: insertErr } = await adminDb!
    .from("bulk_import_previews")
    .insert({
      parsed_rows: { groups, src_filename: "phase3-test.csv" },
      created_by: actorId,
    })
    .select("token")
    .single();
  expect(insertErr).toBeNull();
  const token = (preview as { token: string }).token;
  const args: Record<string, unknown> = {
    p_token: token,
    p_src_filename: "phase3-test.csv",
  };
  if (mode) args.p_mode = mode;
  const { data, error } = await db.rpc("confirm_legacy_familias_import", args);
  return { data: data as Record<string, number> | null, error, token };
}

const PROGRAM_SLUG = "programa_familias";

// legacy_numeros created in this run (cleaned up in afterAll).
const createdLegacyNums: string[] = [];
let programId: string | null = null;

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

async function familyByLegacy(legacyNum: string) {
  const { data } = await adminDb!
    .from("families")
    .select("id, titular_id, estado, num_miembros, num_adultos, num_menores_18")
    .eq("legacy_numero", legacyNum)
    .single();
  return data as {
    id: string;
    titular_id: string;
    estado: string;
    num_miembros: number;
    num_adultos: number;
    num_menores_18: number;
  };
}

async function enrollmentCount(personId: string) {
  const { count } = await adminDb!
    .from("program_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("person_id", personId)
    .eq("program_id", programId!)
    .eq("estado", "activo")
    .is("deleted_at", null);
  return count ?? 0;
}

beforeAll(async () => {
  if (!adminDb) return;
  const { data } = await adminDb
    .from("programs")
    .select("id")
    .eq("slug", PROGRAM_SLUG)
    .single();
  programId = (data as { id: string } | null)?.id ?? null;
});

afterAll(async () => {
  for (const num of createdLegacyNums) {
    await cleanupFamily(num);
  }
});

describeDb("confirm_legacy_familias_import — Phase 3 upsert + enrollment", () => {
  it("create (default) writes the family AND enrolls titular + members in programa_familias", async () => {
    const actorId = `phase3-create-${Date.now()}`;
    const legacyNum = `P3-CREATE-${Date.now()}`;
    createdLegacyNums.push(legacyNum);
    expect(programId).toBeTruthy();

    const userClient = await makeUserClient(actorId, "admin");
    const { data, error } = await stashAndConfirm(userClient, actorId, [
      group(legacyNum, 0, [
        {
          estado: "activa",
          relacion_db: "other",
          person: {
            nombre: "Titu",
            apellidos: "Lar Uno",
            fecha_nacimiento: "1985-03-03",
            numero_documento: `DOC-T-${Date.now()}`,
            codigo_postal: "28012",
          },
        },
        {
          estado: "activa",
          relacion_db: "child",
          person: {
            nombre: "Hijo",
            apellidos: "Lar Uno",
            fecha_nacimiento: "2015-06-06",
            numero_documento: `DOC-M-${Date.now()}`,
          },
        },
      ]),
    ]);

    expect(error).toBeNull();
    expect(data?.created_count).toBe(1);

    const fam = await familyByLegacy(legacyNum);
    expect(fam.estado).toBe("activa");
    expect(fam.num_miembros).toBe(2);
    expect(fam.num_menores_18).toBe(1); // the 2015 child
    expect(fam.num_adultos).toBe(1);

    // Titular enrolled.
    expect(await enrollmentCount(fam.titular_id)).toBe(1);
    // Member enrolled.
    const { data: mems } = await adminDb!
      .from("familia_miembros")
      .select("person_id")
      .eq("familia_id", fam.id);
    expect(mems!.length).toBe(1);
    expect(await enrollmentCount((mems![0] as { person_id: string }).person_id)).toBe(1);
  });

  it("update overwrites family operational fields, backfills person, adds a new member, enrolls the new member", async () => {
    const actorId = `phase3-update-${Date.now()}`;
    const legacyNum = `P3-UPDATE-${Date.now()}`;
    const docTitular = `DOC-UT-${Date.now()}`;
    const docMember1 = `DOC-UM1-${Date.now()}`;
    const docMember2 = `DOC-UM2-${Date.now()}`;
    createdLegacyNums.push(legacyNum);

    const userClient = await makeUserClient(actorId, "admin");

    // 1. Initial create: estado activa, titular has NO telefono, 1 member.
    await stashAndConfirm(userClient, actorId, [
      group(legacyNum, 0, [
        {
          estado: "activa",
          relacion_db: "other",
          person: {
            nombre: "Padre",
            apellidos: "Familia Dos",
            fecha_nacimiento: "1980-01-01",
            numero_documento: docTitular,
            codigo_postal: "28001",
            telefono: null,
          },
        },
        {
          estado: "activa",
          relacion_db: "child",
          person: {
            nombre: "Hija",
            apellidos: "Familia Dos",
            fecha_nacimiento: "2010-02-02",
            numero_documento: docMember1,
          },
        },
      ]),
    ]);
    const famBefore = await familyByLegacy(legacyNum);
    expect(famBefore.estado).toBe("activa");

    // 2. Update re-import: estado now BAJA, titular gains a telefono, a SECOND
    //    member appears. p_mode='update'.
    const { data, error } = await stashAndConfirm(
      userClient,
      actorId,
      [
        group(legacyNum, 0, [
          {
            estado: "baja",
            relacion_db: "other",
            person: {
              nombre: "Padre",
              apellidos: "Familia Dos",
              fecha_nacimiento: "1980-01-01",
              numero_documento: docTitular,
              codigo_postal: "28001",
              telefono: "600999888", // was empty → should backfill
            },
          },
          {
            estado: "activa",
            relacion_db: "child",
            person: {
              nombre: "Hija",
              apellidos: "Familia Dos",
              fecha_nacimiento: "2010-02-02",
              numero_documento: docMember1,
            },
          },
          {
            estado: "activa",
            relacion_db: "child",
            person: {
              nombre: "Bebe",
              apellidos: "Familia Dos",
              fecha_nacimiento: "2023-03-03",
              numero_documento: docMember2, // NEW member
            },
          },
        ]),
      ],
      "update"
    );

    expect(error).toBeNull();
    expect(data?.updated_count).toBe(1);

    const famAfter = await familyByLegacy(legacyNum);
    // Family operational fields OVERWRITTEN.
    expect(famAfter.estado).toBe("baja");
    expect(famAfter.num_miembros).toBe(3);
    expect(famAfter.num_menores_18).toBe(2); // 2010 + 2023

    // Titular telefono BACKFILLED.
    const { data: titular } = await adminDb!
      .from("persons")
      .select("telefono")
      .eq("id", famAfter.titular_id)
      .single();
    expect((titular as { telefono: string | null }).telefono).toBe("600999888");

    // New member added + enrolled.
    const { data: mems } = await adminDb!
      .from("familia_miembros")
      .select("person_id, documento")
      .eq("familia_id", famAfter.id);
    expect(mems!.length).toBe(2);
    const newMem = (mems as { person_id: string; documento: string | null }[]).find(
      (m) => m.documento === docMember2
    );
    expect(newMem).toBeTruthy();
    expect(await enrollmentCount(newMem!.person_id)).toBe(1);
  });

  it("update is idempotent — a second identical update creates no new rows", async () => {
    const actorId = `phase3-idem-${Date.now()}`;
    const legacyNum = `P3-IDEM-${Date.now()}`;
    const docT = `DOC-IT-${Date.now()}`;
    const docM = `DOC-IM-${Date.now()}`;
    createdLegacyNums.push(legacyNum);
    const userClient = await makeUserClient(actorId, "admin");

    const payload = [
      group(legacyNum, 0, [
        {
          estado: "activa",
          relacion_db: "other",
          person: {
            nombre: "Uno",
            apellidos: "Idem",
            fecha_nacimiento: "1979-09-09",
            numero_documento: docT,
          },
        },
        {
          estado: "activa",
          relacion_db: "child",
          person: {
            nombre: "Dos",
            apellidos: "Idem",
            fecha_nacimiento: "2012-12-12",
            numero_documento: docM,
          },
        },
      ]),
    ];

    await stashAndConfirm(userClient, actorId, payload); // create
    const fam = await familyByLegacy(legacyNum);

    // First update.
    await stashAndConfirm(userClient, actorId, payload, "update");
    // Second identical update.
    const { data } = await stashAndConfirm(userClient, actorId, payload, "update");
    expect(data?.updated_count).toBe(1);

    // Still exactly 1 member, 1 titular, 2 enrollments total (no duplicates).
    const { count: memCount } = await adminDb!
      .from("familia_miembros")
      .select("id", { count: "exact", head: true })
      .eq("familia_id", fam.id);
    expect(memCount).toBe(1);

    const { data: persons } = await adminDb!
      .from("persons")
      .select("id")
      .in("numero_documento", [docT, docM]);
    expect(persons!.length).toBe(2); // no duplicate persons
    expect(await enrollmentCount(fam.titular_id)).toBe(1); // not 2,3,...
  });

  it("skip (default) leaves an existing family untouched", async () => {
    const actorId = `phase3-skip-${Date.now()}`;
    const legacyNum = `P3-SKIP-${Date.now()}`;
    const docT = `DOC-ST-${Date.now()}`;
    createdLegacyNums.push(legacyNum);
    const userClient = await makeUserClient(actorId, "admin");

    await stashAndConfirm(userClient, actorId, [
      group(legacyNum, 0, [
        {
          estado: "activa",
          relacion_db: "other",
          person: {
            nombre: "Skip",
            apellidos: "Me",
            fecha_nacimiento: "1990-10-10",
            numero_documento: docT,
          },
        },
      ]),
    ]);

    // Re-import same legacy_numero with a DIFFERENT estado, default (skip) mode.
    const { data } = await stashAndConfirm(userClient, actorId, [
      group(legacyNum, 0, [
        {
          estado: "baja",
          relacion_db: "other",
          person: {
            nombre: "Skip",
            apellidos: "Me",
            fecha_nacimiento: "1990-10-10",
            numero_documento: docT,
          },
        },
      ]),
    ]);

    expect(data?.skipped_count).toBe(1);
    const fam = await familyByLegacy(legacyNum);
    expect(fam.estado).toBe("activa"); // unchanged — NOT overwritten to baja
  });

  // Review finding #1 (HIGH): a person with a pre-existing INACTIVE / soft-deleted
  // programa_familias enrollment must not 23505 the whole family. Enrollment must
  // be idempotent against the NON-partial uq_enrollment_person_program too.
  it("revives an inactive enrollment instead of failing the family (23505 safety)", async () => {
    const actorId = `phase3-revive-${Date.now()}`;
    const legacyNum = `P3-REVIVE-${Date.now()}`;
    const doc = `DOC-REV-${Date.now()}`;
    createdLegacyNums.push(legacyNum);
    expect(programId).toBeTruthy();

    // Pre-seed a person with a COMPLETADO (inactive) programa_familias enrollment.
    const { data: person } = await adminDb!
      .from("persons")
      .insert({
        nombre: "Re",
        apellidos: "Vive",
        fecha_nacimiento: "1975-05-05",
        numero_documento: doc,
        canal_llegada: "programa_familias",
        idioma_principal: "es",
      })
      .select("id")
      .single();
    const personId = (person as { id: string }).id;
    await adminDb!.from("program_enrollments").insert({
      person_id: personId,
      program_id: programId!,
      estado: "completado", // inactive → passes the active-only guard, trips uq_enrollment_person_program
    });

    const userClient = await makeUserClient(actorId, "admin");
    const { data, error } = await stashAndConfirm(userClient, actorId, [
      group(legacyNum, 0, [
        {
          estado: "activa",
          relacion_db: "other",
          person: {
            nombre: "Re",
            apellidos: "Vive",
            fecha_nacimiento: "1975-05-05",
            numero_documento: doc, // dedups onto the pre-seeded person
          },
        },
      ]),
    ]);

    expect(error).toBeNull();
    expect(data?.created_count).toBe(1); // NOT an error_count
    // Enrollment revived to a single active row (no duplicate, no failure).
    expect(await enrollmentCount(personId)).toBe(1);
    const { count: totalEnroll } = await adminDb!
      .from("program_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("person_id", personId)
      .eq("program_id", programId!);
    expect(totalEnroll).toBe(1); // still exactly one row, just revived
  });

  // Review finding #3 (MEDIUM): two no-document, same-name members must NOT
  // collapse onto a single existing row on update (per-loop used guard).
  it("does not collapse two no-document placeholder members onto one row", async () => {
    const actorId = `phase3-collapse-${Date.now()}`;
    const legacyNum = `P3-COLLAPSE-${Date.now()}`;
    const docT = `DOC-CT-${Date.now()}`;
    createdLegacyNums.push(legacyNum);
    const userClient = await makeUserClient(actorId, "admin");

    const placeholderMember = {
      estado: "activa" as const,
      relacion_db: "other",
      person: {
        nombre: "(sin nombre)",
        apellidos: "(sin apellidos)",
        fecha_nacimiento: null,
        numero_documento: null,
      },
    };
    const titular = {
      estado: "activa" as const,
      relacion_db: "other",
      person: {
        nombre: "Cab",
        apellidos: "Eza",
        fecha_nacimiento: "1970-01-01",
        numero_documento: docT,
      },
    };

    // Create: titular + ONE placeholder member.
    await stashAndConfirm(userClient, actorId, [
      group(legacyNum, 0, [titular, placeholderMember]),
    ]);
    const famAfterCreate = await familyByLegacy(legacyNum);
    const { count: created } = await adminDb!
      .from("familia_miembros")
      .select("id", { count: "exact", head: true })
      .eq("familia_id", famAfterCreate.id);
    expect(created).toBe(1);

    // Update: titular + TWO identical placeholder members → both must persist.
    await stashAndConfirm(
      userClient,
      actorId,
      [group(legacyNum, 0, [titular, placeholderMember, placeholderMember])],
      "update"
    );
    const { count: afterUpdate } = await adminDb!
      .from("familia_miembros")
      .select("id", { count: "exact", head: true })
      .eq("familia_id", famAfterCreate.id);
    expect(afterUpdate).toBe(2); // NOT collapsed to 1

    // Idempotent: a second identical update keeps it at 2.
    await stashAndConfirm(
      userClient,
      actorId,
      [group(legacyNum, 0, [titular, placeholderMember, placeholderMember])],
      "update"
    );
    const { count: afterSecond } = await adminDb!
      .from("familia_miembros")
      .select("id", { count: "exact", head: true })
      .eq("familia_id", famAfterCreate.id);
    expect(afterSecond).toBe(2);
  });

  // Root-cause fix (20260708000003): the importer must promote legacy
  // metadata.colectivos (special-category) into the TYPED persons.colectivos
  // column so the IRPF funder report sees it, normalizing the capitalized
  // legacy tags to the enum, AND strip it from stored metadata (no duplicate).
  it("promotes metadata.colectivos → typed persons.colectivos (normalized) and strips the metadata copy", async () => {
    const actorId = `phase3-colectivo-${Date.now()}`;
    const legacyNum = `P3-COLECTIVO-${Date.now()}`;
    const docT = `DOC-COL-${Date.now()}`;
    createdLegacyNums.push(legacyNum);
    const userClient = await makeUserClient(actorId, "admin");

    const { error } = await stashAndConfirm(userClient, actorId, [
      group(legacyNum, 0, [
        {
          estado: "activa",
          relacion_db: "other",
          person: {
            nombre: "Etnia",
            apellidos: "Tag Uno",
            fecha_nacimiento: "1988-08-08",
            numero_documento: docT,
            // Capitalized legacy tags + a mixed one that maps non-trivially
            // (Reclusos → reclusos_exreclusos). Array_agg orders ascending.
            colectivos: ["Gitanos", "Reclusos"],
          },
        },
      ]),
    ]);
    expect(error).toBeNull();

    const fam = await familyByLegacy(legacyNum);
    const { data: person } = await adminDb!
      .from("persons")
      .select("colectivos, metadata")
      .eq("id", fam.titular_id)
      .single();
    const row = person as { colectivos: string[] | null; metadata: Record<string, unknown> };

    // Typed column populated + normalized to the enum (sorted by array_agg).
    expect(row.colectivos).toEqual(["gitanos", "reclusos_exreclusos"]);
    // The metadata duplicate is stripped — single home for special-category data.
    expect(row.metadata).not.toHaveProperty("colectivos");
  });
});
