/**
 * persons.update / persons.softDelete (#177).
 *
 * Lo que se prueba aquí es la política de acceso y las dos puertas que impiden
 * perder datos: el consentimiento Art. 9 y las asistencias registradas.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../../../_core/context";
import { Logger } from "../../../_core/logger";

const fromMock = vi.fn();

vi.mock("../../../../client/src/lib/supabase/server", () => ({
  createAdminClient: vi.fn(() => ({ from: fromMock })),
  createServerClient: vi.fn(),
}));

vi.mock("../../../_core/pii-crypto", () => ({
  encryptPII: vi.fn((v: string | null) => (v === null ? null : `cifrado:${v}`)),
  decryptPII: vi.fn((v: string | null) => v),
  isPiiCryptoConfigured: vi.fn(() => true),
}));

import { router } from "../../../_core/trpc";
import { updatePerson, softDeletePerson, construirPayload } from "../update";

const testRouter = router({ update: updatePerson, softDelete: softDeletePerson });

function ctx(role: string): TrpcContext {
  const user: NonNullable<TrpcContext["user"]> = {
    id: "u1",
    openId: `test-${role}`,
    email: `${role}@bocatas.org`,
    name: role,
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as NonNullable<TrpcContext["user"]>;
  return {
    user,
    logger: new Logger(),
    correlationId: "persons-update-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

/** Cadena de supabase-js para un update…select().maybeSingle(). */
function updateChain(fila: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: fila, error: null }),
  };
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return chain;
}

const ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  fromMock.mockReset();
});

describe("construirPayload", () => {
  it("incluye sólo lo que el cliente mandó (no machaca el resto a null)", () => {
    const payload = construirPayload({ nombre: "Ana" });
    expect(payload).toEqual({ nombre: "Ana" });
    expect(payload).not.toHaveProperty("apellidos");
  });

  it("convierte cadena vacía en null para limpiar un campo", () => {
    expect(construirPayload({ telefono: "" })).toEqual({ telefono: null });
  });

  it("no deja el campo transitorio de consentimiento en el payload", () => {
    const payload = construirPayload({ nombre: "Ana", colectivo_consentimiento: true });
    expect(payload).not.toHaveProperty("colectivo_consentimiento");
  });

  it("cifra el texto libre de colectivo antes de guardarlo", () => {
    expect(construirPayload({ colectivo_otros: "algo" })).toEqual({
      colectivo_otros: "cifrado:algo",
    });
  });

  it("vaciar el texto de colectivo escribe null, no cifra la cadena vacía", () => {
    expect(construirPayload({ colectivo_otros: "" })).toEqual({ colectivo_otros: null });
  });
});

/**
 * Sin clave de cifrado NO se puede guardar texto de categoría especial — y
 * sobre todo NO se puede machacar con null lo que ya estuviera cifrado.
 *
 * En el alta escribir null sólo significa "no se guarda"; aquí es un UPDATE, y
 * significaba DESTRUIR el dato Art. 9 previamente consentido, respondiendo 200.
 */
describe("persons.update — texto de colectivo sin clave de cifrado", () => {
  it("rechaza el parche en vez de borrar el dato cifrado", async () => {
    const crypto = await import("../../../_core/pii-crypto");
    vi.mocked(crypto.isPiiCryptoConfigured).mockReturnValueOnce(false);

    const caller = testRouter.createCaller(ctx("admin"));
    await expect(
      caller.update({
        id: ID,
        data: { colectivo_otros: "texto corregido", colectivo_consentimiento: true },
      })
    ).rejects.toThrow(/clave de cifrado/i);
    // Nada se escribió: el valor cifrado anterior sigue intacto.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("permite VACIAR el campo aunque no haya clave", async () => {
    const crypto = await import("../../../_core/pii-crypto");
    vi.mocked(crypto.isPiiCryptoConfigured).mockReturnValueOnce(false);
    fromMock.mockReturnValueOnce(updateChain({ id: ID, nombre: "Ana", apellidos: "Ruiz" }));

    const caller = testRouter.createCaller(ctx("admin"));
    await expect(
      caller.update({ id: ID, data: { colectivo_otros: "", colectivo_consentimiento: true } })
    ).resolves.toBeTruthy();
  });
});

