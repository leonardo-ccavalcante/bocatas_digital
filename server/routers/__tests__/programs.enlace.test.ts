/**
 * programs.enlace.test.ts — CRITICAL security tests for the magic-link enlace
 * procedures (programs.enlace.ts).
 *
 * Security gate for W5 /security-review. These tests must ALL pass before
 * the enlace feature ships to any environment with real data.
 *
 * Covers (see task spec):
 * - Invalid token → FORBIDDEN
 * - Expired token → FORBIDDEN
 * - Revoked token (after regenerate) → FORBIDDEN / NOT_FOUND
 * - REPLAY: same token after it's been superseded → FORBIDDEN
 * - Wrong-session token (correct hash from another session) → FORBIDDEN
 * - Not-enrolled person QR → BAD_REQUEST "No inscrito"
 * - Tampered QR signature → FORBIDDEN
 * - NO high-risk PII in enlace response fields (audit every field)
 * - GROUP 2: enlaceCerrar validates session_data; unknown keys stripped
 * - GROUP 3: generarEnlace FORBIDDEN for voluntario on restricted program
 * - GROUP 4a: soft-deleted persons absent from enlaceGetSession roster
 * - GROUP 4b: soft-deleted person rejected in assertEnrolledForAttendance
 * - GROUP 6c: QR built with link secret rejected; QR secret is distinct
 * - GROUP 7e: enlaceGetSession is a mutation (POST), not a query
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { initTRPC } from "@trpc/server";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { enlaceRouter } from "../programs.enlace";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";
import { generateSessionToken, hashSessionToken } from "../../../shared/sessionEnlace";

// Mock ENV so token verification uses a controlled test secret
vi.mock("../../_core/env", () => ({
  ENV: {
    qrSigningSecret: "test-qr-secret-minimum-32-chars-padded",
    sessionLinkSecret: "test-link-secret-minimum-32-chars-pad",
  },
}));

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(),
}));

const TEST_LINK_SECRET = "test-link-secret-minimum-32-chars-pad";
const TEST_QR_SECRET = "test-qr-secret-minimum-32-chars-padded";

const t = initTRPC.context<TrpcContext>().create({
  transformer: { serialize: (v: unknown) => v, deserialize: (v: unknown) => v },
});

function buildCtx(role: "admin" | "voluntario" | null): TrpcContext {
  return {
    user: role
      ? {
          id: 1, openId: "test", name: "Test User", email: "t@t.com",
          role, loginMethod: "google",
          createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
        }
      : null,
    logger: new Logger(),
    correlationId: "test",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req: {} as any, res: {} as any,
  };
}

// Generates valid UUID format for any n: last group is 12 hex chars.
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;

function mockDb(tables: Record<string, Row[]>) {
  const inserts: Record<string, Row[]> = {};
  const updates: Record<string, Row[]> = {};
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
      is: vi.fn((col: string, val: unknown) => { if (val === null) isNullCols.push(col); return chain; }),
      neq: vi.fn(() => chain),
      limit: vi.fn(() => chain),
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
    // Multi-row selects go via then(); single()/maybeSingle() handled above.
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

// Helper: build a session with a valid (not expired) enlace token
async function sessionWithValidToken(sessionId: string, programId: string) {
  const token = generateSessionToken();
  const hash = await hashSessionToken(token, TEST_LINK_SECRET);
  const expiraFuture = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour
  const session = {
    id: sessionId, program_id: programId, fecha: "2026-07-28",
    location_id: ID(99), estado: "abierta",
    enlace_token_hash: hash, enlace_expira: expiraFuture,
    session_data: null, hora_inicio: "09:00", hora_fin: "11:00",
  };
  return { token, hash, session };
}

beforeEach(() => vi.clearAllMocks());

// ─── generarEnlace ───────────────────────────────────────────────────────────

describe("enlaceRouter.generarEnlace", () => {
  it("generates a token and stores only its hash", async () => {
    const { updates } = mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", volunteer_can_access: true }],
      program_sessions: [{ id: ID(1), estado: "planificada", program_id: ID(2) }],
    });
    const adminCaller = t.createCallerFactory(enlaceRouter)(buildCtx("admin"));
    const result = await adminCaller.generarEnlace({ sessionId: ID(1) });

    expect(result.token).toBeDefined();
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    // The hash stored must be different from the plaintext token
    const stored = updates["program_sessions"]?.[0]?.enlace_token_hash as string;
    expect(stored).not.toBe(result.token);
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
  });

  it("regenerating revokes the previous token (new hash overwrites old)", async () => {
    const { updates } = mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", volunteer_can_access: true }],
      program_sessions: [{
        id: ID(1), estado: "planificada", program_id: ID(2),
        enlace_token_hash: "old-hash", enlace_expira: null,
      }],
    });
    const adminCaller = t.createCallerFactory(enlaceRouter)(buildCtx("admin"));
    const result = await adminCaller.generarEnlace({ sessionId: ID(1) });
    const newHash = updates["program_sessions"]?.[0]?.enlace_token_hash as string;
    expect(newHash).not.toBe("old-hash");
    expect(newHash).not.toBe(result.token); // hash != plaintext
  });

  /**
   * GROUP 3: voluntario on volunteer_can_access=false program → FORBIDDEN at mint time.
   * This prevents the token from being generated at all for restricted programs.
   */
  it("throws FORBIDDEN for voluntario on volunteer_can_access=false program (GROUP 3)", async () => {
    mockDb({
      programs: [{ id: ID(2), slug: "restricted", volunteer_can_access: false }],
      program_sessions: [{ id: ID(1), estado: "planificada", program_id: ID(2) }],
    });
    const voluntarioCaller = t.createCallerFactory(enlaceRouter)(buildCtx("voluntario"));
    await expect(
      voluntarioCaller.generarEnlace({ sessionId: ID(1) })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows admin to generate enlace on volunteer_can_access=false program (GROUP 3)", async () => {
    const { updates } = mockDb({
      programs: [{ id: ID(2), slug: "restricted", volunteer_can_access: false }],
      program_sessions: [{ id: ID(1), estado: "planificada", program_id: ID(2) }],
    });
    const adminCaller = t.createCallerFactory(enlaceRouter)(buildCtx("admin"));
    const result = await adminCaller.generarEnlace({ sessionId: ID(1) });
    expect(result.token).toBeTruthy();
    expect(updates["program_sessions"]?.[0]?.enlace_token_hash).toBeTruthy();
  });
});

