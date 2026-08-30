/**
 * persons.programs.test.ts — el catálogo de programas no se inventa.
 *
 * El endpoint devolvía `[]` ante CUALQUIER error de base («Return empty array
 * on error — UI has fallback seed data»), y el cliente rellenaba ese hueco con
 * `PROGRAMS_SEED_FALLBACK`: seis programas con slugs escritos con guion y UUIDs
 * inventados. Es decir, ante un fallo de BD el voluntario veía un catálogo
 * plausible y falso, y al inscribir a alguien la FK reventaba.
 *
 * Peor: ese colchón es lo que hizo invisible el desfase del slug del Programa
 * Familias durante meses. Un error tiene que verse.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const selectMock = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({ from: () => ({ select: selectMock }) }),
  createServerClient: vi.fn(),
}));

import { consentsRouter } from "../persons/consents";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

function ctx(): TrpcContext {
  return {
    user: {
      id: "u1", openId: "u1", email: "v@bocatas.org", name: "v",
      loginMethod: "manus", role: "voluntario",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "programs-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  c.eq = vi.fn(() => c);
  c.order = vi.fn(async () => result);
  return c;
}

beforeEach(() => vi.clearAllMocks());

describe("persons.programs", () => {
  it("devuelve el catálogo cuando la consulta va bien", async () => {
    const rows = [{ id: "p1", slug: "comedor", name: "Comedor Social" }];
    selectMock.mockReturnValue(chain({ data: rows, error: null }));

    await expect(consentsRouter.createCaller(ctx()).programs()).resolves.toEqual(rows);
  });

  it("propaga el fallo en vez de fingir un catálogo vacío", async () => {
    selectMock.mockReturnValue(chain({ data: null, error: { message: "connection refused" } }));

    await expect(consentsRouter.createCaller(ctx()).programs()).rejects.toThrow();
  });
});
