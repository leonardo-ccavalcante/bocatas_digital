/**
 * programs.compliance.test.ts — Contract tests for the compliance router.
 *
 * Covers:
 * - GROUP 4c: soft-deleted persons excluded from absence alerts
 * - GROUP 5:  attendance keyed on session_id (not checked_in_date vs session.fecha)
 *             → retroactive/late closes no longer produce false consecutive-absence alerts
 * - Basic metric counting (totalSesiones, planosSubidos, sesionesPendientes)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { initTRPC } from "@trpc/server";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { complianceRouter } from "../programs.compliance";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(),
}));

const t = initTRPC.context<TrpcContext>().create({
  transformer: { serialize: (v: unknown) => v, deserialize: (v: unknown) => v },
});

const adminCtx: TrpcContext = {
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

const complianceCaller = t.createCallerFactory(complianceRouter)(adminCtx);

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;

function mockDb(tables: Record<string, Row[]>) {
  const makeChain = (table: string) => {
    const filters: Record<string, unknown> = {};
    let inFilter: { col: string; vals: unknown[] } | null = null;
    const isNullCols: string[] = [];

    const rowsFor = () => {
      let rows = tables[table] ?? [];
      rows = rows.filter((r) =>
        Object.entries(filters).every(([k, v]) => !(k in r) || r[k] === v)
      );
      if (inFilter) {
        rows = rows.filter((r) => inFilter!.vals.includes(r[inFilter!.col]));
      }
      if (isNullCols.length) {
        rows = rows.filter((r) => isNullCols.every((col) => r[col] == null));
      }
      return rows;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: vi.fn(() => chain),
      order: vi.fn(() => chain),
      eq: vi.fn((col: string, val: unknown) => { filters[col] = val; return chain; }),
      in: vi.fn((col: string, vals: unknown[]) => { inFilter = { col, vals }; return chain; }),
      is: vi.fn((col: string, val: unknown) => { if (val === null) isNullCols.push(col); return chain; }),
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
    };
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: rowsFor(), error: null }).then(resolve);
    return chain;
  };
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn((table: string) => makeChain(table)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

beforeEach(() => vi.clearAllMocks());

// ─── GROUP 5: absence keyed on session_id ────────────────────────────────────

describe("detectAbsenceAlerts — GROUP 5: session_id keying", () => {
  /**
   * Key scenario: attendance was recorded with checked_in_date != session.fecha
   * (e.g., a late/retroactive close). The old code compared checked_in_date with
   * session.fecha → false absence. The new code compares session_id → correctly
   * marks the person as PRESENT.
   */
  it("counts attendance as PRESENT when checked_in_date differs from session.fecha (GROUP 5)", async () => {
    const SESSION_1 = ID(1);
    const SESSION_2 = ID(2);
    const PERSON_A = ID(10);
    const PROGRAM = ID(0);

    mockDb({
      program_sessions: [
        // Two cerrada sessions for program PROGRAM
        { id: SESSION_1, program_id: PROGRAM, estado: "cerrada", fecha: "2026-07-01", hora_fin: "11:00" },
        { id: SESSION_2, program_id: PROGRAM, estado: "cerrada", fecha: "2026-07-08", hora_fin: "11:00" },
      ],
      session_documents: [],
      program_enrollments: [
        {
          person_id: PERSON_A, program_id: PROGRAM, estado: "activo", deleted_at: null,
          // Embedded persons data (as PostgREST returns for the FK join)
          persons: { id: PERSON_A, nombre: "Ana", apellidos: "García", deleted_at: null },
        },
      ],
      attendances: [
        {
          // Attendance for SESSION_1 — but checked_in_date is the day AFTER session.fecha
          // Old code: "2026-07-02" !== "2026-07-01" → marked ABSENT (bug)
          // New code: session_id = SESSION_1 → marked PRESENT (fix)
          person_id: PERSON_A,
          session_id: SESSION_1,
          checked_in_date: "2026-07-02",
          deleted_at: null,
        },
      ],
    });

    const result = await complianceCaller.getComplianceEdicion({ programId: PROGRAM });

    // Ana attended session 1 (via session_id match), absent from session 2 only.
    // 1 consecutive absence < 2 → NO alert.
    expect(result.ausenciasAlerta).toHaveLength(0);
  });

  it("correctly triggers alert when person is absent from 2 consecutive sessions", async () => {
    const SESSION_1 = ID(1);
    const SESSION_2 = ID(2);
    const PERSON_A = ID(10);
    const PROGRAM = ID(0);

    mockDb({
      program_sessions: [
        { id: SESSION_1, program_id: PROGRAM, estado: "cerrada", fecha: "2026-07-01", hora_fin: "11:00" },
        { id: SESSION_2, program_id: PROGRAM, estado: "cerrada", fecha: "2026-07-08", hora_fin: "11:00" },
      ],
      session_documents: [],
      program_enrollments: [
        {
          person_id: PERSON_A, program_id: PROGRAM, estado: "activo", deleted_at: null,
          persons: { id: PERSON_A, nombre: "Ana", apellidos: "García", deleted_at: null },
        },
      ],
      attendances: [], // No attendances → 2 consecutive absences → alert
    });

    const result = await complianceCaller.getComplianceEdicion({ programId: PROGRAM });
    expect(result.ausenciasAlerta).toHaveLength(1);
    expect(result.ausenciasAlerta[0].personId).toBe(PERSON_A);
    expect(result.ausenciasAlerta[0].consecutiveAbsences).toBe(2);
  });
});

