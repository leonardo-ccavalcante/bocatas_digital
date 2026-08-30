/**
 * announcements.pagination.test.ts — paginar ANTES de filtrar pierde novedades.
 *
 * `getAll` aplicaba `.range(offset, offset+limit-1)` en SQL y sólo después
 * filtraba en memoria por audiencia. Dos fallos:
 *
 *   · la página trae menos de `limit` (o cero) aunque haya novedades visibles
 *     más abajo, y esas desaparecen del listado sin que nadie lo note;
 *   · `total` devolvía el tamaño de la página YA filtrada, así que quien pagine
 *     con ese número pagina sobre un dato falso.
 *
 * Para admin/superadmin el filtro no hace nada, así que ahí sí se puede cortar
 * en SQL y pedir el count exacto. Para el resto hay que filtrar primero.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const fromMock = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: fromMock }),
  createServerClient: vi.fn(),
}));

import { announcementsRouter } from "../announcements";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

function ctx(role: string): TrpcContext {
  return {
    user: {
      id: "11111111-1111-4111-8111-111111111111", openId: "u", email: "u@bocatas.org",
      name: "u", loginMethod: "manus", role,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as TrpcContext["user"],
    logger: new Logger(),
    correlationId: "pag-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

/** Novedad visible para voluntarios. */
function fila(id: number) {
  return {
    id: `a${id}`,
    titulo: `Novedad ${id}`,
    announcement_audiences: [{ roles: ["voluntario"], programs: [] }],
  };
}

/** Novedad que un voluntario NO puede ver. */
function ajena(id: number) {
  return {
    id: `x${id}`,
    titulo: `Ajena ${id}`,
    announcement_audiences: [{ roles: ["admin"], programs: [] }],
  };
}

let rangeCalls: [number, number][];

function mockAnnouncements(rows: unknown[], count: number | null = null) {
  rangeCalls = [];
  fromMock.mockImplementation((table: string) => {
    if (table === "program_enrollments" || table === "programs") {
      // Encadenable y thenable: el resolver hace .eq().is().eq() y luego await.
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "order"]) c[m] = vi.fn(() => c);
      c.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res);
      return c;
    }
    const chain: Record<string, unknown> = {};
    const result = { data: rows, error: null, count };
    for (const m of ["select", "order", "eq", "or", "gte", "lte", "is", "in"]) {
      chain[m] = vi.fn(() => chain);
    }
    chain.range = vi.fn((a: number, b: number) => {
      rangeCalls.push([a, b]);
      return chain;
    });
    chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    return chain;
  });
}

beforeEach(() => vi.clearAllMocks());

describe("announcements.getAll — paginación", () => {
  it("un voluntario recibe una página COMPLETA aunque haya ajenas intercaladas", async () => {
    // 3 ajenas por delante: con el corte en SQL, la primera página traía 0 suyas.
    mockAnnouncements([ajena(1), ajena(2), ajena(3), fila(1), fila(2)]);

    const res = await announcementsRouter.createCaller(ctx("voluntario")).getAll({ limit: 2, offset: 0 });

    expect(res.announcements).toHaveLength(2);
    expect(res.announcements.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("total cuenta todo lo visible, no sólo la página", async () => {
    mockAnnouncements([fila(1), fila(2), fila(3), fila(4), ajena(9)]);

    const res = await announcementsRouter.createCaller(ctx("voluntario")).getAll({ limit: 2, offset: 0 });

    expect(res.announcements).toHaveLength(2);
    expect(res.total).toBe(4);
  });

  it("el offset se aplica sobre lo visible, no sobre las filas crudas", async () => {
    mockAnnouncements([ajena(1), fila(1), fila(2), fila(3)]);

    const res = await announcementsRouter.createCaller(ctx("voluntario")).getAll({ limit: 2, offset: 1 });

    expect(res.announcements.map((a) => a.id)).toEqual(["a2", "a3"]);
  });

  it("para quien lo ve todo, el corte sigue haciéndose en SQL", async () => {
    mockAnnouncements([fila(1), fila(2)], 57);

    const res = await announcementsRouter.createCaller(ctx("admin")).getAll({ limit: 2, offset: 10 });

    expect(rangeCalls).toContainEqual([10, 11]);
    expect(res.total).toBe(57);
  });
});
