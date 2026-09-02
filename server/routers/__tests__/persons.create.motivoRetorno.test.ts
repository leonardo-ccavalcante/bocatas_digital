/**
 * persons.create.motivoRetorno.test.ts — motivo_retorno llega a la columna.
 *
 * La columna persons.motivo_retorno existe desde 20260411081830 pero ninguna
 * capa la escribía: el input Zod la descartaba (clave desconocida) y el
 * insertPayload de crud.ts no la incluía. Contrato: lo que el alta envía en
 * motivo_retorno tiene que aparecer en el INSERT ('' y ausencia → null).
 *
 * Patrón de mock idéntico a programs.create.created-by.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";
import type { User } from "../../../drizzle/schema";

let capturedInsert: Record<string, unknown> | null = null;

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      insert: (rows: Array<Record<string, unknown>>) => {
        capturedInsert = rows[0];
        return {
          select: (_cols: string) => ({
            single: async () => ({
              data: {
                id: "22222222-2222-4222-8222-222222222222",
                nombre: "Ana",
                apellidos: "García",
              },
              error: null,
            }),
          }),
        };
      },
    }),
  }),
}));

function buildVoluntario(): User {
  return {
    id: "test-user-7",
    openId: "manus-vol-openid",
    email: "vol@example.com",
    name: "Voluntaria Fixture",
    loginMethod: "manus",
    role: "voluntario",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function buildContext(user: User): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    logger: new Logger(),
    correlationId: "test-correlation-id",
  };
}

const ALTA_MINIMA = {
  canal_llegada: "retorno_bocatas" as const,
  nombre: "Ana",
  apellidos: "García",
  fecha_nacimiento: "1990-01-01",
  idioma_principal: "es" as const,
  program_ids: [] as string[],
};

describe("persons.create — motivo_retorno en el INSERT", () => {
  beforeEach(() => {
    capturedInsert = null;
  });

  it("persiste el texto de motivo_retorno tal cual", async () => {
    const { crudRouter } = await import("../persons/crud");
    const caller = crudRouter.createCaller(buildContext(buildVoluntario()));

    await caller.create({
      ...ALTA_MINIMA,
      motivo_retorno: "Vuelve tras seis meses fuera de Madrid",
    });

    expect(capturedInsert).not.toBeNull();
    expect(capturedInsert!.motivo_retorno).toBe("Vuelve tras seis meses fuera de Madrid");
  });

  it("normaliza '' y ausencia a null, como el resto de textos del alta", async () => {
    const { crudRouter } = await import("../persons/crud");
    const caller = crudRouter.createCaller(buildContext(buildVoluntario()));

    await caller.create({ ...ALTA_MINIMA, motivo_retorno: "" });
    expect(capturedInsert!.motivo_retorno).toBeNull();

    await caller.create(ALTA_MINIMA);
    expect(capturedInsert!.motivo_retorno).toBeNull();
  });

  it("con canal distinto de retorno_bocatas el motivo se descarta (huérfano del wizard)", async () => {
    // El textarea desaparece al cambiar el canal pero react-hook-form conserva
    // el valor: la muralla es el servidor, que amarra el campo a su canal.
    const { crudRouter } = await import("../persons/crud");
    const caller = crudRouter.createCaller(buildContext(buildVoluntario()));

    await caller.create({
      ...ALTA_MINIMA,
      canal_llegada: "boca_a_boca",
      motivo_retorno: "texto huérfano de un canal anterior",
    });
    expect(capturedInsert!.motivo_retorno).toBeNull();
  });
});