// ─── GROUP 4c: soft-deleted persons excluded ─────────────────────────────────

describe("detectAbsenceAlerts — GROUP 4c: soft-deleted persons", () => {
  /**
   * Soft-deleted persons must NOT appear in absence alerts.
   * Old code had no deleted_at check on the embedded persons join.
   */
  it("excludes soft-deleted persons from absence alerts (GROUP 4c)", async () => {
    const SESSION_1 = ID(1);
    const SESSION_2 = ID(2);
    const PERSON_ACTIVE = ID(10);
    const PERSON_DELETED = ID(11);
    const PROGRAM = ID(0);

    mockDb({
      program_sessions: [
        { id: SESSION_1, program_id: PROGRAM, estado: "cerrada", fecha: "2026-07-01", hora_fin: "11:00" },
        { id: SESSION_2, program_id: PROGRAM, estado: "cerrada", fecha: "2026-07-08", hora_fin: "11:00" },
      ],
      session_documents: [],
      program_enrollments: [
        {
          person_id: PERSON_ACTIVE, program_id: PROGRAM, estado: "activo", deleted_at: null,
          persons: { id: PERSON_ACTIVE, nombre: "Ana", apellidos: "García", deleted_at: null },
        },
        {
          person_id: PERSON_DELETED, program_id: PROGRAM, estado: "activo", deleted_at: null,
          // This person is soft-deleted (deleted_at is set)
          persons: { id: PERSON_DELETED, nombre: "Borja", apellidos: "Del", deleted_at: "2026-07-01T00:00:00Z" },
        },
      ],
      attendances: [], // Both absent from both sessions
    });

    const result = await complianceCaller.getComplianceEdicion({ programId: PROGRAM });

    // Only Ana (active) should appear in absence alerts; Borja (deleted) must not.
    const personIds = result.ausenciasAlerta.map((a) => a.personId);
    expect(personIds).toContain(PERSON_ACTIVE);
    expect(personIds).not.toContain(PERSON_DELETED);

    const borja = result.ausenciasAlerta.find((a) => a.nombre === "Borja");
    expect(borja).toBeUndefined();
  });

  it("person with null persons join (enrollment without person row) is skipped", async () => {
    const SESSION_1 = ID(1);
    const SESSION_2 = ID(2);
    const PROGRAM = ID(0);

    mockDb({
      program_sessions: [
        { id: SESSION_1, program_id: PROGRAM, estado: "cerrada", fecha: "2026-07-01", hora_fin: "11:00" },
        { id: SESSION_2, program_id: PROGRAM, estado: "cerrada", fecha: "2026-07-08", hora_fin: "11:00" },
      ],
      session_documents: [],
      program_enrollments: [
        {
          person_id: ID(99), program_id: PROGRAM, estado: "activo", deleted_at: null,
          persons: null, // join returned null (orphaned enrollment)
        },
      ],
      attendances: [],
    });

    const result = await complianceCaller.getComplianceEdicion({ programId: PROGRAM });
    // Orphaned enrollment with null persons should not throw and should be skipped
    expect(result.ausenciasAlerta).toHaveLength(0);
  });
});

