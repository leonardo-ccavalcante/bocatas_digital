/**
 * persons.saveConsents.grupoA.test.ts — el servidor tiene que aceptar que se
 * deniegue la imagen (ALTAS-8).
 *
 * El Grupo A obligatorio eran TRES fines: tratamiento de datos, fotografía y
 * comunicaciones por WhatsApp. Empaquetar así el consentimiento lo invalida
 * (RGPD Art. 7(4): sólo es libre si negarlo no cuesta el servicio) y, en la
 * práctica, impedía registrar a quien no quisiera ceder su imagen.
 *
 * Dos comprobaciones distintas que NO deben confundirse:
 *   · COMPLETITUD — los tres fines tienen que venir SIEMPRE en la petición,
 *     porque una negativa se prueba con su fila `granted=false` (Art. 5.2).
 *     Si el cliente pudiera omitir `fotografia`, la negativa dejaría de existir.
 *   · BLOQUEO — sólo `tratamiento_datos_bocatas` puede impedir el registro.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const upsertMock = vi.fn();

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => {
      // `assertGroupACovered` consulta lo que ya consta antes de escribir, así
      // que el builder tiene que ser encadenable y esperable, no sólo upsert.
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is"]) b[m] = vi.fn(() => b);
      b.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res);
      b.upsert = (rows: unknown[]) => {
        upsertMock(rows);
        return { select: () => Promise.resolve({ data: rows, error: null }) };
      };
      return b;
    },
  }),
  createServerClient: vi.fn(),
}));

import { consentsRouter } from "../persons/consents";
import type { TrpcContext } from "../../_core/context";
import { Logger } from "../../_core/logger";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function ctx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: "test-user-1",
    openId: "test-user",
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
    correlationId: "saveconsents-grupoa-test",
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const PERSON_ID = "11111111-1111-4111-8111-111111111111";

type Purpose =
  | "tratamiento_datos_bocatas"
  | "tratamiento_datos_banco_alimentos"
  | "compartir_datos_red"
  | "comunicaciones_whatsapp"
  | "fotografia";

function fila(purpose: Purpose, granted: boolean) {
  return {
    purpose,
    idioma: "es" as const,
    granted,
    granted_at: "2026-08-30T10:00:00.000Z",
    consent_text: "texto",
    consent_version: "1.0",
  };
}

const LOS_TRES: Purpose[] = [
  "tratamiento_datos_bocatas",
  "fotografia",
  "comunicaciones_whatsapp",
];

function save(consents: ReturnType<typeof fila>[]) {
  return consentsRouter.createCaller(ctx()).saveConsents({ personId: PERSON_ID, consents });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("persons.saveConsents — qué puede bloquear un registro", () => {
  it("acepta el registro cuando se deniega el uso de imagen", async () => {
    await expect(
      save([
        fila("tratamiento_datos_bocatas", true),
        fila("fotografia", false),
        fila("comunicaciones_whatsapp", true),
      ])
    ).resolves.toBeDefined();
  });

  it("acepta el registro cuando se deniegan las comunicaciones por WhatsApp", async () => {
    await expect(
      save([
        fila("tratamiento_datos_bocatas", true),
        fila("fotografia", true),
        fila("comunicaciones_whatsapp", false),
      ])
    ).resolves.toBeDefined();
  });

  it("guarda la negativa como fila granted=false, que es la prueba", async () => {
    await save([
      fila("tratamiento_datos_bocatas", true),
      fila("fotografia", false),
      fila("comunicaciones_whatsapp", true),
    ]);

    const rows = upsertMock.mock.calls[0][0] as { purpose: string; granted: boolean }[];
    expect(rows.find((r) => r.purpose === "fotografia")).toMatchObject({ granted: false });
  });

  it("sigue bloqueando si se deniega el tratamiento de datos", async () => {
    await expect(
      save([
        fila("tratamiento_datos_bocatas", false),
        fila("fotografia", true),
        fila("comunicaciones_whatsapp", true),
      ])
    ).rejects.toThrow();
  });

  it("sigue exigiendo que los tres fines vengan en la petición", async () => {
    for (const omitido of LOS_TRES) {
      const consents = LOS_TRES.filter((p) => p !== omitido).map((p) => fila(p, true));
      await expect(save(consents)).rejects.toThrow(/Faltan consentimientos/);
    }
  });
});
