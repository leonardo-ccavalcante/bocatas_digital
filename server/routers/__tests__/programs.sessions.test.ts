/**
 * programs.sessions.test.ts — RED-first contract tests for the session
 * lifecycle router (programs.sessions.ts).
 *
 * Tests cover:
 * - State transitions: valid (planificada→abierta→cerrada) and invalid
 * - cerrarSesion: rejects when required close-config field is missing
 * - cerrarSesion: rejects empty array [] and whitespace-only string for obligatorio field (GROUP 7a)
 * - cancelarSesion: rejects when motivo is empty
 * - reprogramarSesion: rejects non-planificada sessions
 * - reprogramarSesion: rejects if target fecha already has a session (GROUP 7d)
 * - generarSesiones: idempotency (second run creates nothing new) — real Monday fixture (GROUP 6a)
 * - generarSesiones: inserts with correct fields and location_id from config (GROUP 1a)
 * - generarSesiones: BAD_REQUEST when programacion field is present but invalid (GROUP 7c)
 * - abrirSesion: locationId stamps session.location_id (GROUP 1b)
 * - listSesiones: FORBIDDEN for voluntario on volunteer_can_access=false program (GROUP 3)
 * - closeConfig: preset apply; invalid config rejected
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { initTRPC } from "@trpc/server";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { sessionsRouter } from "../programs.sessions";
import { closeConfigRouter } from "../programs.closeConfig";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(),
}));

const t = initTRPC.context<TrpcContext>().create({
  transformer: { serialize: (v: unknown) => v, deserialize: (v: unknown) => v },
});

function buildCtx(role: "admin" | "voluntario"): TrpcContext {
  return {
    user: {
      id: 1, openId: "test", name: "Test", email: "t@t.com",
      role, loginMethod: "google",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "test-corr",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req: {} as any, res: {} as any,
  };
}

const sessionsCaller = t.createCallerFactory(sessionsRouter)(buildCtx("admin"));
const voluntarioCaller = t.createCallerFactory(sessionsRouter)(buildCtx("voluntario"));

const closeConfigCaller = t.createCallerFactory(closeConfigRouter)(buildCtx("admin"));

const ID = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
type Row = Record<string, unknown>;

function mockDb(tables: Record<string, Row[]>) {
  const inserts: Record<string, Row[]> = {};
  const updates: Record<string, Row[]> = {};
  const makeChain = (table: string) => {
    const filters: Record<string, unknown> = {};
    let inFilter: { col: string; vals: unknown[] } | null = null;
    let neqFilter: { col: string; val: unknown } | null = null;
    let limitN: number | null = null;
    const isNullCols: string[] = [];

    const rowsFor = () => {
      let rows = tables[table] ?? [];
      rows = rows.filter((r) =>
        Object.entries(filters).every(([k, v]) => !(k in r) || r[k] === v)
      );
      if (inFilter) {
        rows = rows.filter((r) => inFilter!.vals.includes(r[inFilter!.col]));
      }
      if (neqFilter) {
        rows = rows.filter((r) => r[neqFilter!.col] !== neqFilter!.val);
      }
      if (isNullCols.length) {
        rows = rows.filter((r) => isNullCols.every((col) => r[col] == null));
      }
      if (limitN !== null) rows = rows.slice(0, limitN);
      return rows;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: vi.fn(() => chain),
      order: vi.fn(() => chain),
      is: vi.fn((col: string, val: unknown) => { if (val === null) isNullCols.push(col); return chain; }),
      limit: vi.fn((n: number) => { limitN = n; return chain; }),
      neq: vi.fn((col: string, val: unknown) => { neqFilter = { col, val }; return chain; }),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      eq: vi.fn((col: string, val: unknown) => { filters[col] = val; return chain; }),
      in: vi.fn((col: string, vals: unknown[]) => { inFilter = { col, vals }; return chain; }),
      single: vi.fn(() => {
        const row = rowsFor()[0] ?? null;
        return Promise.resolve({
          data: row,
          error: row ? null : { code: "PGRST116", message: "not found" },
        });
      }),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: rowsFor()[0] ?? null, error: null })
      ),
      insert: vi.fn((payload: Row | Row[]) => {
        (inserts[table] ??= []).push(...(Array.isArray(payload) ? payload : [payload]));
        return chain;
      }),
      update: vi.fn((payload: Row) => {
        (updates[table] ??= []).push(payload);
        return chain;
      }),
    };
    // Multi-row select: return the array; single()/maybeSingle() handled above.
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rowsFor(), error: null }).then(resolve);
    return chain;
  };
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn((table: string) => makeChain(table)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  return { inserts, updates };
}

beforeEach(() => vi.clearAllMocks());

// ─── generarSesiones ─────────────────────────────────────────────────────────

describe("sessionsRouter.generarSesiones", () => {
  /**
   * GROUP 6b FIX: was using Tuesday 2026-07-28 with dia_semana=1 (Monday) → 0
   * slots, so the "inserted" assertion was vacuous. Now uses Monday 2026-07-27
   * with dia_semana=1 → asserts actual inserted row with correct field values.
   */
  it("inserts sessions for matching weekdays in date range (Monday fixture)", async () => {
    const { inserts } = mockDb({
      programs: [{
        id: ID(1), slug: "cocina_2026", fecha_inicio: "2026-07-27", fecha_fin: "2026-07-27",
        config: { programacion: [{ dia_semana: 1, hora_inicio: "09:00", hora_fin: "11:00" }] },
      }],
      program_sessions: [],
    });
    await sessionsCaller.generarSesiones({ programId: ID(1) });
    // 2026-07-27 is a Monday (getUTCDay()=1), so exactly 1 session should be created
    expect((inserts["program_sessions"] ?? []).length).toBe(1);
    expect(inserts["program_sessions"]?.[0]).toMatchObject({
      program_id: ID(1),
      fecha: "2026-07-27",
      estado: "planificada",
      hora_inicio: "09:00",
      hora_fin: "11:00",
    });
  });

  /**
   * GROUP 1a: config.location_id must be stamped on every generated session.
   * Fails against the old code (which had no location_id in the insert).
   */
  it("stamps location_id from config.location_id on generated sessions", async () => {
    const LOC = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { inserts } = mockDb({
      programs: [{
        id: ID(1), slug: "cocina_2026", fecha_inicio: "2026-07-27", fecha_fin: "2026-07-27",
        config: {
          location_id: LOC,
          programacion: [{ dia_semana: 1, hora_inicio: "09:00", hora_fin: "11:00" }],
        },
      }],
      program_sessions: [],
    });
    await sessionsCaller.generarSesiones({ programId: ID(1) });
    expect((inserts["program_sessions"] ?? []).length).toBe(1);
    expect(inserts["program_sessions"]?.[0]).toMatchObject({ location_id: LOC });
  });

  /**
   * GROUP 6a FIX: was using Tuesday 2026-07-28 → 0 slots → dedup guard never
   * reached. Now uses Monday range (2026-07-27). First call creates 1 session;
   * second call (feeding that session back) creates 0 / skips 1.
   */
  it("is idempotent — second call does not create duplicate sessions", async () => {
    const existingSession = {
      id: ID(10), program_id: ID(1), fecha: "2026-07-27",
      estado: "planificada", session_data: null,
    };
    // First call: no existing sessions, should create 1
    const { inserts: firstInserts } = mockDb({
      programs: [{
        id: ID(1), slug: "cocina_2026", fecha_inicio: "2026-07-27", fecha_fin: "2026-07-27",
        config: { programacion: [{ dia_semana: 1, hora_inicio: "09:00", hora_fin: "11:00" }] },
      }],
      program_sessions: [],
    });
    const first = await sessionsCaller.generarSesiones({ programId: ID(1) });
    expect(first.created).toBe(1);
    expect(first.skipped).toBe(0);
    expect((firstInserts["program_sessions"] ?? []).length).toBe(1);

    // Second call: session already exists → dedup path exercised
    const { inserts: secondInserts } = mockDb({
      programs: [{
        id: ID(1), slug: "cocina_2026", fecha_inicio: "2026-07-27", fecha_fin: "2026-07-27",
        config: { programacion: [{ dia_semana: 1, hora_inicio: "09:00", hora_fin: "11:00" }] },
      }],
      program_sessions: [existingSession],
    });
    const second = await sessionsCaller.generarSesiones({ programId: ID(1) });
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);
    // The dedup guard was actually reached — no new inserts
    expect((secondInserts["program_sessions"] ?? []).length).toBe(0);
  });

  it("rejects programId for a missing program", async () => {
    mockDb({ programs: [], program_sessions: [] });
    const ABSENT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await expect(
      sessionsCaller.generarSesiones({ programId: ABSENT_ID })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("accepts explicit desde/hasta when program has no fecha_inicio/fecha_fin", async () => {
    const { inserts } = mockDb({
      programs: [{
        id: ID(1), slug: "cocina_2026", fecha_inicio: null, fecha_fin: null,
        config: { programacion: [{ dia_semana: 1, hora_inicio: "09:00", hora_fin: "11:00" }] },
      }],
      program_sessions: [],
    });
    await sessionsCaller.generarSesiones({
      programId: ID(1),
      desde: "2026-07-27",
      hasta: "2026-07-27",
    });
    expect((inserts["program_sessions"] ?? []).length).toBe(1);
    expect(inserts["program_sessions"]?.[0]).toMatchObject({
      program_id: ID(1),
      fecha: "2026-07-27",
      estado: "planificada",
      hora_inicio: "09:00",
      hora_fin: "11:00",
    });
  });

  it("returns BAD_REQUEST when no date range is available", async () => {
    mockDb({
      programs: [{ id: ID(1), slug: "s", fecha_inicio: null, fecha_fin: null, config: {} }],
      program_sessions: [],
    });
    await expect(
      sessionsCaller.generarSesiones({ programId: ID(1) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  /**
   * GROUP 7c: programacion field present but invalid → BAD_REQUEST.
   * The old code silently returned {created:0} on a parse failure.
   */
  it("throws BAD_REQUEST when programacion field is present but fails schema parse", async () => {
    mockDb({
      programs: [{
        id: ID(1), slug: "s", fecha_inicio: "2026-07-27", fecha_fin: "2026-07-27",
        // programacion is present but contains an invalid dia_semana (99 > 6)
        config: { programacion: [{ dia_semana: 99, hora_inicio: "09:00", hora_fin: "11:00" }] },
      }],
      program_sessions: [],
    });
    await expect(
      sessionsCaller.generarSesiones({ programId: ID(1) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns 0 created (no-op) when programacion is absent from config", async () => {
    const { inserts } = mockDb({
      programs: [{
        id: ID(1), slug: "s", fecha_inicio: "2026-07-27", fecha_fin: "2026-07-27",
        config: {}, // no programacion key at all → legitimate no-op
      }],
      program_sessions: [],
    });
    const result = await sessionsCaller.generarSesiones({ programId: ID(1) });
    expect(result.created).toBe(0);
    expect((inserts["program_sessions"] ?? []).length).toBe(0);
  });

  /**
   * RESIDUAL 2: config.location_id present but malformed (not a UUID) → BAD_REQUEST.
   * Old code silently stamped garbage on every generated session.
   * RED against current code (no UUID validation on config.location_id).
   */
  it("throws BAD_REQUEST when config.location_id is present but not a valid UUID (RESIDUAL 2)", async () => {
    mockDb({
      programs: [{
        id: ID(1), slug: "s", fecha_inicio: "2026-07-27", fecha_fin: "2026-07-27",
        config: {
          location_id: "not-a-uuid",
          programacion: [{ dia_semana: 1, hora_inicio: "09:00", hora_fin: "11:00" }],
        },
      }],
      program_sessions: [],
    });
    await expect(
      sessionsCaller.generarSesiones({ programId: ID(1) })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("location_id"),
    });
  });
});

// ─── abrirSesion ─────────────────────────────────────────────────────────────

describe("sessionsRouter.abrirSesion", () => {
  it("moves planificada → abierta (session pre-has location from generarSesiones)", async () => {
    const LOC = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { updates } = mockDb({
      programs: [{ id: ID(1), volunteer_can_access: true }],
      program_sessions: [{ id: ID(2), estado: "planificada", program_id: ID(1), location_id: LOC }],
    });
    await sessionsCaller.abrirSesion({ sessionId: ID(2) });
    expect(updates["program_sessions"]?.[0]).toMatchObject({ estado: "abierta", location_id: LOC });
  });

  /**
   * GROUP 1b: locationId input must be set on session.location_id.
   * Fails against the old code which ignored locationId.
   */
  it("stamps location_id when locationId is provided", async () => {
    const LOC = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { updates } = mockDb({
      programs: [{ id: ID(1), volunteer_can_access: true }],
      program_sessions: [{ id: ID(2), estado: "planificada", program_id: ID(1) }],
    });
    await sessionsCaller.abrirSesion({ sessionId: ID(2), locationId: LOC });
    expect(updates["program_sessions"]?.[0]).toMatchObject({
      estado: "abierta",
      location_id: LOC,
    });
  });

  /**
   * RESIDUAL 2: if none of input.locationId / session.location_id / config.location_id
   * resolves to a UUID, abrirSesion must BAD_REQUEST at OPEN time rather than silently
   * producing an abierta session with NULL location_id.
   * RED against current code (no location check in abrirSesion).
   */
  it("throws BAD_REQUEST when no location is resolvable (RESIDUAL 2)", async () => {
    mockDb({
      // program has no config.location_id, session has no location_id, no input
      programs: [{ id: ID(1), volunteer_can_access: true }],
      program_sessions: [{ id: ID(2), estado: "planificada", program_id: ID(1) }],
    });
    await expect(
      sessionsCaller.abrirSesion({ sessionId: ID(2) })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("ubicación"),
    });
  });

  /**
   * RESIDUAL 2: when input.locationId is not provided but session.location_id is
   * null, the resolver must fall back to program.config.location_id.
   * RED against current code (doesn't fetch config.location_id).
   */
  it("resolves location from program config when input and session have none (RESIDUAL 2)", async () => {
    const LOC = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const { updates } = mockDb({
      programs: [{ id: ID(1), volunteer_can_access: true, config: { location_id: LOC } }],
      program_sessions: [{ id: ID(2), estado: "planificada", program_id: ID(1), location_id: null }],
    });
    await sessionsCaller.abrirSesion({ sessionId: ID(2) });
    expect(updates["program_sessions"]?.[0]).toMatchObject({
      estado: "abierta",
      location_id: LOC,
    });
  });

  it("rejects opening an already-closed session", async () => {
    mockDb({
      programs: [{ id: ID(1), volunteer_can_access: true }],
      program_sessions: [{ id: ID(2), estado: "cerrada", program_id: ID(1) }],
    });
    await expect(
      sessionsCaller.abrirSesion({ sessionId: ID(2) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects opening a cancelled session", async () => {
    mockDb({
      programs: [{ id: ID(1), volunteer_can_access: true }],
      program_sessions: [{ id: ID(2), estado: "cancelada", program_id: ID(1) }],
    });
    await expect(
      sessionsCaller.abrirSesion({ sessionId: ID(2) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts optional responsable fields", async () => {
    const LOC = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { updates } = mockDb({
      programs: [{ id: ID(1), volunteer_can_access: true }],
      program_sessions: [{ id: ID(2), estado: "planificada", program_id: ID(1), location_id: LOC }],
    });
    await sessionsCaller.abrirSesion({
      sessionId: ID(2),
      responsable_nombre: "Ana García",
      responsable_person_id: ID(5),
    });
    expect(updates["program_sessions"]?.[0]).toMatchObject({
      estado: "abierta",
      responsable_nombre: "Ana García",
      responsable_person_id: ID(5),
    });
  });

  /**
   * RESIDUAL 1(d): coverage for abrirSesion volunteer_can_access guard.
   * assertProgramAccessForRole was already called — this adds explicit test coverage.
   */
  it("throws FORBIDDEN for voluntario on volunteer_can_access=false program (RESIDUAL 1d)", async () => {
    mockDb({
      programs: [{ id: ID(1), volunteer_can_access: false }],
      program_sessions: [{ id: ID(2), estado: "planificada", program_id: ID(1) }],
    });
    await expect(
      voluntarioCaller.abrirSesion({ sessionId: ID(2) })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows admin to open session on volunteer_can_access=false program (RESIDUAL 1d)", async () => {
    const LOC = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { updates } = mockDb({
      programs: [{ id: ID(1), volunteer_can_access: false }],
      program_sessions: [{ id: ID(2), estado: "planificada", program_id: ID(1), location_id: LOC }],
    });
    const result = await sessionsCaller.abrirSesion({ sessionId: ID(2) });
    expect(result.success).toBe(true);
    expect(updates["program_sessions"]?.[0]).toMatchObject({ estado: "abierta" });
  });
});

// ─── cerrarSesion ─────────────────────────────────────────────────────────────

describe("sessionsRouter.cerrarSesion", () => {
  const program = {
    id: ID(1),
    slug: "cocina_2026",
    volunteer_can_access: true,
    session_close_config: {
      enabled: true,
      fields: [{ slug: "raciones", label: "Raciones servidas", tipo: "numero", obligatorio: true }],
      uploads: [],
      tema_obligatorio: false,
    },
  };

  it("closes an open session with valid session_data", async () => {
    const { updates } = mockDb({
      programs: [program],
      program_sessions: [{ id: ID(2), estado: "abierta", program_id: ID(1) }],
      session_documents: [],
    });
    await sessionsCaller.cerrarSesion({
      sessionId: ID(2),
      session_data: { raciones: 150 },
    });
    expect(updates["program_sessions"]?.[0]).toMatchObject({
      estado: "cerrada",
      session_data: { raciones: 150 },
    });
    expect(updates["program_sessions"]?.[0]?.closed_at).toBeTruthy();
  });

  it("rejects when a required field is missing from session_data", async () => {
    mockDb({
      programs: [program],
      program_sessions: [{ id: ID(2), estado: "abierta", program_id: ID(1) }],
      session_documents: [],
    });
    await expect(
      sessionsCaller.cerrarSesion({ sessionId: ID(2), session_data: {} })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Raciones") });
  });

  /**
   * GROUP 7a: empty array must be treated as missing for obligatorio fields.
   * Old code only checked `=== undefined || null || ""`.
   */
  it("rejects when a required field contains an empty array (GROUP 7a)", async () => {
    const listProgram = {
      ...program,
      session_close_config: {
        enabled: true,
        fields: [{ slug: "voluntarios", label: "Voluntarios", tipo: "lista_voluntarios", obligatorio: true }],
        uploads: [],
        tema_obligatorio: false,
      },
    };
    mockDb({
      programs: [listProgram],
      program_sessions: [{ id: ID(2), estado: "abierta", program_id: ID(1) }],
      session_documents: [],
    });
    await expect(
      sessionsCaller.cerrarSesion({ sessionId: ID(2), session_data: { voluntarios: [] } })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Voluntarios") });
  });

  /**
   * GROUP 7a: whitespace-only string must be treated as missing for obligatorio.
   */
  it("rejects when a required text field is whitespace-only (GROUP 7a)", async () => {
    const textProgram = {
      ...program,
      session_close_config: {
        enabled: true,
        fields: [{ slug: "notas", label: "Notas", tipo: "texto", obligatorio: true }],
        uploads: [],
        tema_obligatorio: false,
      },
    };
    mockDb({
      programs: [textProgram],
      program_sessions: [{ id: ID(2), estado: "abierta", program_id: ID(1) }],
      session_documents: [],
    });
    await expect(
      sessionsCaller.cerrarSesion({ sessionId: ID(2), session_data: { notas: "   " } })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("Notas") });
  });

  it("rejects when tema is required but missing", async () => {
    const temaProgram = {
      ...program,
      session_close_config: { ...program.session_close_config, tema_obligatorio: true },
    };
    mockDb({
      programs: [temaProgram],
      program_sessions: [{ id: ID(2), estado: "abierta", program_id: ID(1) }],
      session_documents: [],
    });
    await expect(
      sessionsCaller.cerrarSesion({ sessionId: ID(2), session_data: { raciones: 100 } })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("tema") });
  });

  it("rejects when a required upload is missing", async () => {
    const uploadProgram = {
      ...program,
      session_close_config: {
        enabled: true,
        fields: [],
        uploads: [{ slug: "plan_clase", label: "Plan de la clase", obligatorio: true }],
        tema_obligatorio: false,
      },
    };
    mockDb({
      programs: [uploadProgram],
      program_sessions: [{ id: ID(2), estado: "abierta", program_id: ID(1) }],
      session_documents: [],
    });
    await expect(
      sessionsCaller.cerrarSesion({ sessionId: ID(2), session_data: {} })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Plan de la clase"),
    });
  });

  it("rejects closing a non-open session", async () => {
    mockDb({
      programs: [program],
      program_sessions: [{ id: ID(2), estado: "planificada", program_id: ID(1) }],
      session_documents: [],
    });
    await expect(
      sessionsCaller.cerrarSesion({ sessionId: ID(2), session_data: { raciones: 1 } })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  /**
   * RESIDUAL 1(d): coverage for cerrarSesion volunteer_can_access guard.
   * assertProgramAccessForRole was already called — this adds explicit test coverage.
   */
  it("throws FORBIDDEN for voluntario on volunteer_can_access=false program (RESIDUAL 1d)", async () => {
    mockDb({
      programs: [{ ...program, volunteer_can_access: false }],
      program_sessions: [{ id: ID(2), estado: "abierta", program_id: ID(1) }],
      session_documents: [],
    });
    await expect(
      voluntarioCaller.cerrarSesion({ sessionId: ID(2), session_data: { raciones: 100 } })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows admin to close session on volunteer_can_access=false program (RESIDUAL 1d)", async () => {
    const { updates } = mockDb({
      programs: [{ ...program, volunteer_can_access: false }],
      program_sessions: [{ id: ID(2), estado: "abierta", program_id: ID(1) }],
      session_documents: [],
    });
    await sessionsCaller.cerrarSesion({ sessionId: ID(2), session_data: { raciones: 100 } });
    expect(updates["program_sessions"]?.[0]).toMatchObject({ estado: "cerrada" });
  });
});

// ─── cancelarSesion ──────────────────────────────────────────────────────────

describe("sessionsRouter.cancelarSesion", () => {
  it("cancels with a valid motivo", async () => {
    const { updates } = mockDb({
      program_sessions: [{ id: ID(3), estado: "planificada", program_id: ID(1) }],
    });
    await sessionsCaller.cancelarSesion({ sessionId: ID(3), motivo: "Feriado nacional" });
    expect(updates["program_sessions"]?.[0]).toMatchObject({
      estado: "cancelada",
      motivo_cancelacion: "Feriado nacional",
    });
  });

  it("rejects empty motivo (BAD_REQUEST)", async () => {
    mockDb({ program_sessions: [{ id: ID(3), estado: "planificada", program_id: ID(1) }] });
    await expect(
      sessionsCaller.cancelarSesion({ sessionId: ID(3), motivo: "" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("motivo") });
  });

  it("rejects cancelling an already-closed session", async () => {
    mockDb({ program_sessions: [{ id: ID(3), estado: "cerrada", program_id: ID(1) }] });
    await expect(
      sessionsCaller.cancelarSesion({ sessionId: ID(3), motivo: "Tarde" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ─── reprogramarSesion ───────────────────────────────────────────────────────

describe("sessionsRouter.reprogramarSesion", () => {
  it("moves a planificada session to a new date", async () => {
    const { updates } = mockDb({
      program_sessions: [{ id: ID(4), estado: "planificada", program_id: ID(1) }],
    });
    await sessionsCaller.reprogramarSesion({ sessionId: ID(4), fecha: "2026-08-10" });
    expect(updates["program_sessions"]?.[0]).toMatchObject({ fecha: "2026-08-10" });
  });

  /**
   * GROUP 7d: rejects if a session already exists on the target fecha for the program.
   * Old code had no pre-existence check.
   */
  it("rejects reprogramming to a fecha that already has another session (GROUP 7d)", async () => {
    mockDb({
      program_sessions: [
        { id: ID(4), estado: "planificada", program_id: ID(1) },
        { id: ID(5), estado: "planificada", program_id: ID(1), fecha: "2026-08-10" },
      ],
    });
    await expect(
      sessionsCaller.reprogramarSesion({ sessionId: ID(4), fecha: "2026-08-10" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects reprogramming a cerrada session", async () => {
    mockDb({ program_sessions: [{ id: ID(4), estado: "cerrada", program_id: ID(1) }] });
    await expect(
      sessionsCaller.reprogramarSesion({ sessionId: ID(4), fecha: "2026-08-10" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("planificada") });
  });

  it("rejects reprogramming an abierta session", async () => {
    mockDb({ program_sessions: [{ id: ID(4), estado: "abierta", program_id: ID(1) }] });
    await expect(
      sessionsCaller.reprogramarSesion({ sessionId: ID(4), fecha: "2026-08-10" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ─── listSesiones — GROUP 3: volunteer_can_access guard ─────────────────────

describe("sessionsRouter.listSesiones — volunteer_can_access", () => {
  /**
   * GROUP 3: voluntario on a volunteer_can_access=false program → FORBIDDEN.
   * Admin on same program → ok.
   */
  it("throws FORBIDDEN for voluntario on volunteer_can_access=false program", async () => {
    mockDb({
      programs: [{ id: ID(1), slug: "restricted", volunteer_can_access: false }],
      program_sessions: [],
    });
    await expect(
      voluntarioCaller.listSesiones({ programId: ID(1) })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows admin on volunteer_can_access=false program", async () => {
    mockDb({
      programs: [{ id: ID(1), slug: "restricted", volunteer_can_access: false }],
      program_sessions: [],
    });
    // admin should NOT throw — returns empty array
    const result = await sessionsCaller.listSesiones({ programId: ID(1) });
    expect(Array.isArray(result)).toBe(true);
  });

  it("allows voluntario on volunteer_can_access=true program", async () => {
    mockDb({
      programs: [{ id: ID(1), slug: "open", volunteer_can_access: true }],
      program_sessions: [],
    });
    const result = await voluntarioCaller.listSesiones({ programId: ID(1) });
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── closeConfigRouter ───────────────────────────────────────────────────────

describe("closeConfigRouter.updateCloseConfig", () => {
  it("rejects an invalid config (unknown field tipo)", async () => {
    mockDb({ programs: [{ id: ID(1), slug: "test", session_close_config: null }] });
    await expect(
      closeConfigCaller.updateCloseConfig({
        programId: ID(1),
        config: {
          enabled: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          fields: [{ slug: "x", label: "X", tipo: "invalid_tipo" as any, obligatorio: true }],
          uploads: [],
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts a valid config and persists it", async () => {
    const { updates } = mockDb({
      programs: [{ id: ID(1), slug: "test", session_close_config: null }],
    });
    await closeConfigCaller.updateCloseConfig({
      programId: ID(1),
      config: {
        enabled: true,
        fields: [{ slug: "raciones", label: "Raciones", tipo: "numero", obligatorio: true }],
        uploads: [],
      },
    });
    expect(updates["programs"]?.[0]).toMatchObject({
      session_close_config: expect.objectContaining({ enabled: true }),
    });
  });
});

describe("closeConfigRouter.applyPreset", () => {
  it("applies the edicion preset (enabled, plan_clase upload, tema_obligatorio)", async () => {
    const { updates } = mockDb({
      programs: [{ id: ID(1), slug: "cocina_2026", tipo: "edicion", session_close_config: null }],
    });
    await closeConfigCaller.applyPreset({ programId: ID(1), tipo: "edicion" });
    expect(updates["programs"]?.[0]).toMatchObject({
      session_close_config: expect.objectContaining({
        enabled: true,
        tema_obligatorio: true,
      }),
    });
  });

  it("rejects unknown tipo", async () => {
    mockDb({ programs: [{ id: ID(1), slug: "test" }] });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      closeConfigCaller.applyPreset({ programId: ID(1), tipo: "unknown_tipo" as any })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ─── closeConfigRouter.getCloseConfig — volunteer_can_access guard ────────────

describe("closeConfigRouter.getCloseConfig — volunteer_can_access (RESIDUAL 1b)", () => {
  /**
   * RESIDUAL 1(b): getCloseConfig had NO assertProgramAccessForRole call.
   * A voluntario could read session_close_config for restricted programs.
   * RED against current code (no access guard in getCloseConfig).
   */
  it("throws FORBIDDEN for voluntario on volunteer_can_access=false program", async () => {
    mockDb({
      programs: [{
        id: ID(1), slug: "restricted", volunteer_can_access: false,
        session_close_config: { enabled: true, fields: [], uploads: [] },
      }],
    });
    const voluntarioCloseConfigCaller = t.createCallerFactory(closeConfigRouter)(buildCtx("voluntario"));
    await expect(
      voluntarioCloseConfigCaller.getCloseConfig({ programId: ID(1) })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows admin to read close config on volunteer_can_access=false program", async () => {
    mockDb({
      programs: [{
        id: ID(1), slug: "restricted", volunteer_can_access: false,
        session_close_config: { enabled: true, fields: [], uploads: [] },
      }],
    });
    const result = await closeConfigCaller.getCloseConfig({ programId: ID(1) });
    expect(result.enabled).toBe(true);
  });

  it("allows voluntario to read close config on volunteer_can_access=true program", async () => {
    mockDb({
      programs: [{
        id: ID(1), slug: "open", volunteer_can_access: true,
        session_close_config: null,
      }],
    });
    const voluntarioCloseConfigCaller = t.createCallerFactory(closeConfigRouter)(buildCtx("voluntario"));
    const result = await voluntarioCloseConfigCaller.getCloseConfig({ programId: ID(1) });
    expect(result.enabled).toBe(false); // default fallback
  });
});