// ─── RESIDUAL 3: generic check-in (NULL session_id) + legacy denominator ─────

describe("detectAbsenceAlerts — RESIDUAL 3: generic check-in + legacy denominator", () => {
  const PROGRAM = ID(0);
  const SESSION_1 = ID(1);
  const SESSION_2 = ID(2);
  const PERSON_A = ID(10);
  const LOC = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  /**
   * RESIDUAL 3(a): a generic check-in (session_id=NULL, same programa+day+location)
   * must count as PRESENT. Old code only matched by session_id, so generic kiosk
   * check-ins were invisible → false consecutive-absence alert.
   * RED against current code (no generic-checkin fallback).
   */
  it("generic check-in (NULL session_id, same programa+day+location) counts PRESENT (RESIDUAL 3a)", async () => {
    mockDb({
      program_sessions: [
        {
          id: SESSION_1, program_id: PROGRAM, estado: "cerrada",
          fecha: "2026-07-01", hora_fin: "11:00", location_id: LOC,
        },
        {
          id: SESSION_2, program_id: PROGRAM, estado: "cerrada",
          fecha: "2026-07-08", hora_fin: "11:00", location_id: LOC,
        },
      ],
      programs: [{ id: PROGRAM, slug: "cocina_2026" }],
      session_documents: [],
      program_enrollments: [
        {
          person_id: PERSON_A, program_id: PROGRAM, estado: "activo", deleted_at: null,
          persons: { id: PERSON_A, nombre: "Ana", apellidos: "García", deleted_at: null },
        },
      ],
      attendances: [
        {
          // Generic check-in: session_id=NULL (kiosk scan), but matches programa+date+location
          person_id: PERSON_A,
          session_id: null,
          programa: "cocina_2026",
          checked_in_date: "2026-07-01",
          location_id: LOC,
          deleted_at: null,
        },
        // No attendance for SESSION_2 → 1 consecutive absence < 2 → no alert
      ],
    });

    const result = await complianceCaller.getComplianceEdicion({ programId: PROGRAM });
    // Ana attended Session 1 via generic check-in → 1 consecutive absence (Session 2) < 2 → no alert
    expect(result.ausenciasAlerta).toHaveLength(0);
  });

  /**
   * RESIDUAL 3(b): legacy-style sessions (hora_fin=NULL, from families/sessions.ts closeSession)
   * must be EXCLUDED from the absence denominator. Including them inflates the denominator
   * with sessions that were never "planned" → false day-one alerts.
   * RED against current code (no hora_fin filter on cerrada denominator).
   */
  it("legacy session (hora_fin=NULL) excluded from absence denominator (RESIDUAL 3b)", async () => {
    const LEGACY_SESSION = ID(3);
    const PERSON_B = ID(11);
    mockDb({
      program_sessions: [
        {
          id: SESSION_1, program_id: PROGRAM, estado: "cerrada",
          fecha: "2026-07-01", hora_fin: "11:00", location_id: LOC,  // planned
        },
        {
          id: SESSION_2, program_id: PROGRAM, estado: "cerrada",
          fecha: "2026-07-08", hora_fin: "11:00", location_id: LOC,  // planned
        },
        {
          id: LEGACY_SESSION, program_id: PROGRAM, estado: "cerrada",
          fecha: "2026-07-01", hora_fin: null, location_id: null,      // legacy (no hora_fin)
        },
      ],
      programs: [{ id: PROGRAM, slug: "cocina_2026" }],
      session_documents: [],
      program_enrollments: [
        {
          person_id: PERSON_B, program_id: PROGRAM, estado: "activo", deleted_at: null,
          persons: { id: PERSON_B, nombre: "Bea", apellidos: "Santos", deleted_at: null },
        },
      ],
      attendances: [
        // Bea attended SESSION_1 (planned) — absent from SESSION_2 only → 1 absence
        { person_id: PERSON_B, session_id: SESSION_1, checked_in_date: "2026-07-01", deleted_at: null },
        // No attendance for LEGACY_SESSION or SESSION_2
      ],
    });

    const result = await complianceCaller.getComplianceEdicion({ programId: PROGRAM });
    // LEGACY_SESSION excluded from denominator → only [SESSION_1, SESSION_2] counted
    // Bea present at SESSION_1, absent at SESSION_2 → 1 consecutive absence < 2 → no alert
    expect(result.ausenciasAlerta).toHaveLength(0);
  });

  /**
   * Regression: the session_id-match + late-close PRESENT test must remain green.
   * This ensures RESIDUAL 3 fixes don't break GROUP 5.
   */
  it("session_id match still counts PRESENT even after RESIDUAL 3 changes (regression)", async () => {
    mockDb({
      program_sessions: [
        {
          id: SESSION_1, program_id: PROGRAM, estado: "cerrada",
          fecha: "2026-07-01", hora_fin: "11:00", location_id: LOC,
        },
        {
          id: SESSION_2, program_id: PROGRAM, estado: "cerrada",
          fecha: "2026-07-08", hora_fin: "11:00", location_id: LOC,
        },
      ],
      programs: [{ id: PROGRAM, slug: "cocina_2026" }],
      session_documents: [],
      program_enrollments: [
        {
          person_id: PERSON_A, program_id: PROGRAM, estado: "activo", deleted_at: null,
          persons: { id: PERSON_A, nombre: "Ana", apellidos: "García", deleted_at: null },
        },
      ],
      attendances: [
        {
          // Session_id match (late-close: checked_in_date differs from session.fecha)
          person_id: PERSON_A,
          session_id: SESSION_1,
          checked_in_date: "2026-07-02",  // different from session.fecha
          deleted_at: null,
        },
      ],
    });

    const result = await complianceCaller.getComplianceEdicion({ programId: PROGRAM });
    // Ana: present at SESSION_1 (by session_id), absent at SESSION_2 → 1 absence < 2 → no alert
    expect(result.ausenciasAlerta).toHaveLength(0);
  });
});

