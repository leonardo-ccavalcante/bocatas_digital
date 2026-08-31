/**
 * persons.search.tokens.test.ts — RC-06 (F065).
 *
 * persons.search must match full names in ANY word order and ignore accents:
 * each token of the normalised query becomes one AND'ed
 * `.ilike("nombre_norm", …)` filter, replacing the old whole-string
 * `.or(nombre.ilike…,apellidos.ilike…)`.
 *
 * Mocking pattern: persons.getAll-pagination.test.ts.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

const fromMock = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

vi.mock("../../storage", () => ({
  signPathField: vi.fn(async () => undefined),
  AVATAR_BUCKET: "avatars",
}));

// Import AFTER vi.mock is registered.
import { router } from "../../_core/trpc";
import { searchPersons } from "../persons/search";

// La búsqueda vive en su propio módulo (server/routers/persons/search.ts); se
// envuelve en un router mínimo para poder usar createCaller sin arrastrar el
// resto del router de personas al test.
const crudRouter = router({ search: searchPersons });

function voluntarioCtx(): TrpcContext {
  const user: NonNullable<TrpcContext["user"]> = {
    id: "test-user-1",
    openId: "test-voluntario",
    email: "voluntario@bocatas.org",
    name: "voluntario",
    loginMethod: "manus",
    role: "voluntario",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "persons-search-tokens-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

type Chain = {
  select: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function searchChain(rows: unknown[]): Chain {
  const chain: Chain = {
    select: vi.fn(),
    is: vi.fn(),
    or: vi.fn(),
    ilike: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  chain.select.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.or.mockReturnValue(chain);
  chain.ilike.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("persons.search — tokenised accent-insensitive search (RC-06)", () => {
  it("matches word-order-independently: 'López  García' → AND of %lopez% and %garcia%", async () => {
    const chain = searchChain([]);
    fromMock.mockReturnValueOnce(chain);

    const caller = crudRouter.createCaller(voluntarioCtx());
    await caller.search({ query: " López  García " });

    expect(fromMock).toHaveBeenCalledWith("persons");
    expect(chain.ilike).toHaveBeenCalledTimes(2);
    expect(chain.ilike).toHaveBeenNthCalledWith(1, "nombre_norm", "%lopez%");
    expect(chain.ilike).toHaveBeenNthCalledWith(2, "nombre_norm", "%garcia%");
    expect(chain.or).not.toHaveBeenCalled();
  });

  it("returns [] without querying when the input is whitespace-only", async () => {
    const caller = crudRouter.createCaller(voluntarioCtx());
    // '  ' passes the zod min(2) guard but has zero tokens.
    const rows = await caller.search({ query: "  " });

    expect(rows).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("persons.search — carril de nº de documento y teléfono", () => {
  it("no toca las columnas de identificador cuando se busca un nombre", async () => {
    const chain = searchChain([]);
    fromMock.mockReturnValueOnce(chain);

    const caller = crudRouter.createCaller(voluntarioCtx());
    await caller.search({ query: "Awa Diop" });

    // Un solo carril: sin dígitos no hay nada que buscar en documento/teléfono.
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(chain.or).not.toHaveBeenCalled();
  });

  it("busca en numero_documento y telefono cuando lo tecleado lleva dígitos", async () => {
    const porNombre = searchChain([]);
    const porIdentificador = searchChain([]);
    fromMock.mockReturnValueOnce(porNombre).mockReturnValueOnce(porIdentificador);

    const caller = crudRouter.createCaller(voluntarioCtx());
    await caller.search({ query: "600123456" });

    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(porIdentificador.or).toHaveBeenCalledWith(
      'numero_documento.ilike."%600123456%",telefono.ilike."%600123456%"'
    );
  });

  it("entrecomilla el valor para que una coma no inyecte filtros (CAS-04)", async () => {
    const porNombre = searchChain([]);
    const porIdentificador = searchChain([]);
    fromMock.mockReturnValueOnce(porNombre).mockReturnValueOnce(porIdentificador);

    const caller = crudRouter.createCaller(voluntarioCtx());
    await caller.search({ query: "123,deleted_at.is.null" });

    const filtro = porIdentificador.or.mock.calls[0][0] as string;
    // El valor viaja entrecomillado: la coma queda DENTRO del token y no puede
    // añadir un filtro propio al árbol de PostgREST. El `_` sale escapado
    // porque es un comodín de LIKE (ilikeForOr), no por seguridad.
    expect(filtro).toContain('numero_documento.ilike."%123,deleted\\\\_at.is.null%"');
    // Exactamente dos filtros: la coma inyectada no ha creado un tercero.
    expect(filtro.match(/\.ilike\./g)).toHaveLength(2);
  });

  it("no repite a quien aparece en los dos carriles", async () => {
    const fila = {
      id: "p1",
      nombre: "Ana",
      apellidos: "Ruiz",
      fecha_nacimiento: null,
      foto_perfil_url: null,
      restricciones_alimentarias: null,
      fase_itinerario: null,
    };
    fromMock
      .mockReturnValueOnce(searchChain([fila]))
      .mockReturnValueOnce(searchChain([fila]));

    const caller = crudRouter.createCaller(voluntarioCtx());
    const rows = await caller.search({ query: "Ana 12345678A" });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("p1");
  });
});
