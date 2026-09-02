/**
 * persons.getAll-programas.test.ts — chips de programas en el listado.
 *
 * getAll anexa a cada persona `programas: string[]` (nombres, último primero,
 * cap 3) vía UNA query batelada sobre program_enrollments con los ids de la
 * página devuelta — nunca una query por fila ni los ids de toda la tabla.
 *
 * Patrón: vi.mock createAdminClient + resolver real vía crudRouter.createCaller
 * (server/routers/__tests__/persons.getAll-pagination.test.ts) — nunca testear
 * el mock.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

const fromMock = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import AFTER vi.mock is registered.
import { crudRouter } from "../persons/crud";

function adminCtx(): TrpcContext {
  const user: NonNullable<TrpcContext["user"]> = {
    id: "test-user-1",
    openId: "test-admin",
    email: "admin@bocatas.org",
    name: "admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "persons-getall-programas-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// persons: .select(cols,{count}).is().order().range().returns() → página
// (foto_perfil_url: null → signPathField no toca Storage)
function personsChain(rows: unknown[], count: number) {
  return {
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnValue({
      returns: vi.fn().mockResolvedValue({ data: rows, error: null, count }),
    }),
  };
}

const inMock = vi.fn();

// program_enrollments: .select().in().is().order() → inscripciones
function enrollmentsChain(result: { data: unknown[] | null; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    in: inMock.mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue(result),
  };
}

const personRows = [
  { id: "p1", nombre: "Ana", apellidos: "López", foto_perfil_url: null },
  { id: "p2", nombre: "Berta", apellidos: "Mora", foto_perfil_url: null },
];

// created_at desc — como devuelve la query real
const enrollmentRows = [
  { person_id: "p1", created_at: "2026-04-01", programs: { name: "Duchas" } },
  { person_id: "p1", created_at: "2026-03-01", programs: { name: "Comedor Social" } },
  { person_id: "p1", created_at: "2026-02-01", programs: { name: "Ropero" } },
  { person_id: "p1", created_at: "2026-01-01", programs: { name: "Alfabetización" } },
];

function mockTables(enrollments: { data: unknown[] | null; error: unknown }) {
  fromMock.mockImplementation((table: string) =>
    table === "persons" ? personsChain(personRows, 2) : enrollmentsChain(enrollments)
  );
}

beforeEach(() => {
  fromMock.mockReset();
  inMock.mockReset();
});

describe("persons.getAll — chips de programas (query batelada, cap 3)", () => {
  it("anexa programas por persona: nombres último-primero, cap 3, [] sin inscripciones", async () => {
    mockTables({ data: enrollmentRows, error: null });
    const caller = crudRouter.createCaller(adminCtx());

    const result = await caller.getAll({ limit: 50, offset: 0 });

    const p1 = result.data.find((r) => r.id === "p1")!;
    const p2 = result.data.find((r) => r.id === "p2")!;
    expect(p1.programas).toEqual(["Duchas", "Comedor Social", "Ropero"]);
    expect(p2.programas).toEqual([]);
  });

  it("hace UNA sola query batelada con los ids de la página (nunca por fila)", async () => {
    mockTables({ data: enrollmentRows, error: null });
    const caller = crudRouter.createCaller(adminCtx());

    await caller.getAll({ limit: 50, offset: 0 });

    expect(inMock).toHaveBeenCalledTimes(1);
    expect(inMock).toHaveBeenCalledWith("person_id", ["p1", "p2"]);
  });

  it("con página vacía no consulta inscripciones", async () => {
    fromMock.mockImplementation((table: string) =>
      table === "persons"
        ? personsChain([], 0)
        : enrollmentsChain({ data: [], error: null })
    );
    const caller = crudRouter.createCaller(adminCtx());

    await caller.getAll({ limit: 50, offset: 0 });

    expect(inMock).not.toHaveBeenCalled();
  });

  it("trocea los ids en lotes — 1000 UUIDs en un solo .in() revientan el cap de URL (32KB)", async () => {
    const muchos = Array.from({ length: 450 }, (_, i) => ({
      id: `p${i}`,
      nombre: `N${i}`,
      apellidos: null,
      foto_perfil_url: null,
    }));
    fromMock.mockImplementation((table: string) =>
      table === "persons"
        ? personsChain(muchos, muchos.length)
        : enrollmentsChain({ data: [], error: null })
    );
    const caller = crudRouter.createCaller(adminCtx());

    await caller.getAll({ limit: 1000, offset: 0 });

    // 450 ids con lotes de 200 → 3 llamadas, ninguna con más de 200 ids.
    expect(inMock.mock.calls.length).toBe(3);
    for (const [col, lote] of inMock.mock.calls) {
      expect(col).toBe("person_id");
      expect((lote as string[]).length).toBeLessThanOrEqual(200);
    }
  });

  it("propaga el fallo de la query de inscripciones en vez de fingir chips vacíos", async () => {
    mockTables({ data: null, error: { message: "connection refused" } });
    const caller = crudRouter.createCaller(adminCtx());

    await expect(caller.getAll({ limit: 50, offset: 0 })).rejects.toThrow();
  });
});
