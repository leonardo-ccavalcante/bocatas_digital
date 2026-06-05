import { describe, it, expect } from "vitest";
import { matchInformesMembers, type ExistingMember } from "./csvInformesMatch";
import type { InformesMember } from "../shared/legacyFamiliasTypes";

// NOTE: use `in` (not `??`) for nullable fields so an EXPLICIT null is honored.
function im(p: Partial<InformesMember> & { slot: number }): InformesMember {
  return {
    slot: p.slot,
    nombre: p.nombre ?? "Juan",
    apellidos: "apellidos" in p ? (p.apellidos ?? null) : "Garcia Lopez",
    fecha_nacimiento: "fecha_nacimiento" in p ? (p.fecha_nacimiento ?? null) : "2010-01-01",
    relacion_db: p.relacion_db ?? "hijo_a",
    parentesco_original: p.parentesco_original ?? null,
    tipo_documento: p.tipo_documento ?? null,
    numero_documento: "numero_documento" in p ? (p.numero_documento ?? null) : null,
    warnings: p.warnings ?? [],
  };
}
function ex(p: Partial<ExistingMember> & { id: string }): ExistingMember {
  return {
    id: p.id,
    person_id: "person_id" in p ? (p.person_id ?? null) : `person-${p.id}`,
    nombre: p.nombre ?? "Juan",
    apellidos: "apellidos" in p ? (p.apellidos ?? null) : "Garcia Lopez",
    fecha_nacimiento: "fecha_nacimiento" in p ? (p.fecha_nacimiento ?? null) : "2010-01-01",
    documento: "documento" in p ? (p.documento ?? null) : null,
  };
}

