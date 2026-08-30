/**
 * programs.enrollPerson.realta.test.ts — re-alta tras una baja.
 *
 * Causa raíz (feedback ALTAS-11, "si se le da de baja en un programa, luego no
 * deja dar de alta de nuevo"):
 *
 *   `program_enrollments` arrastra DOS reglas de unicidad:
 *     · índice parcial `uq_enrollment_person_program_active`
 *       (person_id, program_id) WHERE estado='activo' AND deleted_at IS NULL
 *       — migración 20260411173300, correcto: permite re-alta.
 *     · constraint NO parcial `uq_enrollment_person_program`
 *       UNIQUE (person_id, program_id) — migración 20260411181057, sin filtro
 *       por estado: la fila que deja una baja bloquea para siempre cualquier
 *       INSERT posterior (23505).
 *
 *   `persons.enroll` y `families.ensureFamiliaEnrollment` ya cerraron esa clase
 *   de 23505 con upsert/revive (ver server/routers/families/_shared.ts). El
 *   único escritor que seguía haciendo un INSERT pelado era
 *   `programs.enrollPerson`, que es justo el camino del modal "Inscribir".
 *
 * El mock reproduce el constraint: si ya existe fila para (person, program),
 * un INSERT devuelve 23505 — como haría Postgres.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";
import type { User } from "../../../drizzle/schema";

type Row = Record<string, unknown>;

const PERSON_ID = "11111111-1111-4111-8111-111111111111";
const PROGRAM_ID = "22222222-2222-4222-8222-222222222222";

let programRow: Row | null = null;
let existingEnrollment: Row | null = null;
let capturedInsert: Row | null = null;
let capturedUpdate: Row | null = null;
let capturedEvents: Row[] = [];

function makeChain(result: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "order", "range", "neq", "not"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(async () => result);
  chain.maybeSingle = vi.fn(async () => result);
  return chain;
}

function fromTable(table: string): Record<string, unknown> {
  if (table === "programs") return makeChain({ data: programRow, error: null });

  if (table === "enrollment_events") {
    return {
      insert: vi.fn(async (payload: Row) => {
        capturedEvents.push(payload);
        return { error: null };
      }),
    };
  }

  // program_enrollments
  const chain = makeChain({ data: existingEnrollment, error: null });
  chain.insert = vi.fn((payload: Row) => {
    capturedInsert = payload;
    // Postgres: el UNIQUE (person_id, program_id) NO parcial rechaza el insert
    // en cuanto exista cualquier fila previa, aunque esté de baja.
    if (existingEnrollment) {
      return makeChain({
        data: null,
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "uq_enrollment_person_program"',
        },
      });
    }
    return makeChain({ data: { id: "enr-nueva", ...payload }, error: null });
  });
  chain.update = vi.fn((payload: Row) => {
    capturedUpdate = payload;
    return makeChain({
      data: { id: existingEnrollment?.id ?? "enr-1", ...payload },
      error: null,
    });
  });
  return chain;
}

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: (table: string) => fromTable(table) }),
  createServerClient: vi.fn(),
}));

function buildContext(): TrpcContext {
  const user: User = {
    id: "test-user-42",
    openId: "manus-admin-openid",
    email: "admin@example.com",
    name: "Admin Fixture",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    logger: new Logger(),
    correlationId: "test-realta",
  };
}

async function enroll() {
  const { programsRouter } = await import("../programs");
  return programsRouter
    .createCaller(buildContext())
    .enrollPerson({ personId: PERSON_ID, programId: PROGRAM_ID });
}

describe("programs.enrollPerson — re-alta tras baja", () => {
  beforeEach(() => {
    programRow = {
      requires_consents: [],
      name: "Formación",
      inscribible: true,
      estados_habilitados: ["activo", "pausado", "baja"],
      plazas: null,
    };
    existingEnrollment = null;
    capturedInsert = null;
    capturedUpdate = null;
    capturedEvents = [];
  });

  it("revive la inscripción cuando la persona estaba de baja", async () => {
    existingEnrollment = { id: "enr-1", estado: "baja", deleted_at: null };

    const result = await enroll();

    expect(capturedUpdate).not.toBeNull();
    expect(capturedUpdate?.estado).toBe("activo");
    expect(capturedUpdate?.motivo_baja).toBeNull();
    expect(capturedUpdate?.fecha_fin).toBeNull();
    expect(capturedUpdate?.deleted_at).toBeNull();
    expect(result.enrollment).toMatchObject({ estado: "activo" });
  });

  it("deja rastro en enrollment_events con el estado anterior", async () => {
    existingEnrollment = { id: "enr-1", estado: "baja", deleted_at: null };

    await enroll();

    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0]).toMatchObject({
      estado_anterior: "baja",
      estado_nuevo: "activo",
    });
  });

  it("revive también una inscripción borrada en blando", async () => {
    existingEnrollment = {
      id: "enr-1",
      estado: "activo",
      deleted_at: "2026-01-01T00:00:00.000Z",
    };

    await enroll();

    expect(capturedUpdate?.deleted_at).toBeNull();
  });

  // Hallazgo de revisión adversarial: revivir machacaba el historial.
  it("conserva las notas anteriores cuando el alta nueva no trae ninguna", async () => {
    existingEnrollment = {
      id: "enr-1",
      estado: "baja",
      deleted_at: null,
      notas: "alergia a frutos secos",
      fecha_inicio: "2024-02-11",
    };

    await enroll();

    expect(capturedUpdate?.notas).toBe("alergia a frutos secos");
  });

  it("deja la fecha de inicio anterior registrada en el evento, no la pierde", async () => {
    existingEnrollment = {
      id: "enr-1",
      estado: "baja",
      deleted_at: null,
      notas: null,
      fecha_inicio: "2024-02-11",
    };

    await enroll();

    expect(capturedEvents[0]?.motivo).toMatch(/2024-02-11/);
  });

  it("sigue rechazando si la inscripción está viva", async () => {
    existingEnrollment = { id: "enr-1", estado: "activo", deleted_at: null };

    await expect(enroll()).rejects.toThrow(/ya está inscrita/);
    expect(capturedUpdate).toBeNull();
  });

  it("inserta normalmente cuando no hay inscripción previa", async () => {
    const result = await enroll();

    expect(capturedInsert).toMatchObject({
      person_id: PERSON_ID,
      program_id: PROGRAM_ID,
      estado: "activo",
    });
    expect(capturedUpdate).toBeNull();
    expect(result.enrollment).toMatchObject({ id: "enr-nueva" });
  });
});
