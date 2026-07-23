/**
 * cierre-sesion.scenario.test.ts — End-to-end scenario for the «cierre de sesión»
 * professor flow (Wave 4 gate).
 *
 * WHY tRPC-level (not Playwright/browser):
 *   The magic-link attendance flow requires QR camera scanning, which cannot be
 *   automated reliably in a headless browser. createCaller tests exercise the REAL
 *   procedures end-to-end and run reliably in CI without hardware or camera emulation.
 *
 * Mock style mirrors programs.enlace.test.ts + programs.sessions.test.ts:
 *   - vi.mock createAdminClient (mocked-DB chain style)
 *   - vi.mock ENV (controlled secrets for QR + link)
 *   - Storage mock from programs.sessionDocuments.test.ts (step 6)
 *
 * SCENARIO (one it(), sequential steps, each with inline assertions):
 *   Step 1  Admin generates calendar sessions   generarSesiones
 *   Step 2  Admin opens the session             abrirSesion
 *   Step 3  Staff mints a magic link            generarEnlace
 *   Step 4  Professor loads session via link    enlaceGetSession → roster + closeConfig
 *   Step 5a QR attendance (enrolled person)     enlaceMarcarAsistencia → registered
 *   Step 5b QR attendance (not enrolled)        enlaceMarcarAsistencia → BAD_REQUEST
 *   Step 5c Tampered QR sig                     enlaceMarcarAsistencia → FORBIDDEN
 *   Step 6  Professor uploads plan              enlaceUploadSessionDocument → doc row
 *   Step 7a Close without tema                  enlaceCerrar → BAD_REQUEST
 *   Step 7b Close with tema + plan present      enlaceCerrar → success, estado cerrada
 *   Step 8  Compliance reflects close           getComplianceEdicion → plan-present, alert
 *   Step 9  Alert emission (no-op, no mutation) emitSessionAlerts → no throw, no state change
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { initTRPC } from "@trpc/server";
import { createAdminClient } from "../../../client/src/lib/supabase/server";
import { sessionsRouter } from "../programs.sessions";
import { enlaceRouter } from "../programs.enlace";
import { complianceRouter } from "../programs.compliance";
import { sessionAlertsRouter } from "../programs.sessionAlerts";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";
import { hashSessionToken } from "../../../shared/sessionEnlace";

// Controlled secrets so token + QR verification are deterministic
vi.mock("../../_core/env", () => ({
  ENV: {
    qrSigningSecret: "test-qr-secret-minimum-32-chars-padded",
    sessionLinkSecret: "test-link-secret-minimum-32-chars-pad",
    forgeApiUrl: undefined,
    forgeApiKey: undefined,
  },
}));

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(),
}));

const TEST_QR_SECRET = "test-qr-secret-minimum-32-chars-padded";
const TEST_LINK_SECRET = "test-link-secret-minimum-32-chars-pad";

const t = initTRPC.context<TrpcContext>().create({
  transformer: { serialize: (v: unknown) => v, deserialize: (v: unknown) => v },
});

function buildCtx(role: "admin" | "voluntario" | null): TrpcContext {
  return {
    user: role
      ? {
          id: 1, openId: "scenario-test", name: "Test User", email: "t@t.com",
          role, loginMethod: "google",
          createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
        }
      : null,
    logger: new Logger(),
    correlationId: "cierre-sesion-scenario",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req: {} as any, res: {} as any,
  };
}

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;

// ─── Scenario fixtures ────────────────────────────────────────────────────────

const PROGRAM_ID = ID(1);
const SESSION_ID = ID(2);
const ENROLLED_PERSON_ID = ID(10);
const NOT_ENROLLED_PERSON_ID = ID(11);
const ABSENT_PERSON_ID = ID(12);
const LOCATION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
// 2026-07-28 is a Tuesday (getUTCDay()=2) — confirmed: Jul 27 is Monday per existing tests
const SESSION_DATE = "2026-07-28";

// Program with close-config requiring plan_clase upload + tema
const closeConfigFixture = {
  enabled: true,
  fields: [],
  uploads: [{ slug: "plan_clase", label: "Plan de la clase", obligatorio: true }],
  tema_obligatorio: true,
};

const programFixture: Row = {
  id: PROGRAM_ID,
  slug: "cocina_2026",
  fecha_inicio: SESSION_DATE,
  fecha_fin: SESSION_DATE,
  volunteer_can_access: true,
  session_close_config: closeConfigFixture,
  config: {
    location_id: LOCATION_ID,
    // dia_semana: 2 = Tuesday (2026-07-28 is Tuesday)
    programacion: [{ dia_semana: 2, hora_inicio: "09:00", hora_fin: "11:00" }],
  },
};

// ─── Mock DB helper ────────────────────────────────────────────────────────────
// Pattern identical to programs.enlace.test.ts / programs.sessions.test.ts,
// extended with storage mock for the document upload step.

function mockDb(tables: Record<string, Row[]>, withStorage = false) {
  const inserts: Record<string, Row[]> = {};
  const updates: Record<string, Row[]> = {};

  const makeChain = (table: string) => {
    const filters: Record<string, unknown> = {};
    let inFilter: { col: string; vals: unknown[] } | null = null;
    let neqFilter: { col: string; val: unknown } | null = null;
    let limitN: number | null = null;
    const isNullCols: string[] = [];
    let insertPayload: Row | null = null;

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
      is: vi.fn((col: string, val: unknown) => {
        if (val === null) isNullCols.push(col);
        return chain;
      }),
      limit: vi.fn((n: number) => { limitN = n; return chain; }),
      eq: vi.fn((col: string, val: unknown) => { filters[col] = val; return chain; }),
      neq: vi.fn((col: string, val: unknown) => { neqFilter = { col, val }; return chain; }),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      in: vi.fn((col: string, vals: unknown[]) => { inFilter = { col, vals }; return chain; }),
      insert: vi.fn((payload: Row | Row[]) => {
        const row = Array.isArray(payload) ? payload[0] : payload;
        insertPayload = {
          id: `${table}-new-id`,
          created_at: "2026-07-28T10:00:00Z",
          ...row,
        };
        (inserts[table] ??= []).push(row);
        return chain;
      }),
      update: vi.fn((payload: Row) => {
        (updates[table] ??= []).push(payload);
        return chain;
      }),
      single: vi.fn(() => {
        if (insertPayload) {
          const r = insertPayload;
          insertPayload = null;
          return Promise.resolve({ data: r, error: null });
        }
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

  // Storage mock required for enlaceUploadSessionDocument (step 6)
  const storageMock = withStorage
    ? {
        from: vi.fn((_bucket: string) => ({
          upload: vi.fn(() =>
            Promise.resolve({
              data: { path: `sessions/${SESSION_ID}/plan_clase-abc.md` },
              error: null,
            })
          ),
        })),
      }
    : undefined;

  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn((table: string) => makeChain(table)),
    ...(storageMock ? { storage: storageMock } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  return { inserts, updates };
}

beforeEach(() => vi.clearAllMocks());

// ─── Full professor journey ────────────────────────────────────────────────────

describe("«Cierre de sesión» — end-to-end professor journey", () => {
  it("walks the full professor flow from calendar generation to compliance reporting", async () => {
    const adminSessionsCaller = t.createCallerFactory(sessionsRouter)(buildCtx("admin"));
    const adminEnlaceCaller = t.createCallerFactory(enlaceRouter)(buildCtx("admin"));
    const publicEnlaceCaller = t.createCallerFactory(enlaceRouter)(buildCtx(null));
    const complianceCaller = t.createCallerFactory(complianceRouter)(buildCtx("admin"));
    const alertsCaller = t.createCallerFactory(sessionAlertsRouter)(buildCtx("admin"));

    // ─── Step 1: Admin generates the planned calendar ─────────────────────────
    // generarSesiones on the edición whose config has location_id + programacion.
    // 2026-07-28 (dia_semana=2, Tuesday) → exactly 1 session generated.
    // GROUP 1a: location_id from config is stamped on the inserted session.
    {
      const { inserts } = mockDb({
        programs: [programFixture],
        program_sessions: [], // No existing sessions yet
      });

      const result = await adminSessionsCaller.generarSesiones({ programId: PROGRAM_ID });

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(0);
      expect(inserts["program_sessions"]).toHaveLength(1);
      expect(inserts["program_sessions"]![0]).toMatchObject({
        program_id: PROGRAM_ID,
        fecha: SESSION_DATE,
        estado: "planificada",
        hora_inicio: "09:00",
        hora_fin: "11:00",
        location_id: LOCATION_ID, // GROUP 1a: stamped from config.location_id
      });
    }

    // ─── Step 2: Admin opens the session (planificada → abierta) ─────────────
    // abrirSesion resolves location from session.location_id (already stamped).
    // Assert: estado=abierta, location_id preserved on the update payload.
    {
      const { updates } = mockDb({
        programs: [programFixture],
        program_sessions: [{
          id: SESSION_ID, program_id: PROGRAM_ID, fecha: SESSION_DATE,
          estado: "planificada", hora_inicio: "09:00", hora_fin: "11:00",
          location_id: LOCATION_ID, // stamped in Step 1
        }],
      });

      const result = await adminSessionsCaller.abrirSesion({ sessionId: SESSION_ID });

      expect(result.success).toBe(true);
      expect(updates["program_sessions"]![0]).toMatchObject({
        estado: "abierta",
        location_id: LOCATION_ID,
      });
    }

    // ─── Step 3: Staff mints the magic link ───────────────────────────────────
    // generarEnlace returns the PLAINTEXT token once; only the hash is persisted.
    // Assert: token is a 64-char hex string; stored hash differs from plaintext.
    let mintedToken = "";
    {
      const { updates } = mockDb({
        programs: [programFixture],
        program_sessions: [{
          id: SESSION_ID, program_id: PROGRAM_ID, fecha: SESSION_DATE,
          estado: "abierta",
        }],
      });

      const result = await adminEnlaceCaller.generarEnlace({ sessionId: SESSION_ID });

      expect(result.token).toMatch(/^[a-f0-9]{64}$/);
      const storedHash = updates["program_sessions"]![0]?.enlace_token_hash as string;
      expect(storedHash).toBeTruthy();
      expect(storedHash).not.toBe(result.token); // SECURITY: hash ≠ plaintext
      mintedToken = result.token;
    }

    // Build the open-session fixture with the REAL hash so enlace verification passes
    const realHash = await hashSessionToken(mintedToken, TEST_LINK_SECRET);
    const openSession: Row = {
      id: SESSION_ID, program_id: PROGRAM_ID, fecha: SESSION_DATE,
      location_id: LOCATION_ID, estado: "abierta",
      hora_inicio: "09:00", hora_fin: "11:00",
      enlace_token_hash: realHash,
      enlace_expira: new Date(Date.now() + 3_600_000).toISOString(),
      session_data: null,
    };

    // ─── Step 4: Professor loads the session via enlace ───────────────────────
    // enlaceGetSession: token-gated, returns roster + closeConfig.
    // Assert (PII gate): persons contain ONLY id/nombre/apellidos — no high-risk PII.
    // Assert (closeConfig): enabled=true, plan_clase upload is obligatorio.
    {
      mockDb({
        programs: [programFixture],
        program_sessions: [openSession],
        program_enrollments: [{
          id: ID(20), program_id: PROGRAM_ID, person_id: ENROLLED_PERSON_ID,
          estado: "activo", deleted_at: null,
        }],
        persons: [{
          id: ENROLLED_PERSON_ID, nombre: "María", apellidos: "García", deleted_at: null,
          // High-risk PII that MUST NOT appear in the response (ADR-0002)
          situacion_legal: "documentada",
          foto_documento_url: "https://secret.example/foto.jpg",
          recorrido_migratorio: "confidential-route",
          fecha_nacimiento: "1980-01-01",
          colectivos: ["familia"],
        }],
      });

      const result = await publicEnlaceCaller.enlaceGetSession({
        sessionId: SESSION_ID, token: mintedToken,
      });

      // Session object must NOT expose the token internals
      expect(result.session).toBeDefined();
      expect(result.session).not.toHaveProperty("enlace_token_hash");
      expect(result.session).not.toHaveProperty("enlace_expira");

      // Roster: exactly the safe fields
      expect(result.persons).toHaveLength(1);
      const p = result.persons[0]!;
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("nombre");
      expect(p).toHaveProperty("apellidos");
      expect(p).not.toHaveProperty("situacion_legal");
      expect(p).not.toHaveProperty("foto_documento_url");
      expect(p).not.toHaveProperty("recorrido_migratorio");
      expect(p).not.toHaveProperty("fecha_nacimiento");
      expect(p).not.toHaveProperty("colectivos");

      // CloseConfig reflects the program's cierre settings
      expect(result.closeConfig.enabled).toBe(true);
      expect(result.closeConfig.tema_obligatorio).toBe(true);
      const planClaseUpload = (result.closeConfig.uploads as Array<{ slug: string; obligatorio: boolean }>)
        .find((u) => u.slug === "plan_clase");
      expect(planClaseUpload).toBeDefined();
      expect(planClaseUpload?.obligatorio).toBe(true);
    }

    // ─── Step 5a: QR attendance — enrolled person, valid QR ──────────────────
    // enlaceMarcarAsistencia with a QR built via buildQrPayload + TEST_QR_SECRET.
    // Assert: status="registered", attendance row inserted with session_id + location_id.
    {
      const { buildQrPayload } = await import("../../../shared/qr/payload");
      const validQr = await buildQrPayload(ENROLLED_PERSON_ID, TEST_QR_SECRET);

      const { inserts } = mockDb({
        programs: [programFixture],
        program_sessions: [openSession],
        program_enrollments: [{
          id: ID(20), program_id: PROGRAM_ID, person_id: ENROLLED_PERSON_ID,
          estado: "activo", deleted_at: null,
        }],
        persons: [{ id: ENROLLED_PERSON_ID, nombre: "María", apellidos: "García", deleted_at: null }],
        attendances: [], // no duplicate
      });

      const result = await publicEnlaceCaller.enlaceMarcarAsistencia({
        sessionId: SESSION_ID, token: mintedToken,
        personId: ENROLLED_PERSON_ID, qrValue: validQr,
      });

      expect(result.status).toBe("registered");
      expect(inserts["attendances"]![0]).toMatchObject({
        person_id: ENROLLED_PERSON_ID,
        location_id: LOCATION_ID,
        programa: "cocina_2026",
        session_id: SESSION_ID,
      });
    }

    // ─── Step 5b: QR attendance — person NOT enrolled ────────────────────────
    // Assert: BAD_REQUEST with "inscrito" in the message.
    // NOT_ENROLLED_PERSON_ID exists in persons but has NO program_enrollments row.
    {
      mockDb({
        programs: [programFixture],
        program_sessions: [openSession],
        program_enrollments: [{
          id: ID(20), program_id: PROGRAM_ID, person_id: ENROLLED_PERSON_ID,
          estado: "activo", deleted_at: null,
        }],
        persons: [
          { id: ENROLLED_PERSON_ID, nombre: "María", apellidos: "García", deleted_at: null },
          { id: NOT_ENROLLED_PERSON_ID, nombre: "Pedro", apellidos: "Ausente", deleted_at: null },
        ],
        attendances: [],
      });

      await expect(
        publicEnlaceCaller.enlaceMarcarAsistencia({
          sessionId: SESSION_ID, token: mintedToken,
          personId: NOT_ENROLLED_PERSON_ID,
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("inscrito"),
      });
    }

    // ─── Step 5c: Tampered QR signature ──────────────────────────────────────
    // Any modification to the QR sig → FORBIDDEN (signature verification fails).
    {
      mockDb({
        programs: [programFixture],
        program_sessions: [openSession],
        program_enrollments: [{
          id: ID(20), program_id: PROGRAM_ID, person_id: ENROLLED_PERSON_ID,
          estado: "activo", deleted_at: null,
        }],
        persons: [{ id: ENROLLED_PERSON_ID, nombre: "María", deleted_at: null }],
        attendances: [],
      });

      const tamperedQr = `bocatas://person/${ENROLLED_PERSON_ID}?sig=deadbeef`;
      await expect(
        publicEnlaceCaller.enlaceMarcarAsistencia({
          sessionId: SESSION_ID, token: mintedToken,
          personId: ENROLLED_PERSON_ID, qrValue: tamperedQr,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }

    // ─── Step 6: Professor uploads the plan de la clase ──────────────────────
    // enlaceUploadSessionDocument: token-gated, tipoSlug=plan_clase, mimeType=text/markdown.
    // Assert: session_documents row created; subido_por contains "enlace".
    // withStorage=true to include the storage.from().upload() mock.
    {
      const { sessionDocumentsRouter } = await import("../programs.sessionDocuments");
      const docPublicCaller = t.createCallerFactory(sessionDocumentsRouter)(buildCtx(null));

      const { inserts } = mockDb({
        programs: [programFixture],
        program_sessions: [openSession],
        session_documents: [], // no docs yet
      }, true /* withStorage */);

      const markdownContent = "## Tema\nCocina saludable\n## Objetivos\nAprender recetas sanas";
      const base64Plan = Buffer.from(markdownContent).toString("base64");

      const result = await docPublicCaller.enlaceUploadSessionDocument({
        sessionId: SESSION_ID,
        token: mintedToken,
        tipoSlug: "plan_clase",
        base64File: base64Plan,
        mimeType: "text/markdown",
        fileName: "plan_clase.md",
        enNombreDe: "Profa García",
      });

      expect(result.tipo_slug).toBe("plan_clase");
      expect(result.version).toBe(1);
      expect(inserts["session_documents"]).toHaveLength(1);
      expect(inserts["session_documents"]![0]).toMatchObject({
        session_id: SESSION_ID,
        tipo_slug: "plan_clase",
      });
    }

    // ─── Step 7a: Professor tries to close WITHOUT the required tema ──────────
    // enlaceCerrar with session_data missing tema → BAD_REQUEST.
    // Validates that GROUP 2 enforcement is active on the PUBLIC path too:
    // removing enforceCloseValidation from enlaceCerrar would make this RED.
    {
      mockDb({
        programs: [programFixture],
        program_sessions: [openSession],
        session_documents: [{ session_id: SESSION_ID, tipo_slug: "plan_clase" }],
      });

      await expect(
        publicEnlaceCaller.enlaceCerrar({
          sessionId: SESSION_ID, token: mintedToken,
          session_data: {}, // tema is missing
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("tema"),
      });
    }

    // ─── Step 7b: Professor closes with tema + plan present → success ─────────
    // enlaceCerrar with valid session_data (tema) and plan_clase already uploaded.
    // Assert: success=true; program_sessions updated to estado=cerrada + session_data.
    // Assert: program_enrollments NOT mutated (compliance = ALERT ONLY, never auto-baja).
    {
      const { updates } = mockDb({
        programs: [programFixture],
        program_sessions: [openSession],
        session_documents: [{ session_id: SESSION_ID, tipo_slug: "plan_clase" }],
      });

      const result = await publicEnlaceCaller.enlaceCerrar({
        sessionId: SESSION_ID, token: mintedToken,
        session_data: { tema: "Cocina saludable en invierno" },
        enNombreDe: "Profa García",
      });

      expect(result.success).toBe(true);
      const sessionUpdate = updates["program_sessions"]![0];
      expect(sessionUpdate?.estado).toBe("cerrada");
      expect(sessionUpdate?.session_data).toMatchObject({ tema: "Cocina saludable en invierno" });
      expect(sessionUpdate?.closed_at).toBeTruthy();
      // CRITICAL: enlaceCerrar must NEVER touch enrollment estado (alert-only)
      expect(updates["program_enrollments"]).toBeUndefined();
    }

    // ─── Step 8: Compliance reflects the closed session ──────────────────────
    // getComplianceEdicion: checks sessions, plans, and absence alerts.
    //
    // Scenario setup for this assertion:
    //   - Two cerrada sessions (SESSION_ID + a prior one) with hora_fin set
    //     (RESIDUAL 3b: planned sessions only — null hora_fin excluded from denominator)
    //   - plan_clase uploaded for SESSION_ID (step 6 above)
    //   - ENROLLED_PERSON_ID attended both sessions → no alert
    //   - ABSENT_PERSON_ID missed both sessions → 2 consecutive absences → ausenciasAlerta
    //
    // The PRIOR_SESSION_ID is a second cerrada session to enable consecutive-absence detection.
    const PRIOR_SESSION_ID = ID(3);
    {
      mockDb({
        programs: [{ id: PROGRAM_ID, slug: "cocina_2026" }],
        program_sessions: [
          // Session closed in Step 7b — first in date order
          {
            id: PRIOR_SESSION_ID, program_id: PROGRAM_ID, estado: "cerrada",
            fecha: "2026-07-21", hora_fin: "11:00", location_id: LOCATION_ID,
          },
          // The session we just closed
          {
            id: SESSION_ID, program_id: PROGRAM_ID, estado: "cerrada",
            fecha: SESSION_DATE, hora_fin: "11:00", location_id: LOCATION_ID,
          },
        ],
        session_documents: [
          { session_id: SESSION_ID, tipo_slug: "plan_clase" }, // uploaded in Step 6
        ],
        program_enrollments: [
          {
            person_id: ENROLLED_PERSON_ID, program_id: PROGRAM_ID,
            estado: "activo", deleted_at: null,
            persons: { id: ENROLLED_PERSON_ID, nombre: "María", apellidos: "García", deleted_at: null },
          },
          {
            person_id: ABSENT_PERSON_ID, program_id: PROGRAM_ID,
            estado: "activo", deleted_at: null,
            persons: { id: ABSENT_PERSON_ID, nombre: "Juan", apellidos: "Ausente", deleted_at: null },
          },
        ],
        attendances: [
          // ENROLLED_PERSON_ID attended BOTH sessions — no alert
          {
            person_id: ENROLLED_PERSON_ID, session_id: PRIOR_SESSION_ID,
            checked_in_date: "2026-07-21", deleted_at: null,
          },
          {
            person_id: ENROLLED_PERSON_ID, session_id: SESSION_ID,
            checked_in_date: SESSION_DATE, deleted_at: null,
          },
          // ABSENT_PERSON_ID has NO attendances → 2 consecutive absences → alert
        ],
      });

      const result = await complianceCaller.getComplianceEdicion({ programId: PROGRAM_ID });

      expect(result.sesionesCerradas).toBe(2);
      expect(result.planosSubidos).toBeGreaterThanOrEqual(1); // SESSION_ID has plan_clase

      // Juan missed both sessions → alert; ≥2 consecutive absence threshold met
      const juanAlert = result.ausenciasAlerta.find(
        (a: { personId: string }) => a.personId === ABSENT_PERSON_ID
      );
      expect(juanAlert).toBeDefined();
      expect(juanAlert?.consecutiveAbsences).toBeGreaterThanOrEqual(2);

      // María attended both → no absence alert
      const mariaAlert = result.ausenciasAlerta.find(
        (a: { personId: string }) => a.personId === ENROLLED_PERSON_ID
      );
      expect(mariaAlert).toBeUndefined();

      // CRITICAL: compliance NEVER mutates enrollment estado (alert-only, never auto-baja)
      // getComplianceEdicion has no update path on program_enrollments — the absence-alert
      // list is read-only metadata returned to the caller; they decide the action.
    }

    // ─── Step 9: Alert emission (fire-and-forget, no estado mutation) ─────────
    // emitSessionAlerts on a planificada session past hora_fin + 2h threshold.
    // SESSION_ALERT_WEBHOOK_URL is NOT set in the test environment → webhook is a no-op,
    // but emitted counter still increments (the alert was detected and would have fired).
    //
    // Using date 2026-01-12 (winter, months in the past) ensures the 2h threshold is
    // trivially exceeded regardless of test runner time.
    //
    // Assert: does not throw; returns emitted=1.
    // Assert: never mutates enrollment estado or session estado (fire-and-forget alert only).
    {
      const ALERT_SESSION_ID = ID(4);
      const { updates: alertUpdates } = mockDb({
        program_sessions: [{
          id: ALERT_SESSION_ID, program_id: PROGRAM_ID,
          fecha: "2026-01-12", // January 2026 — well past the 2h overdue threshold
          hora_fin: "09:00",
          estado: "planificada", // stays planificada — alerts never change session estado
        }],
      });

      const alertResult = await alertsCaller.emitSessionAlerts({ programId: PROGRAM_ID });

      // Alert was detected (webhook no-op because SESSION_ALERT_WEBHOOK_URL is unset)
      expect(alertResult.emitted).toBe(1);

      // emitSessionAlerts NEVER mutates enrollment estado (it is not enrollment-aware)
      expect(alertUpdates["program_enrollments"]).toBeUndefined();
      // emitSessionAlerts NEVER changes the session's estado (fire-and-forget signal only)
      expect(alertUpdates["program_sessions"]).toBeUndefined();
    }
  });
});