describe("matchInformesMembers", () => {
  it("Tier 1: unique document match (works even without DOB)", () => {
    const r = matchInformesMembers(
      [im({ slot: 2, fecha_nacimiento: null, numero_documento: "Y-680.2248-N" })],
      [ex({ id: "m1", documento: "Y6802248N" })]
    );
    expect(r[0].match_tier).toBe("documento");
    expect(r[0].matched_member_id).toBe("m1");
    expect(r[0].matched_person_id).toBe("person-m1");
  });

  it("Tier 1: two same-document candidates → ambiguous (refuse)", () => {
    const r = matchInformesMembers(
      [im({ slot: 2, numero_documento: "X1" })],
      [ex({ id: "a", documento: "X1" }), ex({ id: "b", documento: "X1" })]
    );
    expect(r[0].match_tier).toBe("ambiguous");
    expect(r[0].matched_member_id).toBeNull();
  });

  it("Tier 2: name + DOB unique (no document)", () => {
    const r = matchInformesMembers(
      [im({ slot: 2, nombre: "Ana", apellidos: "Pérez Ruiz", fecha_nacimiento: "2008-05-05" })],
      [ex({ id: "m1", nombre: "ana", apellidos: "perez ruiz", fecha_nacimiento: "2008-05-05" })]
    );
    expect(r[0].match_tier).toBe("probe_key");
    expect(r[0].matched_member_id).toBe("m1");
  });

  it("twins: same name + same DOB, no doc → ambiguous (never guess)", () => {
    const r = matchInformesMembers(
      [im({ slot: 2, nombre: "Leo", apellidos: "Gil", fecha_nacimiento: "2015-03-03" })],
      [
        ex({ id: "t1", nombre: "Leo", apellidos: "Gil", fecha_nacimiento: "2015-03-03" }),
        ex({ id: "t2", nombre: "Leo", apellidos: "Gil", fecha_nacimiento: "2015-03-03" }),
      ]
    );
    expect(r[0].match_tier).toBe("ambiguous");
  });

  it("missing DOB + no document → none (never name-only)", () => {
    const r = matchInformesMembers(
      [im({ slot: 2, nombre: "Sin", apellidos: "Fecha", fecha_nacimiento: null, numero_documento: null })],
      [ex({ id: "m1", nombre: "Sin", apellidos: "Fecha", fecha_nacimiento: null })]
    );
    expect(r[0].match_tier).toBe("none");
    expect(r[0].matched_member_id).toBeNull();
  });

  it("Tier 3: single-vs-double surname absorbed (first apellido + DOB)", () => {
    const r = matchInformesMembers(
      [im({ slot: 2, nombre: "Juan", apellidos: "Garcia", fecha_nacimiento: "2010-01-01" })],
      [ex({ id: "m1", nombre: "Juan", apellidos: "Garcia Lopez", fecha_nacimiento: "2010-01-01" })]
    );
    expect(r[0].match_tier).toBe("name_first_apellido");
    expect(r[0].matched_member_id).toBe("m1");
  });

  it("an existing member is not reused for two INFORMES slots", () => {
    const r = matchInformesMembers(
      [
        im({ slot: 2, nombre: "Eva", apellidos: "Sol", fecha_nacimiento: "2012-02-02" }),
        im({ slot: 3, nombre: "Eva", apellidos: "Sol", fecha_nacimiento: "2012-02-02" }),
      ],
      [ex({ id: "only", nombre: "Eva", apellidos: "Sol", fecha_nacimiento: "2012-02-02" })]
    );
    // First slot matches; second finds the only candidate already used → none.
    expect(r[0].matched_member_id).toBe("only");
    expect(r[1].matched_member_id).toBeNull();
    expect(r[1].match_tier).toBe("none");
  });

  it("null apellidos + valid DOB + no document → none (Tier 3 needs an apellido)", () => {
    const r = matchInformesMembers(
      [im({ slot: 2, nombre: "Mononame", apellidos: null, fecha_nacimiento: "2009-09-09" })],
      [ex({ id: "m1", nombre: "Mononame", apellidos: "Whatever", fecha_nacimiento: "2009-09-09" })]
    );
    expect(r[0].match_tier).toBe("none");
    expect(r[0].matched_member_id).toBeNull();
  });

  // ── member_conflict (MEDIUM-2): name matches but DOB/DNI disagrees ──────────
  it("name matches but DOB differs → member_conflict (probable same person; never writes)", () => {
    const r = matchInformesMembers(
      [im({ slot: 2, nombre: "Ana", apellidos: "Perez Ruiz", fecha_nacimiento: "2008-05-05" })],
      [ex({ id: "m1", nombre: "Ana", apellidos: "Perez Ruiz", fecha_nacimiento: "1999-12-31" })]
    );
    expect(r[0].match_tier).toBe("member_conflict");
    expect(r[0].matched_member_id).toBeNull();
    expect(r[0].matched_person_id).toBeNull();
  });

  it("name matches + both documents present but DIFFERENT (no DOB) → member_conflict", () => {
    const r = matchInformesMembers(
      [im({ slot: 2, nombre: "Juan", apellidos: "Garcia", fecha_nacimiento: null, numero_documento: "DOC-A" })],
      [ex({ id: "m1", nombre: "Juan", apellidos: "Garcia", fecha_nacimiento: null, documento: "DOC-B" })]
    );
    expect(r[0].match_tier).toBe("member_conflict");
    expect(r[0].matched_member_id).toBeNull();
  });

  it("name + first-apellido match but DOB differs → member_conflict (not a silent none)", () => {
    const r = matchInformesMembers(
      [im({ slot: 2, nombre: "Juan", apellidos: "Garcia", fecha_nacimiento: "2010-01-01" })],
      [ex({ id: "m1", nombre: "Juan", apellidos: "Garcia Lopez", fecha_nacimiento: "2001-06-06" })]
    );
    expect(r[0].match_tier).toBe("member_conflict");
  });

  it("full name + DOB match but documents DISAGREE → member_conflict (not probe_key; never writes)", () => {
    // Same name + same DOB would normally be probe_key, but both sides carry a
    // DIFFERENT document → a discrepancy that must not auto-write one DNI over another.
    const r = matchInformesMembers(
      [im({ slot: 2, nombre: "Ana", apellidos: "Perez Ruiz", fecha_nacimiento: "2008-05-05", numero_documento: "DOC-A" })],
      [ex({ id: "m1", nombre: "ana", apellidos: "perez ruiz", fecha_nacimiento: "2008-05-05", documento: "DOC-B" })]
    );
    expect(r[0].match_tier).toBe("member_conflict");
    expect(r[0].matched_member_id).toBeNull();
    expect(r[0].matched_person_id).toBeNull();
  });

  it("name + DOB match with MATCHING documents stays a clean probe_key", () => {
    const r = matchInformesMembers(
      [im({ slot: 2, nombre: "Ana", apellidos: "Perez Ruiz", fecha_nacimiento: "2008-05-05", numero_documento: "DOC-SAME" })],
      [ex({ id: "m1", nombre: "ana", apellidos: "perez ruiz", fecha_nacimiento: "2008-05-05", documento: "DOC-SAME" })]
    );
    // Document tier wins first (documento), which is fine — it's a clean match.
    expect(r[0].matched_member_id).toBe("m1");
    expect(["documento", "probe_key"]).toContain(r[0].match_tier);
  });

  it("name matches with NO comparable DOB/DNI on either side → stays none (no discrepancy to flag)", () => {
    const r = matchInformesMembers(
      [im({ slot: 2, nombre: "Sin", apellidos: "Fecha", fecha_nacimiento: null, numero_documento: null })],
      [ex({ id: "m1", nombre: "Sin", apellidos: "Fecha", fecha_nacimiento: null, documento: null })]
    );
    expect(r[0].match_tier).toBe("none");
  });

  it("document beats name when both available (and is preferred)", () => {
    const r = matchInformesMembers(
      [im({ slot: 2, nombre: "X", apellidos: "Y", fecha_nacimiento: "2000-01-01", numero_documento: "DOC9" })],
      [
        ex({ id: "byname", nombre: "X", apellidos: "Y", fecha_nacimiento: "2000-01-01", documento: null }),
        ex({ id: "bydoc", nombre: "Z", apellidos: "W", fecha_nacimiento: "1999-09-09", documento: "DOC9" }),
      ]
    );
    expect(r[0].match_tier).toBe("documento");
    expect(r[0].matched_member_id).toBe("bydoc");
  });
});
