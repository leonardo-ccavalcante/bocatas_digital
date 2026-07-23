/**
 * programs.tree.test.ts — contract tests for the nested-programs router work
 * (Wave 1b): tree fields on create, depth guard, inscribible gate, estado
 * catalog validation, baja-requires-motivo, and enrollment_events writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { initTRPC } from "@trpc/server";
import { createAdminClient } from "../client/src/lib/supabase/server";
import { programsRouter } from "./routers/programs";
import type { TrpcContext } from "./_core/context";
import { Logger } from "./_core/logger";

vi.mock("../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(),
}));

const t = initTRPC.context<TrpcContext>().create({
  transformer: { serialize: (v: unknown) => v, deserialize: (v: unknown) => v },
});
const createCaller = t.createCallerFactory(programsRouter);
const caller = createCaller({
  user: {
    id: 1,
    openId: "test-open-id",
    name: "Test Admin",
    email: "test@test.com",
    role: "admin",
    loginMethod: "google",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  logger: new Logger(),
  correlationId: "test-correlation-id",
  // test mock boundary — Supabase client mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: {} as any,
  // test mock boundary — Supabase client mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: {} as any,
});

const ID = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;

type Row = Record<string, unknown>;

/** Table-routing chainable mock. `rows` keyed by table; single()/maybeSingle()
 * resolve by matching eq("id", …) against the table rows when possible. */
function mockDb(tables: Record<string, Row[]>) {
  const inserts: Record<string, Row[]> = {};
  const updates: Record<string, Row[]> = {};
  const makeChain = (table: string) => {
    const filters: Record<string, unknown> = {};
    const rowsFor = () => {
      const rows = tables[table] ?? [];
      const matched = rows.filter((r) =>
        Object.entries(filters).every(([k, v]) => !(k in r) || r[k] === v)
      );
      return matched;
    };
    // test mock boundary — chainable Supabase query builder
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: vi.fn(() => chain),
      order: vi.fn(() => chain),
      range: vi.fn(() => Promise.resolve({ data: rowsFor(), error: null, count: rowsFor().length })),
      is: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      eq: vi.fn((col: string, val: unknown) => {
        filters[col] = val;
        return chain;
      }),
      in: vi.fn(() => chain),
      single: vi.fn(() => {
        const row = rowsFor()[0] ?? inserts[table]?.[0] ?? null;
        return Promise.resolve({ data: row, error: row ? null : { code: "PGRST116", message: "not found" } });
      }),
      maybeSingle: vi.fn(() => Promise.resolve({ data: rowsFor()[0] ?? null, error: null })),
      insert: vi.fn((payload: Row | Row[]) => {
        (inserts[table] ??= []).push(...(Array.isArray(payload) ? payload : [payload]));
        return chain;
      }),
      update: vi.fn((payload: Row) => {
        (updates[table] ??= []).push(payload);
        return chain;
      }),
      then: undefined,
    };
    // Make awaiting the chain (insert/update without .select()) resolve.
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rowsFor()[0] ?? inserts[table]?.[0] ?? null, error: null }).then(resolve);
    return chain;
  };
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn((table: string) => makeChain(table)),
    // test mock boundary — Supabase client mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return { inserts, updates };
}

beforeEach(() => vi.clearAllMocks());