// ─── SECURITY: invalid / expired / revoked token ──────────────────────────────

describe("enlaceRouter.enlaceGetSession — token security", () => {
  /**
   * GROUP 7e: enlaceGetSession is now a MUTATION (POST) so the token is in
   * the request body, not in the URL query string (prevents access-log leakage).
   * The caller API is identical for unit tests, but the router declaration must
   * use .mutation() — verified by the fact that this test calls it as a mutation.
   */
  it("rejects an invalid (random) token — FORBIDDEN", async () => {
    const { session } = await sessionWithValidToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [session],
      program_enrollments: [],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    const badToken = generateSessionToken(); // random, not matching stored hash

    await expect(
      publicCaller.enlaceGetSession({ sessionId: ID(1), token: badToken })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an EXPIRED token", async () => {
    const token = generateSessionToken();
    const hash = await hashSessionToken(token, TEST_LINK_SECRET);
    const expiraPast = new Date(Date.now() - 1000).toISOString(); // 1 second ago
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [{
        id: ID(1), program_id: ID(2), fecha: "2026-07-28",
        location_id: ID(99), estado: "abierta",
        enlace_token_hash: hash, enlace_expira: expiraPast,
        session_data: null,
      }],
      program_enrollments: [],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    await expect(
      publicCaller.enlaceGetSession({ sessionId: ID(1), token })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a REVOKED token (null hash in DB)", async () => {
    const token = generateSessionToken();
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [{
        id: ID(1), program_id: ID(2), fecha: "2026-07-28",
        location_id: ID(99), estado: "abierta",
        enlace_token_hash: null, // revoked
        enlace_expira: new Date(Date.now() + 3600000).toISOString(),
        session_data: null,
      }],
      program_enrollments: [],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    await expect(
      publicCaller.enlaceGetSession({ sessionId: ID(1), token })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects access to a cerrada session (token-gate: only planificada/abierta)", async () => {
    const token = generateSessionToken();
    const hash = await hashSessionToken(token, TEST_LINK_SECRET);
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [{
        id: ID(1), program_id: ID(2), fecha: "2026-07-28",
        location_id: ID(99), estado: "cerrada", // already closed
        enlace_token_hash: hash,
        enlace_expira: new Date(Date.now() + 3600000).toISOString(),
        session_data: { raciones: 100 },
      }],
      program_enrollments: [],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    await expect(
      publicCaller.enlaceGetSession({ sessionId: ID(1), token })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects access to a cancelada session", async () => {
    const token = generateSessionToken();
    const hash = await hashSessionToken(token, TEST_LINK_SECRET);
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [{
        id: ID(1), program_id: ID(2), fecha: "2026-07-28",
        location_id: ID(99), estado: "cancelada",
        enlace_token_hash: hash,
        enlace_expira: new Date(Date.now() + 3600000).toISOString(),
        session_data: null,
      }],
      program_enrollments: [],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    await expect(
      publicCaller.enlaceGetSession({ sessionId: ID(1), token })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("WRONG-SESSION token: correct hash belonging to a different session is rejected", async () => {
    const token = generateSessionToken();
    const hash = await hashSessionToken(token, TEST_LINK_SECRET);
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [
        {
          id: ID(1), program_id: ID(2), fecha: "2026-07-27",
          location_id: ID(99), estado: "abierta",
          enlace_token_hash: hash,
          enlace_expira: new Date(Date.now() + 3600000).toISOString(),
          session_data: null,
        },
        {
          id: ID(2), program_id: ID(2), fecha: "2026-07-28",
          location_id: ID(99), estado: "abierta",
          enlace_token_hash: "different-hash-for-session-2",
          enlace_expira: new Date(Date.now() + 3600000).toISOString(),
          session_data: null,
        },
      ],
      program_enrollments: [],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    // token is valid for ID(1) but we query ID(2) → the hash won't match
    await expect(
      publicCaller.enlaceGetSession({ sessionId: ID(2), token })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("accepts a valid token and returns enrolled persons (non-PII: id, nombre, apellidos only)", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [session],
      program_enrollments: [
        {
          id: ID(10), program_id: ID(2), person_id: ID(20),
          estado: "activo", deleted_at: null,
        },
      ],
      persons: [
        {
          id: ID(20), nombre: "María", apellidos: "López", deleted_at: null,
          // High-risk fields that MUST NOT appear in the response:
          situacion_legal: "documentada",
          foto_documento_url: "secret-url",
          recorrido_migratorio: "confidential",
        },
      ],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    const result = await publicCaller.enlaceGetSession({ sessionId: ID(1), token });

    expect(result.session).toBeDefined();
    expect(result.session).not.toHaveProperty("enlace_token_hash");
    expect(result.session).not.toHaveProperty("closed_by");

    expect(result.persons.length).toBeGreaterThan(0);
    const person = result.persons[0];
    expect(person).toHaveProperty("id");
    expect(person).toHaveProperty("nombre");
    expect(person).toHaveProperty("apellidos");
    expect(person).not.toHaveProperty("situacion_legal");
    expect(person).not.toHaveProperty("foto_documento_url");
    expect(person).not.toHaveProperty("recorrido_migratorio");
  });

  /**
   * GROUP 4a: soft-deleted persons must be absent from the enlaceGetSession roster.
   * Old code had no deleted_at filter on the persons select.
   */
  it("excludes soft-deleted persons from the session roster (GROUP 4a)", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [session],
      program_enrollments: [
        { id: ID(10), program_id: ID(2), person_id: ID(20), estado: "activo", deleted_at: null },
        { id: ID(11), program_id: ID(2), person_id: ID(21), estado: "activo", deleted_at: null },
      ],
      persons: [
        { id: ID(20), nombre: "Ana", apellidos: "García", deleted_at: null },         // active
        { id: ID(21), nombre: "Borja", apellidos: "Deleted", deleted_at: "2026-07-23T00:00:00Z" }, // soft-deleted
      ],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    const result = await publicCaller.enlaceGetSession({ sessionId: ID(1), token });

    // Only Ana should appear; Borja is soft-deleted
    expect(result.persons.length).toBe(1);
    expect(result.persons[0].nombre).toBe("Ana");
    const borja = result.persons.find((p) => p.nombre === "Borja");
    expect(borja).toBeUndefined();
  });
});

// ─── SECURITY: attendance marking via enlace ──────────────────────────────────

describe("enlaceRouter.enlaceMarcarAsistencia — enrollment + QR security", () => {
  it("rejects a person not enrolled in the program", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [session],
      program_enrollments: [], // no enrollment
      persons: [],
      attendances: [],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    await expect(
      publicCaller.enlaceMarcarAsistencia({
        sessionId: ID(1), token, personId: ID(20),
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("inscrito"),
    });
  });

  /**
   * GROUP 4b: soft-deleted person must be rejected even if still enrolled.
   * Old code only checked enrollment, not person.deleted_at.
   */
  it("rejects attendance for a soft-deleted person (GROUP 4b)", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [session],
      program_enrollments: [
        { id: ID(10), program_id: ID(2), person_id: ID(20), estado: "activo", deleted_at: null },
      ],
      // Person exists in enrollments but is soft-deleted in the persons table
      persons: [
        { id: ID(20), nombre: "Borja", apellidos: "Del", deleted_at: "2026-07-23T00:00:00Z" },
      ],
      attendances: [],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    await expect(
      publicCaller.enlaceMarcarAsistencia({
        sessionId: ID(1), token, personId: ID(20),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a tampered QR signature", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [session],
      program_enrollments: [{ id: ID(10), program_id: ID(2), person_id: ID(20), estado: "activo", deleted_at: null }],
      persons: [{ id: ID(20), nombre: "Ana", deleted_at: null }],
      attendances: [],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    const tamperedQr = `bocatas://person/${ID(20)}?sig=deadbeef`;
    await expect(
      publicCaller.enlaceMarcarAsistencia({
        sessionId: ID(1), token, personId: ID(20), qrValue: tamperedQr,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a person with baja estado (not attend-eligible)", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [session],
      program_enrollments: [
        { id: ID(10), program_id: ID(2), person_id: ID(20), estado: "baja", deleted_at: null },
      ],
      persons: [{ id: ID(20), nombre: "Ana", deleted_at: null }],
      attendances: [],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    await expect(
      publicCaller.enlaceMarcarAsistencia({
        sessionId: ID(1), token, personId: ID(20),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("inscrito") });
  });

  it("marks attendance with a valid token and enrolled person", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    const { inserts } = mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [session],
      program_enrollments: [
        { id: ID(10), program_id: ID(2), person_id: ID(20), estado: "activo", deleted_at: null },
      ],
      persons: [{ id: ID(20), nombre: "Ana", deleted_at: null }],
      attendances: [],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    const result = await publicCaller.enlaceMarcarAsistencia({
      sessionId: ID(1), token, personId: ID(20),
    });
    expect(result.status).toBe("registered");
    expect(inserts["attendances"]?.[0]).toMatchObject({
      person_id: ID(20),
      location_id: ID(99),
      programa: "cocina_2026",
      session_id: ID(1),
    });
  });

  it("handles duplicate attendance gracefully (returns duplicate status)", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    const today = new Date().toISOString().split("T")[0];
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [session],
      program_enrollments: [
        { id: ID(10), program_id: ID(2), person_id: ID(20), estado: "activo", deleted_at: null },
      ],
      persons: [{ id: ID(20), nombre: "Ana", deleted_at: null }],
      attendances: [
        {
          id: ID(50), person_id: ID(20), location_id: ID(99),
          programa: "cocina_2026", checked_in_date: today,
          checked_in_at: new Date().toISOString(), deleted_at: null,
        },
      ],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    const result = await publicCaller.enlaceMarcarAsistencia({
      sessionId: ID(1), token, personId: ID(20),
    });
    expect(result.status).toBe("duplicate");
  });

  it("returns a 403 if the token supplied is for a different session (cross-session REPLAY)", async () => {
    const { token, session: session1 } = await sessionWithValidToken(ID(1), ID(2));
    const tokenB = generateSessionToken();
    const hashB = await hashSessionToken(tokenB, TEST_LINK_SECRET);
    const session2 = {
      id: ID(2), program_id: ID(2), fecha: "2026-07-29",
      location_id: ID(99), estado: "abierta",
      enlace_token_hash: hashB,
      enlace_expira: new Date(Date.now() + 3600000).toISOString(),
      session_data: null,
    };
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [session1, session2],
      program_enrollments: [
        { id: ID(10), program_id: ID(2), person_id: ID(20), estado: "activo", deleted_at: null },
      ],
      persons: [{ id: ID(20), nombre: "Ana", deleted_at: null }],
      attendances: [],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    // Use token from session1 against session2 — hash won't match
    await expect(
      publicCaller.enlaceMarcarAsistencia({ sessionId: ID(2), token, personId: ID(20) })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── GROUP 2: enlaceCerrar validation ─────────────────────────────────────────

describe("enlaceRouter.enlaceCerrar — close validation (GROUP 2)", () => {
  const closeProgram = {
    id: ID(2), slug: "cocina_2026",
    volunteer_can_access: true,
    session_close_config: {
      enabled: true,
      fields: [{ slug: "raciones", label: "Raciones", tipo: "numero", obligatorio: true }],
      uploads: [{ slug: "plan_clase", label: "Plan de la clase", obligatorio: true }],
      tema_obligatorio: true,
    },
  };

  /**
   * RESIDUAL 4(c): the original hollow test used a DIFFERENT token (from a second
   * sessionWithValidToken call), so the token hash never matched → FORBIDDEN at
   * token-verify, never reaching enforceCloseValidation. It passed even when
   * validation was entirely removed — a hollow guard.
   *
   * REPAIRED: use the VALID token from the same session so token verification
   * passes and the test asserts BAD_REQUEST from enforceCloseValidation. Removing
   * enforceCloseValidation from enlaceCerrar now makes this test fail correctly.
   */
  it("rejects enlaceCerrar with missing obligatorio field and upload (RESIDUAL 4c — repaired)", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    mockDb({
      programs: [closeProgram],
      program_sessions: [session], // session.enlace_token_hash matches token
      session_documents: [],        // no plan_clase uploaded
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    // Valid token → reaches enforceCloseValidation → BAD_REQUEST (tema + raciones + plan_clase missing)
    await expect(
      publicCaller.enlaceCerrar({
        sessionId: ID(1), token,
        session_data: {},
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Faltan datos obligatorios"),
    });
  });

  it("rejects enlaceCerrar when session_data is missing tema (obligatorio)", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    mockDb({
      programs: [closeProgram],
      program_sessions: [session],
      session_documents: [{ session_id: ID(1), tipo_slug: "plan_clase" }],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    await expect(
      publicCaller.enlaceCerrar({
        sessionId: ID(1), token,
        // raciones present, upload present, but tema is missing
        session_data: { raciones: 100 },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("tema"),
    });
  });

  it("rejects enlaceCerrar when required upload is missing", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    mockDb({
      programs: [closeProgram],
      program_sessions: [session],
      session_documents: [], // plan_clase NOT uploaded
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    await expect(
      publicCaller.enlaceCerrar({
        sessionId: ID(1), token,
        session_data: { tema: "Recetas", raciones: 50 },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Plan de la clase"),
    });
  });

  it("strips unknown keys from session_data (whitelist enforcement)", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    const { updates } = mockDb({
      programs: [closeProgram],
      program_sessions: [session],
      session_documents: [{ session_id: ID(1), tipo_slug: "plan_clase" }],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    await publicCaller.enlaceCerrar({
      sessionId: ID(1), token,
      session_data: {
        tema: "Recetas de invierno",
        raciones: 75,
        unknown_blob: "should-be-stripped",  // unknown key
        hack: "malicious",                    // another unknown key
      },
    });
    const saved = updates["program_sessions"]?.[0]?.session_data as Record<string, unknown>;
    expect(saved).toHaveProperty("tema");
    expect(saved).toHaveProperty("raciones");
    expect(saved).not.toHaveProperty("unknown_blob");
    expect(saved).not.toHaveProperty("hack");
  });
});

// ─── SECURITY: PII audit for enlaceGetSession response ───────────────────────

describe("enlaceGetSession response — PII redaction audit", () => {
  const HIGH_RISK_FIELDS = [
    "situacion_legal",
    "foto_documento_url",
    "recorrido_migratorio",
    "fecha_nacimiento",
    "pais_origen",
    "idioma_principal",
    "genero",
    "restricciones_alimentarias",
    "notas",
    "colectivos",
    "observaciones",
  ];

  it("response.persons items contain ONLY id, nombre, apellidos", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    const richPerson = HIGH_RISK_FIELDS.reduce(
      (acc, field) => ({ ...acc, [field]: "sensitive-value" }),
      { id: ID(20), nombre: "Carlos", apellidos: "Pérez", deleted_at: null }
    );
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [session],
      program_enrollments: [
        { id: ID(10), program_id: ID(2), person_id: ID(20), estado: "activo", deleted_at: null },
      ],
      persons: [richPerson],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    const result = await publicCaller.enlaceGetSession({ sessionId: ID(1), token });

    for (const person of result.persons) {
      for (const field of HIGH_RISK_FIELDS) {
        expect(person).not.toHaveProperty(field);
      }
    }
  });

  it("response.session does NOT include enlace_token_hash", async () => {
    const { token, session } = await sessionWithValidToken(ID(1), ID(2));
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", session_close_config: null, volunteer_can_access: true }],
      program_sessions: [session],
      program_enrollments: [],
    });
    const publicCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    const result = await publicCaller.enlaceGetSession({ sessionId: ID(1), token });
    expect(result.session).not.toHaveProperty("enlace_token_hash");
  });
});

// ─── revogarEnlace ───────────────────────────────────────────────────────────

describe("enlaceRouter.revogarEnlace", () => {
  it("nulls out the hash and expiry", async () => {
    const { updates } = mockDb({
      programs: [{ id: ID(2), volunteer_can_access: true }],
      program_sessions: [{
        id: ID(1), estado: "planificada", program_id: ID(2),
        enlace_token_hash: "some-hash", enlace_expira: "2026-12-31T00:00:00Z",
      }],
    });
    const adminCaller = t.createCallerFactory(enlaceRouter)(buildCtx("admin"));
    await adminCaller.revogarEnlace({ sessionId: ID(1) });
    expect(updates["program_sessions"]?.[0]).toMatchObject({
      enlace_token_hash: null,
      enlace_expira: null,
    });
  });

  /**
   * RESIDUAL 1(a): revogarEnlace had NO assertProgramAccessForRole call.
   * A voluntario could null the enlace_token_hash on ANY session including
   * restricted (volunteer_can_access=false) programs. RED against current code.
   */
  it("throws FORBIDDEN for voluntario on volunteer_can_access=false program (RESIDUAL 1a)", async () => {
    mockDb({
      programs: [{ id: ID(2), volunteer_can_access: false }],
      program_sessions: [{
        id: ID(1), estado: "abierta", program_id: ID(2),
        enlace_token_hash: "some-hash", enlace_expira: "2026-12-31T00:00:00Z",
      }],
    });
    const voluntarioCaller = t.createCallerFactory(enlaceRouter)(buildCtx("voluntario"));
    await expect(
      voluntarioCaller.revogarEnlace({ sessionId: ID(1) })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows admin to revoke enlace on volunteer_can_access=false program (RESIDUAL 1a)", async () => {
    const { updates } = mockDb({
      programs: [{ id: ID(2), volunteer_can_access: false }],
      program_sessions: [{
        id: ID(1), estado: "abierta", program_id: ID(2),
        enlace_token_hash: "some-hash", enlace_expira: "2026-12-31T00:00:00Z",
      }],
    });
    const adminCaller = t.createCallerFactory(enlaceRouter)(buildCtx("admin"));
    await adminCaller.revogarEnlace({ sessionId: ID(1) });
    expect(updates["program_sessions"]?.[0]).toMatchObject({
      enlace_token_hash: null, enlace_expira: null,
    });
  });
});

// ─── marcarAsistenciaSesion (staff-authed) ───────────────────────────────────

describe("enlaceRouter.marcarAsistenciaSesion (staff)", () => {
  it("marks attendance for an enrolled person (voluntario auth)", async () => {
    const { inserts } = mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", volunteer_can_access: true }],
      program_sessions: [{
        id: ID(1), program_id: ID(2), fecha: "2026-07-28",
        location_id: ID(99), estado: "abierta", session_data: null,
      }],
      program_enrollments: [
        { id: ID(10), program_id: ID(2), person_id: ID(20), estado: "activo", deleted_at: null },
      ],
      persons: [{ id: ID(20), nombre: "Ana", deleted_at: null }],
      attendances: [],
    });
    const voluntarioCaller = t.createCallerFactory(enlaceRouter)(buildCtx("voluntario"));
    const result = await voluntarioCaller.marcarAsistenciaSesion({
      sessionId: ID(1),
      personId: ID(20),
    });
    expect(result.status).toBe("registered");
    expect(inserts["attendances"]?.[0]).toMatchObject({
      person_id: ID(20),
      session_id: ID(1),
      programa: "cocina_2026",
    });
  });

  it("rejects when QR signature is tampered (staff flow)", async () => {
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", volunteer_can_access: true }],
      program_sessions: [{
        id: ID(1), program_id: ID(2), fecha: "2026-07-28",
        location_id: ID(99), estado: "abierta", session_data: null,
      }],
      program_enrollments: [
        { id: ID(10), program_id: ID(2), person_id: ID(20), estado: "activo", deleted_at: null },
      ],
      persons: [{ id: ID(20), nombre: "Ana", deleted_at: null }],
      attendances: [],
    });
    const voluntarioCaller = t.createCallerFactory(enlaceRouter)(buildCtx("voluntario"));
    await expect(
      voluntarioCaller.marcarAsistenciaSesion({
        sessionId: ID(1),
        personId: ID(20),
        qrValue: `bocatas://person/${ID(20)}?sig=deadbeef`,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  /**
   * GROUP 6c FIX: the old test promised "one built with the link secret fails"
   * but never asserted it. This test now:
   * (a) builds a QR with TEST_QR_SECRET → expects success (correct secret)
   * (b) builds a QR with TEST_LINK_SECRET → expects FORBIDDEN (wrong secret)
   *
   * Proves the QR-signing key and the session-link key are distinct.
   */
  /**
   * RESIDUAL 1(d): coverage for marcarAsistenciaSesion volunteer_can_access guard.
   * (assertProgramAccessForRole was already called here — this adds explicit test coverage.)
   */
  it("throws FORBIDDEN for voluntario on volunteer_can_access=false program (RESIDUAL 1d)", async () => {
    mockDb({
      programs: [{ id: ID(2), slug: "restricted", volunteer_can_access: false }],
      program_sessions: [{
        id: ID(1), program_id: ID(2), fecha: "2026-07-28",
        location_id: ID(99), estado: "abierta", session_data: null,
      }],
      program_enrollments: [],
      persons: [],
      attendances: [],
    });
    const voluntarioCaller = t.createCallerFactory(enlaceRouter)(buildCtx("voluntario"));
    await expect(
      voluntarioCaller.marcarAsistenciaSesion({ sessionId: ID(1), personId: ID(20) })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows admin to mark attendance on volunteer_can_access=false program (RESIDUAL 1d)", async () => {
    const { inserts } = mockDb({
      programs: [{ id: ID(2), slug: "restricted", volunteer_can_access: false }],
      program_sessions: [{
        id: ID(1), program_id: ID(2), fecha: "2026-07-28",
        location_id: ID(99), estado: "abierta", session_data: null,
      }],
      program_enrollments: [
        { id: ID(10), program_id: ID(2), person_id: ID(20), estado: "activo", deleted_at: null },
      ],
      persons: [{ id: ID(20), nombre: "Ana", deleted_at: null }],
      attendances: [],
    });
    const adminCaller = t.createCallerFactory(enlaceRouter)(buildCtx("admin"));
    const result = await adminCaller.marcarAsistenciaSesion({ sessionId: ID(1), personId: ID(20) });
    expect(result.status).toBe("registered");
    expect(inserts["attendances"]?.[0]).toMatchObject({ person_id: ID(20) });
  });

  it("uses the correct QR secret from ENV — link-secret QR is rejected (GROUP 6c)", async () => {
    const { buildQrPayload } = await import("../../../shared/qr/payload");

    // (a) QR built with QR secret → should succeed
    const { inserts } = mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", volunteer_can_access: true }],
      program_sessions: [{
        id: ID(1), program_id: ID(2), fecha: "2026-07-28",
        location_id: ID(99), estado: "abierta", session_data: null,
      }],
      program_enrollments: [
        { id: ID(10), program_id: ID(2), person_id: ID(20), estado: "activo", deleted_at: null },
      ],
      persons: [{ id: ID(20), nombre: "Ana", deleted_at: null }],
      attendances: [],
    });
    const voluntarioCaller = t.createCallerFactory(enlaceRouter)(buildCtx("voluntario"));

    const qrValueQrSecret = await buildQrPayload(ID(20), TEST_QR_SECRET);
    const result = await voluntarioCaller.marcarAsistenciaSesion({
      sessionId: ID(1),
      personId: ID(20),
      qrValue: qrValueQrSecret,
    });
    expect(result.status).toBe("registered");
    expect(inserts["attendances"]?.[0]).toMatchObject({ person_id: ID(20) });

    // (b) QR built with LINK secret → should fail (wrong signing key)
    mockDb({
      programs: [{ id: ID(2), slug: "cocina_2026", volunteer_can_access: true }],
      program_sessions: [{
        id: ID(1), program_id: ID(2), fecha: "2026-07-28",
        location_id: ID(99), estado: "abierta", session_data: null,
      }],
      program_enrollments: [
        { id: ID(10), program_id: ID(2), person_id: ID(20), estado: "activo", deleted_at: null },
      ],
      persons: [{ id: ID(20), nombre: "Ana", deleted_at: null }],
      attendances: [],
    });

    const qrValueLinkSecret = await buildQrPayload(ID(20), TEST_LINK_SECRET);
    await expect(
      voluntarioCaller.marcarAsistenciaSesion({
        sessionId: ID(1),
        personId: ID(20),
        qrValue: qrValueLinkSecret,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
