/**
 * programs.getEnrollments — el filtro 'terminado' incluye el alias legacy.
 *
 * ESTADO_LABELS pinta 'terminado' y 'completado' igual («Terminado»): para
 * quien mira la tabla son EL MISMO estado. Desde que el chip legacy dejó de
 * pintarse cuando 'terminado' está habilitado (EnrolledPersonsTable), un
 * eq('estado','terminado') haría desaparecer las filas antiguas del filtro.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";
import type { User } from "../../../drizzle/schema";

const PROGRAM_ID = "22222222-2222-4222-8222-222222222222";

const capturado = vi.hoisted(() => ({
  eq: [] as Array<[string, unknown]>,
  in: [] as Array<[string, unknown]>,
}));

function makeQuery(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "is", "order", "range"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.eq = vi.fn((col: string, valor: unknown) => {
    capturado.eq.push([col, valor]);
    return chain;
  });
  chain.in = vi.fn((col: string, valores: unknown) => {
    capturado.in.push([col, valores]);
    return chain;
  });
  // Esperar la cadena resuelve como supabase-js: { data, error, count }
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
  return chain;
}

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: () => makeQuery() }),
  createServerClient: vi.fn(),
  createUserImpersonationClient: vi.fn(),
}));

// getEnrollments firma los avatares con signPathField; aquí no hay Storage.
vi.mock("../../storage", () => ({
  AVATAR_BUCKET: "fotos-perfil",
  ID_DOCUMENT_BUCKET: "documentos-identidad",
  CONSENT_DOCUMENT_BUCKET: "documentos-consentimiento",
  signPathField: vi.fn(),
  storagePut: vi.fn(),
  storageSignedUrl: vi.fn(),
  storageSignedUrls: vi.fn(),
  storageRemove: vi.fn(),
  fetchStorageBuffer: vi.fn(),
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
    correlationId: "test-getEnrollments-estado",
  };
}

async function listar(estado?: "terminado" | "activo") {
  const { programsRouter } = await import("../programs");
  return programsRouter
    .createCaller(buildContext())
    .getEnrollments({ programId: PROGRAM_ID, estado });
}

beforeEach(() => {
  capturado.eq.length = 0;
  capturado.in.length = 0;
});

describe("programs.getEnrollments — filtro por estado", () => {
  it("'terminado' consulta estado IN ('terminado','completado')", async () => {
    await listar("terminado");

    expect(capturado.in).toContainEqual(["estado", ["terminado", "completado"]]);
    // y NO un eq que dejaría fuera las filas legacy
    expect(capturado.eq.filter(([col]) => col === "estado")).toHaveLength(0);
  });

  it("cualquier otro estado sigue siendo un eq exacto", async () => {
    await listar("activo");

    expect(capturado.eq).toContainEqual(["estado", "activo"]);
    expect(capturado.in).toHaveLength(0);
  });

  it("sin filtro no toca la columna estado", async () => {
    await listar();

    expect(capturado.eq.filter(([col]) => col === "estado")).toHaveLength(0);
    expect(capturado.in).toHaveLength(0);
  });
});
