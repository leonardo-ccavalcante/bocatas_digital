/**
 * persons.getPersonConsents — lectura de los consentimientos YA firmados de una
 * persona (feedback del equipo, FAMILIAS-7).
 *
 * El escudo de la ficha nunca fue un visor: era un formulario de captura sobre
 * el catálogo de PLANTILLAS. No existía ningún procedimiento que hiciera SELECT
 * sobre la tabla `consents`, así que las casillas salían siempre desmarcadas
 * aunque la persona hubiera firmado.
 *
 * Patrón de mocking: persons.getById-redaction.test.ts (vi.mock de
 * createAdminClient; resolver real vía createCaller — nunca se moquea el
 * resolver).
 */

import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

const fromMock = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

// Import DESPUÉS de registrar el vi.mock.
import { consentsRouter } from "../persons/consents";
import { personsRouter } from "../persons";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const PERSON_ID = "11111111-1111-1111-1111-111111111111";

function ctxWithRole(role: AuthenticatedUser["role"]): TrpcContext {
  const user: AuthenticatedUser = {
    id: "test-user-1",
    openId: "test-open-id",
    email: "staff@bocatas.org",
    name: "staff",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "persons-getpersonconsents-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

interface QueryResult {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}

interface QueryChain {
  select: (columns: string) => QueryChain;
  eq: (col: string, val: unknown) => QueryChain;
  is: (col: string, val: unknown) => QueryChain;
  order: (col: string) => QueryChain;
  then: (resolve: (v: QueryResult) => unknown) => unknown;
}

interface Recorded {
  table: string;
  columns: string;
  eq: Array<[string, unknown]>;
  is: Array<[string, unknown]>;
}

const recorded: Recorded = { table: "", columns: "", eq: [], is: [] };

function mockQuery(result: QueryResult): void {
  fromMock.mockImplementation((table: string) => {
    recorded.table = table;
    const chain: QueryChain = {
      select: (columns: string) => {
        recorded.columns = columns;
        return chain;
      },
      eq: (col: string, val: unknown) => {
        recorded.eq.push([col, val]);
        return chain;
      },
      is: (col: string, val: unknown) => {
        recorded.is.push([col, val]);
        return chain;
      },
      order: () => chain,
      then: (resolve) => resolve(result),
    };
    return chain;
  });
}

const SAVED_ROW = {
  id: "22222222-2222-2222-2222-222222222222",
  purpose: "tratamiento_datos_bocatas",
  granted: true,
  granted_at: "2026-03-12T10:00:00Z",
  idioma: "es",
  consent_version: "1.2",
  revoked_at: null,
  // El driver podría devolverlo si alguien amplía el select: la salida NO debe
  // arrastrarlo nunca (CAS-02 — es un PATH de storage a PII).
  documento_foto_url: "11111111/fotografia-1.jpg",
};

beforeEach(() => {
  fromMock.mockReset();
  recorded.table = "";
  recorded.columns = "";
  recorded.eq = [];
  recorded.is = [];
});

describe("persons.getPersonConsents — lectura de consentimientos firmados", () => {
  // createCaller devuelve un proxy: `typeof caller.x === "function"` es cierto
  // para cualquier nombre, así que el barrel se comprueba sobre el registro real
  // de procedimientos.
  it("está expuesto en el barrel persons", () => {
    expect(Object.keys(personsRouter._def.procedures)).toContain("getPersonConsents");
  });

  it("consulta la tabla consents filtrando por persona y descartando borrados", async () => {
    mockQuery({ data: [SAVED_ROW], error: null });
    const caller = consentsRouter.createCaller(ctxWithRole("admin"));

    await caller.getPersonConsents({ personId: PERSON_ID });

    expect(recorded.table).toBe("consents");
    expect(recorded.eq).toContainEqual(["person_id", PERSON_ID]);
    expect(recorded.is).toContainEqual(["deleted_at", null]);
  });

  it("devuelve purpose, granted, granted_at, idioma, consent_version y revoked_at", async () => {
    mockQuery({ data: [SAVED_ROW], error: null });
    const caller = consentsRouter.createCaller(ctxWithRole("admin"));

    const rows = await caller.getPersonConsents({ personId: PERSON_ID });

    expect(rows).toEqual([
      {
        purpose: "tratamiento_datos_bocatas",
        granted: true,
        granted_at: "2026-03-12T10:00:00Z",
        idioma: "es",
        consent_version: "1.2",
        revoked_at: null,
      },
    ]);
  });

  it("NUNCA expone documento_foto_url (CAS-02: path de storage a PII)", async () => {
    mockQuery({ data: [SAVED_ROW], error: null });
    const caller = consentsRouter.createCaller(ctxWithRole("admin"));

    const rows = await caller.getPersonConsents({ personId: PERSON_ID });

    expect(recorded.columns).not.toContain("documento_foto_url");
    expect(rows[0]).not.toHaveProperty("documento_foto_url");
  });

  it("es adminProcedure: un voluntario recibe FORBIDDEN", async () => {
    mockQuery({ data: [], error: null });
    const caller = consentsRouter.createCaller(ctxWithRole("voluntario"));

    await expect(
      caller.getPersonConsents({ personId: PERSON_ID })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("no propaga el mensaje crudo del driver al cliente (sin PII en errores)", async () => {
    mockQuery({ data: null, error: { message: 'consents row for person Esperanza Sanchez' } });
    const caller = consentsRouter.createCaller(ctxWithRole("admin"));

    const err: unknown = await caller
      .getPersonConsents({ personId: PERSON_ID })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
    expect((err as TRPCError).message).not.toContain("Esperanza");
  });
});