describe("programs.create — tree fields", () => {
  it("passes parent_id, tipo, inscribible, estados_habilitados, plazas, etiquetas to the insert", async () => {
    const { inserts } = mockDb({
      programs: [{ id: ID(1), parent_id: null, slug: "curso_cocina", name: "Curso de Cocina" }],
    });
    await caller.create({
      slug: "cocina_enero",
      name: "Cocina Enero 2026",
      parent_id: ID(1),
      tipo: "edicion",
      inscribible: true,
      estados_habilitados: ["inscrito", "admitido", "lista_espera", "baja", "terminado"],
      plazas: 15,
      etiquetas: ["cocina"],
    });
    const inserted = inserts["programs"]?.[0];
    expect(inserted).toMatchObject({
      parent_id: ID(1),
      tipo: "edicion",
      inscribible: true,
      plazas: 15,
      etiquetas: ["cocina"],
    });
    expect(inserted?.estados_habilitados).toContain("lista_espera");
  });

  it("accepts a slug with a year (editions carry digits, e.g. cocina_enero_2026)", async () => {
    const { inserts } = mockDb({ programs: [{ id: ID(2), slug: "cocina_enero_2026" }] });
    await caller.create({
      slug: "cocina_enero_2026",
      name: "Cocina Enero 2026",
      tipo: "edicion",
      inscribible: true,
    });
    expect(inserts["programs"]?.[0]).toMatchObject({ slug: "cocina_enero_2026" });
  });

  it("rejects an unknown tipo at the Zod layer", async () => {
    mockDb({ programs: [] });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      caller.create({ slug: "x", name: "X programa", tipo: "megaprograma" as any })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects estados_habilitados outside the global catalog", async () => {
    mockDb({ programs: [] });
    await expect(
      caller.create({
        slug: "x",
        name: "X programa",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        estados_habilitados: ["activo", "en_orbita"] as any,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a parent at depth 3 (tree is capped at 3 levels)", async () => {
    mockDb({
      programs: [
        { id: ID(1), parent_id: null, slug: "formacion" },
        { id: ID(2), parent_id: ID(1), slug: "curso_cocina" },
        { id: ID(3), parent_id: ID(2), slug: "cocina_enero" },
      ],
    });
    await expect(
      caller.create({ slug: "grupo_a", name: "Grupo A", parent_id: ID(3), tipo: "basico" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("rofundidad") });
  });
});

describe("programs.enrollPerson — inscribible gate + estado inicial + event", () => {
  const program = (over: Row = {}) => ({
    id: ID(5),
    name: "Cocina Enero 2026",
    requires_consents: [],
    inscribible: true,
    estados_habilitados: ["inscrito", "admitido", "lista_espera", "baja", "terminado"],
    plazas: null,
    ...over,
  });

  it("blocks enrollment into a non-inscribible program (contenedor)", async () => {
    mockDb({ programs: [program({ inscribible: false })] });
    await expect(
      caller.enrollPerson({ personId: ID(9), programId: ID(5) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("no admite inscripciones") });
  });

  it("uses the funnel's first enabled estado when 'activo' is not enabled, and logs an event", async () => {
    const { inserts } = mockDb({ programs: [program()], program_enrollments: [], enrollment_events: [] });
    await caller.enrollPerson({ personId: ID(9), programId: ID(5) });
    expect(inserts["program_enrollments"]?.[0]).toMatchObject({ estado: "inscrito" });
    expect(inserts["enrollment_events"]?.[0]).toMatchObject({
      estado_anterior: null,
      estado_nuevo: "inscrito",
      actor: "1",
    });
  });
});

describe("programs.updateEnrollmentEstado — catalog + motivo + events", () => {
  const enrollment = {
    id: ID(7),
    person_id: ID(9),
    program_id: ID(5),
    estado: "admitido",
    programs: { estados_habilitados: ["inscrito", "admitido", "lista_espera", "baja", "terminado"] },
  };

  it("rejects an estado the program has not enabled", async () => {
    mockDb({ program_enrollments: [enrollment] });
    await expect(
      caller.updateEnrollmentEstado({ enrollmentId: ID(7), estado: "preseleccionado" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires motivo when moving to baja", async () => {
    mockDb({ program_enrollments: [enrollment] });
    await expect(
      caller.updateEnrollmentEstado({ enrollmentId: ID(7), estado: "baja" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("motivo") });
  });

  it("baja with motivo updates the row, sets fecha_fin and appends the event", async () => {
    const { inserts, updates } = mockDb({
      program_enrollments: [enrollment],
      enrollment_events: [],
    });
    await caller.updateEnrollmentEstado({ enrollmentId: ID(7), estado: "baja", motivo: "encontró trabajo" });
    expect(updates["program_enrollments"]?.[0]).toMatchObject({ estado: "baja", motivo_baja: "encontró trabajo" });
    expect(updates["program_enrollments"]?.[0]?.fecha_fin).toBeTruthy();
    expect(inserts["enrollment_events"]?.[0]).toMatchObject({
      estado_anterior: "admitido",
      estado_nuevo: "baja",
      motivo: "encontró trabajo",
      actor: "1",
    });
  });

  it("promotes lista_espera → admitido without motivo", async () => {
    const { inserts } = mockDb({
      program_enrollments: [{ ...enrollment, estado: "lista_espera" }],
      enrollment_events: [],
    });
    const res = await caller.updateEnrollmentEstado({ enrollmentId: ID(7), estado: "admitido" });
    expect(res).toBeTruthy();
    expect(inserts["enrollment_events"]?.[0]).toMatchObject({
      estado_anterior: "lista_espera",
      estado_nuevo: "admitido",
    });
  });
});
