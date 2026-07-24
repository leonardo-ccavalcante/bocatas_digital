/**
 * programs.listado.test.ts — pure helpers of the derived monthly list, plus
 * the getListadoMensual resolver (the getListadoMensual tRPC procedure in
 * server/routers/programs.ts is a two-line pass-through to this function, so
 * testing it directly with a mocked Supabase client IS testing the real
 * resolver logic).
 */
import { describe, it, expect } from "vitest";
import { monthWindow, countByPerson, getListadoMensual } from "./routers/programs.listado";
import type { createAdminClient } from "../client/src/lib/supabase/server";

type Supabase = ReturnType<typeof createAdminClient>;
type Row = Record<string, unknown>;

describe("monthWindow", () => {
  it("covers a 31-day month", () => {
    expect(monthWindow(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-01-31" });
  });
  it("covers February in a leap year", () => {
    expect(monthWindow(2028, 2)).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
  it("covers February in a non-leap year", () => {
    expect(monthWindow(2026, 2)).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
  it("zero-pads single-digit months", () => {
    expect(monthWindow(2026, 9).start).toBe("2026-09-01");
  });
});

describe("countByPerson", () => {
  it("counts per person and ignores anonymous (null) rows", () => {
    const counts = countByPerson(["a", "b", "a", null, "a", null]);
    expect(counts.get("a")).toBe(3);
    expect(counts.get("b")).toBe(1);
    expect(counts.size).toBe(2);
  });
});

// MYT-136C: program_enrollments join uses persons!inner(id, nombre, apellidos)
// (server/routers/programs.listado.ts:49) with no .is("persons.deleted_at", null)
// filter and no post-filter. The .is("deleted_at", null) calls at L51/L64 only
// filter program_enrollments / attendances rows, not the joined persons row, so
// a soft-deleted person with an active enrollment still appears in the
// computed monthly listing.
//
// This fake Supabase client returns canned rows per table exactly as real
// Supabase would for this query shape (persons embedded inline on the
// enrollment row). It also honors a real `.is("persons.deleted_at", null)`
// foreign-table filter IF the code calls it (so the test stays meaningful
// whichever of the fix_hint's two remedies — a Postgrest filter on the
// embedded resource, or a JS post-filter using a widened select — lands):
// each enrollment's `persons` row carries its own `deleted_at`, matching what
// Supabase would actually store/return.
function fakeSupabase(tables: { programs: Row; program_enrollments: Row[]; attendances: Row[] }): Supabase {
  const makeChain = (rows: unknown, isArray: boolean) => {
    const filters: Array<{ col: string; val: unknown }> = [];
    const resolved = () => {
      if (!isArray) return rows;
      let out = rows as Row[];
      for (const f of filters) {
        if (f.col === "persons.deleted_at" && f.val === null) {
          out = out.filter((r) => {
            const persons = r.persons as Row | undefined;
            return !persons || persons.deleted_at == null;
          });
        }
      }
      return out;
    };
    // test mock boundary — chainable Supabase query builder stand-in
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      lte: () => chain,
      gte: () => chain,
      or: () => chain,
      is: (col: string, val: unknown) => {
        filters.push({ col, val });
        return chain;
      },
      single: () => Promise.resolve({ data: rows, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: resolved(), error: null }).then(resolve),
    };
    return chain;
  };
  return {
    from: (table: string) => {
      if (table === "programs") return makeChain(tables.programs, false);
      if (table === "program_enrollments") return makeChain(tables.program_enrollments, true);
      if (table === "attendances") return makeChain(tables.attendances, true);
      throw new Error(`fakeSupabase: unexpected table "${table}"`);
    },
    // test mock boundary — Supabase client mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("getListadoMensual — persons!inner join must exclude soft-deleted persons (MYT-136C)", () => {
  it("does not include a soft-deleted person's enrollment in the monthly listing", async () => {
    const ACTIVE_ID = "11111111-1111-1111-1111-111111111111";
    const DELETED_ID = "22222222-2222-2222-2222-222222222222";

    const supabase = fakeSupabase({
      programs: { id: "prog-1", slug: "comedor", name: "Comedor", tipo: "basico" },
      program_enrollments: [
        {
          id: "enr-1",
          estado: "activo",
          fecha_inicio: "2026-06-01",
          fecha_fin: null,
          persons: { id: ACTIVE_ID, nombre: "Ana", apellidos: "Garcia", deleted_at: null },
        },
        {
          // Soft-deleted person: still has an active enrollment row, and the
          // real join (persons!inner with no deleted_at filter on persons)
          // returns it exactly like this — deleted_at is a real column on
          // persons but nothing in the select/filter chain excludes it.
          id: "enr-2",
          estado: "activo",
          fecha_inicio: "2026-06-01",
          fecha_fin: null,
          persons: { id: DELETED_ID, nombre: "Baja", apellidos: "Persona", deleted_at: "2026-05-01T00:00:00Z" },
        },
      ],
      attendances: [],
    });

    const result = await getListadoMensual(supabase, "prog-1", 2026, 6);
    const ids = result.personas.map((p) => p.person_id);

    // MYT-136C: this fails against current HEAD — DELETED_ID is present
    // because nothing filters persons.deleted_at on the enrollment join.
    expect(ids).not.toContain(DELETED_ID);
    expect(result.totales.inscritos).toBe(1);
  });
});