describe("persons.update — política de acceso", () => {
  it("un voluntario no puede editar", async () => {
    const caller = testRouter.createCaller(ctx("voluntario"));
    await expect(caller.update({ id: ID, data: { nombre: "Ana" } })).rejects.toThrow();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("un admin sí puede editar", async () => {
    fromMock.mockReturnValueOnce(updateChain({ id: ID, nombre: "Ana", apellidos: "Ruiz" }));
    const caller = testRouter.createCaller(ctx("admin"));
    const res = await caller.update({ id: ID, data: { nombre: "Ana" } });
    expect(res.id).toBe(ID);
  });
});

describe("persons.update — puerta del Art. 9", () => {
  it("rechaza tocar colectivos sin declarar el consentimiento", async () => {
    const caller = testRouter.createCaller(ctx("admin"));
    await expect(
      caller.update({ id: ID, data: { colectivos: ["lgtbi"] } })
    ).rejects.toThrow(/consentimiento expl/i);
    // Lo importante: no ha llegado a escribir nada.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("acepta el cambio cuando el consentimiento va declarado", async () => {
    fromMock.mockReturnValueOnce(updateChain({ id: ID, nombre: "Ana", apellidos: "Ruiz" }));
    const caller = testRouter.createCaller(ctx("admin"));
    await expect(
      caller.update({
        id: ID,
        data: { colectivos: ["lgtbi"], colectivo_consentimiento: true },
      })
    ).resolves.toBeTruthy();
  });

  it("un parche sin colectivos no necesita declarar nada", async () => {
    fromMock.mockReturnValueOnce(updateChain({ id: ID, nombre: "Ana", apellidos: "Ruiz" }));
    const caller = testRouter.createCaller(ctx("admin"));
    await expect(caller.update({ id: ID, data: { telefono: "600111222" } })).resolves.toBeTruthy();
  });
});

describe("persons.update — casos borde", () => {
  it("rechaza un parche vacío en vez de lanzar un UPDATE sin columnas", async () => {
    const caller = testRouter.createCaller(ctx("admin"));
    await expect(caller.update({ id: ID, data: {} })).rejects.toThrow(/No hay cambios/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("404 cuando la ficha no existe o ya está retirada", async () => {
    fromMock.mockReturnValueOnce(updateChain(null));
    const caller = testRouter.createCaller(ctx("admin"));
    await expect(caller.update({ id: ID, data: { nombre: "Ana" } })).rejects.toThrow(
      /no encontrada/i
    );
  });
});

describe("persons.softDelete", () => {
  /** select().eq().is().maybeSingle() para leer, y el count de asistencias. */
  function readChain(fila: unknown) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: fila, error: null }),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.is.mockReturnValue(chain);
    return chain;
  }

  function countChain(count: number | null, error: unknown = null) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn(),
      eq: vi.fn().mockResolvedValue({ count, error }),
    };
    chain.select.mockReturnValue(chain);
    return chain;
  }

  it("un admin NO puede retirar una ficha (sólo superadmin)", async () => {
    const caller = testRouter.createCaller(ctx("admin"));
    await expect(caller.softDelete({ id: ID })).rejects.toThrow();
    expect(fromMock).not.toHaveBeenCalled();
  });

  /**
   * La guarda de asistencias tiene que fallar CERRADA.
   *
   * Descartando el error de la consulta, un timeout sobre `attendances`
   * devolvía count=null, `(count ?? 0) > 0` daba false, y la ficha se retiraba
   * con todo su historial colgando — el caso exacto que la guarda impide — sin
   * un solo log del motivo.
   */
  it("NO retira nada si no puede comprobar el historial (falla cerrada)", async () => {
    fromMock
      .mockReturnValueOnce(readChain({ id: ID, nombre: "Ana", apellidos: "Ruiz" }))
      .mockReturnValueOnce(
        countChain(null, { code: "57014", message: "canceling statement due to statement timeout" })
      );

    const caller = testRouter.createCaller(ctx("superadmin"));
    await expect(caller.softDelete({ id: ID })).rejects.toThrow(/No se ha retirado nada/i);
    // Lo decisivo: la cascada NUNCA llegó a ejecutarse.
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it("NO retira nada si el conteo vuelve nulo sin error", async () => {
    fromMock
      .mockReturnValueOnce(readChain({ id: ID, nombre: "Ana", apellidos: "Ruiz" }))
      .mockReturnValueOnce(countChain(null));

    const caller = testRouter.createCaller(ctx("superadmin"));
    await expect(caller.softDelete({ id: ID })).rejects.toThrow(/No se ha retirado nada/i);
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it("se niega a retirar una ficha con check-ins registrados", async () => {
    fromMock
      .mockReturnValueOnce(readChain({ id: ID, nombre: "Ana", apellidos: "Ruiz" }))
      .mockReturnValueOnce(countChain(3));

    const caller = testRouter.createCaller(ctx("superadmin"));
    await expect(caller.softDelete({ id: ID })).rejects.toThrow(/3 check-in/);
  });

  it("retira una ficha sin asistencias", async () => {
    const cascadeChain: Record<string, ReturnType<typeof vi.fn>> = {
      update: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      select: vi.fn(),
    };
    cascadeChain.update.mockReturnValue(cascadeChain);
    cascadeChain.eq.mockReturnValue(cascadeChain);
    cascadeChain.is.mockReturnValue(cascadeChain);
    cascadeChain.select.mockReturnValue(cascadeChain);
    // El update del padre se espera con await → thenable con error null.
    Object.assign(cascadeChain.eq, {});
    cascadeChain.eq.mockReturnValue({
      ...cascadeChain,
      then: (r: (v: unknown) => unknown) => r({ error: null, data: [] }),
    });

    fromMock
      .mockReturnValueOnce(readChain({ id: ID, nombre: "Ana", apellidos: "Ruiz" }))
      .mockReturnValueOnce(countChain(0))
      .mockReturnValue(cascadeChain);

    const caller = testRouter.createCaller(ctx("superadmin"));
    await expect(caller.softDelete({ id: ID })).resolves.toEqual({ id: ID });
  });
});
