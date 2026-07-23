/**
 * tree.test.ts — pure-function tests for program tree helpers (ADR-0013).
 * RED → GREEN: written before the implementation exists.
 */
import { describe, it, expect } from "vitest";
import { getRoots, getAncestors, getChildren, suggestChildTipo } from "../lib/tree";
import type { Program } from "../schemas";

// ─── Fixture ──────────────────────────────────────────────────────────────────

function mkProgram(overrides: Partial<Program> & { id: string }): Program {
  return {
    slug: overrides.id,
    name: overrides.id,
    description: null,
    icon: null,
    is_default: false,
    is_active: true,
    display_order: 1,
    volunteer_can_access: true,
    requires_consents: [],
    fecha_inicio: null,
    fecha_fin: null,
    config: {},
    responsable_id: null,
    created_at: null,
    updated_at: null,
    parent_id: null,
    ...overrides,
  } as Program;
}

const ROOT_A = mkProgram({ id: "root_a", slug: "formacion", name: "Formación", tipo: "contenedor" });
const COURSE_B = mkProgram({ id: "course_b", slug: "cocina", name: "Cocina", parent_id: "root_a", tipo: "curso" });
const EDITION_C = mkProgram({ id: "edition_c", slug: "cocina_jan", name: "Cocina Enero", parent_id: "course_b", tipo: "edicion" });
const ROOT_D = mkProgram({ id: "root_d", slug: "comedor", name: "Comedor" });

const ALL = [ROOT_A, COURSE_B, EDITION_C, ROOT_D];

// ─── getRoots ─────────────────────────────────────────────────────────────────

describe("getRoots", () => {
  it("returns only programs with no parent_id", () => {
    const roots = getRoots(ALL);
    expect(roots.map((p) => p.id)).toEqual(expect.arrayContaining(["root_a", "root_d"]));
    expect(roots).toHaveLength(2);
  });

  it("returns all programs when none have a parent", () => {
    const flat = [ROOT_A, ROOT_D];
    expect(getRoots(flat)).toHaveLength(2);
  });

  it("returns empty array for an empty list", () => {
    expect(getRoots([])).toHaveLength(0);
  });
});

// ─── getAncestors ─────────────────────────────────────────────────────────────

describe("getAncestors", () => {
  it("returns empty array for a root program", () => {
    expect(getAncestors(ALL, "root_a")).toHaveLength(0);
  });

  it("returns single ancestor for a depth-2 program", () => {
    const anc = getAncestors(ALL, "course_b");
    expect(anc).toHaveLength(1);
    expect(anc[0].id).toBe("root_a");
  });

  it("returns two ancestors in root-first order for a depth-3 program", () => {
    const anc = getAncestors(ALL, "edition_c");
    expect(anc).toHaveLength(2);
    expect(anc[0].id).toBe("root_a");
    expect(anc[1].id).toBe("course_b");
  });

  it("returns empty array for an unknown id", () => {
    expect(getAncestors(ALL, "unknown_id")).toHaveLength(0);
  });
});

// ─── getChildren ──────────────────────────────────────────────────────────────

describe("getChildren", () => {
  it("returns direct children of root_a", () => {
    const children = getChildren(ALL, "root_a");
    expect(children).toHaveLength(1);
    expect(children[0].id).toBe("course_b");
  });

  it("returns direct children of course_b", () => {
    const children = getChildren(ALL, "course_b");
    expect(children).toHaveLength(1);
    expect(children[0].id).toBe("edition_c");
  });

  it("returns empty array for a leaf node", () => {
    expect(getChildren(ALL, "edition_c")).toHaveLength(0);
  });

  it("returns empty array for an unknown id", () => {
    expect(getChildren(ALL, "nonexistent")).toHaveLength(0);
  });
});

// ─── suggestChildTipo ─────────────────────────────────────────────────────────

describe("suggestChildTipo", () => {
  it("suggests edicion when parent tipo is curso", () => {
    expect(suggestChildTipo("curso")).toBe("edicion");
  });

  it("suggests basico for contenedor", () => {
    expect(suggestChildTipo("contenedor")).toBe("basico");
  });

  it("suggests basico for continuo", () => {
    expect(suggestChildTipo("continuo")).toBe("basico");
  });

  it("suggests basico for null/undefined", () => {
    expect(suggestChildTipo(null)).toBe("basico");
    expect(suggestChildTipo(undefined)).toBe("basico");
  });
});
