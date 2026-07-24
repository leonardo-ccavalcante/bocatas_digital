/**
 * programs.listado.test.ts — Contract test for the "listado mensual" (ADR-0013).
 *
 * MYTHOS: MYT-136C
 * server/routers/programs.listado.ts:49 selects `persons!inner(id, nombre,
 * apellidos)` on the `program_enrollments` join. The `.is("deleted_at", null)`
 * on L51 filters `program_enrollments.deleted_at`, NOT `persons.deleted_at` —
 * so a person soft-deleted from `persons` (but whose enrollment row itself is
 * not soft-deleted) still appears in the monthly listado. Same defect shape
 * already corrected in programs.enlace.ts (GROUP 4a) and programs.compliance.ts
 * (GROUP 4c, post-filter on persons.deleted_at).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(),
}));

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;

/**
 * Minimal Supabase/postgrest chain mock. For `program_enrollments`, embeds a
 * `persons` object per row (simulating `persons!inner(...)`) by looking up
 * `person_id` in the `persons` fixture table — mirroring real postgrest
 * embedded-resource behavior: the embed is NOT auto-filtered by the embedded
 * table's own soft-delete column unless the query explicitly filters it
 * (dot-notation `"persons.deleted_at"` is honored below, for whichever fix
 * strategy — in-query filter or in-app post-filter — the fixer chooses).
 */
function mockDb(tables: Record<string, Row[]>) {
  const makeChain = (table: string) => {
    const eqFilters: Array<{ col: string; val: unknown }> = [];
    const isFilters: Array<{ col: string; val: unknown }> = [];
    const lteFilters: Array<{ col: string; val: unknown }> = [];
    const gteFilters: Array<{ col: string; val: unknown }> = [];
    let orExpr: string | null = null;

    const matchesNested = (row: Row, col: string, val: unknown) => {
      if (col.includes(".")) {
        const [rel, nestedCol] = col.split(".");
        const nested = row[rel] as Row | null;
        return nested ? nested[nestedCol] === val : val === null;
      }
      return row[col] === val;
    };

    const rowsFor = () => {
      let rows: Row[] = (tables[table] ?? []).map((r) => ({ ...r }));
      if (table === "program_enrollments") {
        rows = rows
          .map((r) => ({
            ...r,
            persons: (tables.persons ?? []).find((p) => p.id === r.person_id) ?? null,
          }))
          // !inner semantics: enrollment rows without a matching person are dropped
          .filter((r) => r.persons !== null);
      }
      for (const f of eqFilters) rows = rows.filter((r) => matchesNested(r, f.col, f.val));
      for (const f of isFilters) rows = rows.filter((r) => matchesNested(r, f.col, f.val));
      for (const f of lteFilters) {
        rows = rows.filter((r) => (r[f.col] as string) <= (f.val as string));
      }
      for (const f of gteFilters) {
        rows = rows.filter((r) => (r[f.col] as string) >= (f.val as string));
      }
      if (orExpr) {
        const clauses = orExpr.split(",");
        rows = rows.filter((r) =>
          clauses.some((clause) => {
            const [col, op, val] = clause.split(".");
            if (op === "is" && val === "null") return r[col] == null;
            if (op === "gte") return r[col] != null && (r[col] as string) >= val;
            return false;
          })
        );
      }
      return rows;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, val: unknown) => { eqFilters.push({ col, val }); return chain; }),
      is: vi.fn((col: string, val: unknown) => { isFilters.push({ col, val }); return chain; }),
      lte: vi.fn((col: string, val: unknown) => { lteFilters.push({ col, val }); return chain; }),
      gte: vi.fn((col: string, val: unknown) => { gteFilters.push({ col, val }); return chain; }),
      or: vi.fn((expr: string) => { orExpr = expr; return chain; }),
      single: vi.fn(() => {
        const row = rowsFor()[0] ?? null;
        return Promise.resolve({
          data: row,
          error: row ? null : { code: "PGRST116", message: "not found" },
        });
      }),
    };
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rowsFor(), error: null }).then(resolve);
    return chain;
  };

  return { from: vi.fn((table: string) => makeChain(table)) };
}

function buildContext(): TrpcContext {
  return {
    user: {
      id: 1, openId: "admin", name: "Admin", email: "a@b.com",
      role: "admin", loginMethod: "google",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "test",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req: {} as any, res: {} as any,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("programsRouter.getListadoMensual — soft-deleted persons (MYTHOS: MYT-136C)", () => {
  it("excludes a soft-deleted person from the monthly listado, even though their enrollment row is not soft-deleted", async () => {
    const { createAdminClient } = await import("../../../client/src/lib/supabase/server");
    vi.mocked(createAdminClient).mockReturnValue(
      mockDb({
        programs: [{ id: ID(1), slug: "comedor_2026", name: "Comedor", tipo: "comedor" }],
        program_enrollments: [
          {
            id: ID(10), program_id: ID(1), estado: "activo",
            fecha_inicio: "2026-06-01", fecha_fin: null,
            deleted_at: null, person_id: ID(20),
          },
          {
            // enrollment row itself is healthy — only the PERSON is soft-deleted
            id: ID(11), program_id: ID(1), estado: "activo",
            fecha_inicio: "2026-06-01", fecha_fin: null,
            deleted_at: null, person_id: ID(21),
          },
        ],
        persons: [
          { id: ID(20), nombre: "Ana", apellidos: "García", deleted_at: null },
          { id: ID(21), nombre: "Borja", apellidos: "Deleted", deleted_at: "2026-07-01T00:00:00Z" },
        ],
        attendances: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    );

    const { programsRouter } = await import("../programs");
    const caller = programsRouter.createCaller(buildContext());
    const result = await caller.getListadoMensual({ programId: ID(1), year: 2026, month: 7 });

    // Only Ana (active person) should appear; Borja is soft-deleted.
    const nombres = result.personas.map((p) => p.nombre);
    expect(nombres).not.toContain("Borja");
    expect(result.personas.length).toBe(1);
    expect(result.totales.inscritos).toBe(1);
  });
});