// ─── Basic compliance metrics ─────────────────────────────────────────────────

describe("complianceRouter.getComplianceEdicion — basic metrics", () => {
  it("returns correct totalSesiones (excludes cancelada)", async () => {
    const PROGRAM = ID(0);
    mockDb({
      program_sessions: [
        { id: ID(1), program_id: PROGRAM, estado: "cerrada", fecha: "2026-07-01", hora_fin: "11:00" },
        { id: ID(2), program_id: PROGRAM, estado: "planificada", fecha: "2099-07-01", hora_fin: "11:00" },
        { id: ID(3), program_id: PROGRAM, estado: "cancelada", fecha: "2026-07-15", hora_fin: "11:00" },
      ],
      session_documents: [],
      program_enrollments: [],
      attendances: [],
    });
    const result = await complianceCaller.getComplianceEdicion({ programId: PROGRAM });
    // cancelada excluded → 2 (cerrada + planificada)
    expect(result.totalSesiones).toBe(2);
    expect(result.sesionesCerradas).toBe(1);
  });

  it("counts planosSubidos only for sessions with documents", async () => {
    const PROGRAM = ID(0);
    mockDb({
      program_sessions: [
        { id: ID(1), program_id: PROGRAM, estado: "cerrada", fecha: "2026-07-01", hora_fin: "11:00" },
        { id: ID(2), program_id: PROGRAM, estado: "cerrada", fecha: "2026-07-08", hora_fin: "11:00" },
      ],
      session_documents: [
        { session_id: ID(1), tipo_slug: "plan_clase" }, // session 1 has a doc
        // session 2 has no doc
      ],
      program_enrollments: [],
      attendances: [],
    });
    const result = await complianceCaller.getComplianceEdicion({ programId: PROGRAM });
    expect(result.planosSubidos).toBe(1);
  });
});
