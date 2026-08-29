import { describe, it, expect } from "vitest";
import { pickRepresentatives, resolveRepresentatives } from "../reparto-helpers";

describe("pickRepresentatives (PRE-2) — deterministic titular rule", () => {
  it("prefers a 'parent' over other relations", () => {
    const reps = pickRepresentatives([
      { familia_id: "A", relacion: "child", created_at: "2026-01-01", person_id: "pc" },
      { familia_id: "A", relacion: "parent", created_at: "2026-02-01", person_id: "pp" },
    ]);
    expect(reps.get("A")?.person_id).toBe("pp");
  });

  it("falls back to earliest member when no parent exists", () => {
    const reps = pickRepresentatives([
      { familia_id: "B", relacion: "other", created_at: "2026-03-01", person_id: "p2" },
      { familia_id: "B", relacion: "sibling", created_at: "2026-01-01", person_id: "p1" },
    ]);
    expect(reps.get("B")?.person_id).toBe("p1");
  });

  it("is deterministic and handles multiple families", () => {
    const input = [
      { familia_id: "A", relacion: "parent", created_at: "2026-01-02", person_id: "a2" },
      { familia_id: "A", relacion: "parent", created_at: "2026-01-01", person_id: "a1" },
      { familia_id: "B", relacion: "child", created_at: "2026-01-01", person_id: "b1" },
    ];
    expect(pickRepresentatives(input).get("A")?.person_id).toBe("a1");
    expect(pickRepresentatives(input).get("B")?.person_id).toBe("b1");
  });
});

// resolveRepresentatives takes the db client as a param — hand it a fake keyed
// by table (same convention as reparto-acta.test.ts; filters are ignored).
function makeDb(tableResults: Record<string, { data: unknown; error: null }>) {
  const makeBuilder = (table: string) => {
    const read = () => tableResults[table] ?? { data: [], error: null };
    const b: Record<string, unknown> = {
      select: () => b, eq: () => b, in: () => b, is: () => b, order: () => b, limit: () => b,
      then: (r: (v: unknown) => unknown) => r(read()),
    };
    return b;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (t: string) => makeBuilder(t) } as any;
}

describe("resolveRepresentatives — families.titular_id wins over the member heuristic", () => {
  it("names the titular even when only a child is mirrored into familia_miembros (F182)", async () => {
    const db = makeDb({
      families: { data: [{ id: "fam1", titular_id: "pT" }], error: null },
      familia_miembros: {
        data: [{ familia_id: "fam1", relacion: "hijo_a", created_at: "2026-01-01", person_id: "pC" }],
        error: null,
      },
      persons: {
        data: [
          { id: "pT", nombre: "Titular", apellidos: "Reparto", numero_documento: "QA-REP-DOC-001", telefono: "600111222" },
          { id: "pC", nombre: "Hijo", apellidos: "Reparto", numero_documento: null, telefono: null },
        ],
        error: null,
      },
    });
    const reps = await resolveRepresentatives(db, ["fam1"]);
    expect(reps.get("fam1")?.person_id).toBe("pT");
    expect(reps.get("fam1")?.nombre).toBe("Titular");
    expect(reps.get("fam1")?.numero_documento).toBe("QA-REP-DOC-001");
  });

  it("resolves a family that has NO familia_miembros rows at all (never 'Sin titular')", async () => {
    const db = makeDb({
      families: { data: [{ id: "fam1", titular_id: "pT" }], error: null },
      familia_miembros: { data: [], error: null },
      persons: {
        data: [{ id: "pT", nombre: "Maria", apellidos: "Garcia Lopez", numero_documento: "12345678A", telefono: "600000000" }],
        error: null,
      },
    });
    const reps = await resolveRepresentatives(db, ["fam1"]);
    expect(reps.get("fam1")?.person_id).toBe("pT");
    expect(reps.get("fam1")?.apellidos).toBe("Garcia Lopez");
  });

  it("falls back to the member heuristic when titular_id is null (legacy families)", async () => {
    const db = makeDb({
      families: { data: [{ id: "fam1", titular_id: null }], error: null },
      familia_miembros: {
        data: [{ familia_id: "fam1", relacion: "other", created_at: "2026-01-01", person_id: "pM" }],
        error: null,
      },
      persons: { data: [{ id: "pM", nombre: "Solo", apellidos: "Miembro", numero_documento: null, telefono: null }], error: null },
    });
    const reps = await resolveRepresentatives(db, ["fam1"]);
    expect(reps.get("fam1")?.person_id).toBe("pM");
  });
});
