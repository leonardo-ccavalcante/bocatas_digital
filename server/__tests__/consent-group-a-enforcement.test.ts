/**
 * consent-group-a-enforcement.test.ts — Phase 6 QA-9 / F-110.
 *
 * CLAUDE.md §3 RGPD guard-rail: Group A consents
 *   (tratamiento_datos_bocatas, fotografia, comunicaciones_whatsapp)
 * are mandatory. The server's `persons.saveConsents` mutation must
 * reject any submission where ANY Group A purpose is missing or
 * explicitly denied, with `TRPCError({ code: "BAD_REQUEST" })`.
 *
 * Pre-Phase-6 this enforcement existed in code but no test locked it
 * in. A future refactor that accidentally weakens the gate would have
 * shipped silently. This file fills that gap.
 *
 * RC-03/F050 relaxes WHICH payloads satisfy the invariant, not the
 * invariant itself: the "missing Group A" check now consults the DB, so a
 * PARTIAL save (the ficha's ConsentModal) is legal when the omitted Group A
 * purposes are already granted. Group A can still never be set to false.
 * That DB read is mocked below.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { Logger } from "../_core/logger";

const dbState = vi.hoisted(() => ({
  existingGranted: [] as Array<{ purpose: string; granted: boolean }>,
}));

vi.mock("../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        in: () => b,
        // `is` y `update`: saveConsents lee ahora las decisiones PREVIAS antes
        // de escribir, para poder sellar `revoked_at` sólo cuando un fin pasa
        // de otorgado a denegado — y para borrar la imagen del documento si el
        // fin retirado es `archivo_documento_identidad`.
        is: () => b,
        not: () => b,
        update: () => b,
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: () => ({
          select: async () => ({ data: [{ id: "c1", purpose: "x", granted: true }], error: null }),
        }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: dbState.existingGranted, error: null }),
      };
      return b;
    },
  }),
}));

beforeEach(() => {
  dbState.existingGranted = [];
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function authCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: "test-user-1",
    openId: "test-user",
    email: "test@bocatas.org",
    name: "Test",
    loginMethod: "manus",
    // saveConsents is voluntarioProcedure; use a staff role so the caller
    // reaches the Group-A enforcement (the subject under test), not the guard.
    role: "voluntario",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    logger: new Logger(),
    correlationId: "tc",
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// Valid UUID v4 (3rd group starts with 4; 4th with 8/9/a/b — strict regex).
const PERSON_ID = "12345678-1234-4234-8234-123456789012";
const NOW = new Date().toISOString();

const GROUP_A_PURPOSES = [
  "tratamiento_datos_bocatas",
  "fotografia",
  "comunicaciones_whatsapp",
] as const;

function consentRow(purpose: typeof GROUP_A_PURPOSES[number] | "tratamiento_datos_banco_alimentos" | "compartir_datos_red", granted: boolean) {
  return {
    purpose,
    idioma: "es" as const,
    granted,
    granted_at: NOW,
    consent_text: "test",
    consent_version: "1.0",
    documento_foto_url: null,
    registrado_por: null,
  };
}

describe("persons.saveConsents — Group A mandatory enforcement (F-110)", () => {
  it("rejects with BAD_REQUEST when ANY Group A purpose is missing", async () => {
    const caller = appRouter.createCaller(authCtx());
    // Submit only 2 of the 3 required Group A purposes.
    await expect(
      caller.persons.saveConsents({
        personId: PERSON_ID,
        consents: [
          consentRow("tratamiento_datos_bocatas", true),
          consentRow("fotografia", true),
          // missing: comunicaciones_whatsapp
        ],
      })
    ).rejects.toThrow(TRPCError);
  });

  // ALTAS-8: el equipo pidió poder registrar a quien no autoriza su imagen, y
  // en Derecho tenían razón — empaquetar tres consentimientos invalida los tres
  // (RGPD Art. 7(4)). Sólo el tratamiento de datos bloquea.
  it("acepta el registro aunque se niegue la fotografía", async () => {
    const caller = appRouter.createCaller(authCtx());
    await expect(
      caller.persons.saveConsents({
        personId: PERSON_ID,
        consents: GROUP_A_PURPOSES.map((p) => consentRow(p, p !== "fotografia")),
      })
    ).resolves.toBeDefined();
  });

  it("acepta el registro aunque se nieguen las comunicaciones por WhatsApp", async () => {
    const caller = appRouter.createCaller(authCtx());
    await expect(
      caller.persons.saveConsents({
        personId: PERSON_ID,
        consents: GROUP_A_PURPOSES.map((p) => consentRow(p, p !== "comunicaciones_whatsapp")),
      })
    ).resolves.toBeDefined();
  });

  it("sigue rechazando si se niega el tratamiento de datos", async () => {
    const caller = appRouter.createCaller(authCtx());
    await expect(
      caller.persons.saveConsents({
        personId: PERSON_ID,
        consents: GROUP_A_PURPOSES.map((p) =>
          consentRow(p, p !== "tratamiento_datos_bocatas")
        ),
      })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects when ALL Group A are denied", async () => {
    const caller = appRouter.createCaller(authCtx());
    await expect(
      caller.persons.saveConsents({
        personId: PERSON_ID,
        consents: GROUP_A_PURPOSES.map((p) => consentRow(p, false)),
      })
    ).rejects.toThrow(TRPCError);
  });

  it("accepts a PARTIAL save (Group B only) when the person already has Group A granted in the DB (RC-03/F050)", async () => {
    dbState.existingGranted = GROUP_A_PURPOSES.map((p) => ({ purpose: p, granted: true }));
    const caller = appRouter.createCaller(authCtx());
    await expect(
      caller.persons.saveConsents({
        personId: PERSON_ID,
        consents: [consentRow("tratamiento_datos_banco_alimentos", true)],
      })
    ).resolves.toBeDefined();
  });

  it("accepts REVOKING a Group B consent (granted:false) when Group A is covered in the DB", async () => {
    dbState.existingGranted = GROUP_A_PURPOSES.map((p) => ({ purpose: p, granted: true }));
    const caller = appRouter.createCaller(authCtx());
    await expect(
      caller.persons.saveConsents({
        personId: PERSON_ID,
        consents: [consentRow("compartir_datos_red", false)],
      })
    ).resolves.toBeDefined();
  });

  it("una negativa YA registrada cuenta como constancia en un guardado parcial", async () => {
    // La ficha manda actualizaciones parciales. Si en el alta se denegó la
    // imagen, esa fila existe con granted=false: es una decisión documentada,
    // no un hueco. Exigir granted=true para las tres dejaría a esa persona sin
    // poder tocar ningún consentimiento nunca más.
    dbState.existingGranted = [
      { purpose: "tratamiento_datos_bocatas", granted: true },
      { purpose: "fotografia", granted: false },
      { purpose: "comunicaciones_whatsapp", granted: true },
    ];
    const caller = appRouter.createCaller(authCtx());
    await expect(
      caller.persons.saveConsents({
        personId: PERSON_ID,
        consents: [consentRow("tratamiento_datos_banco_alimentos", true)],
      })
    ).resolves.toBeDefined();
  });

  it("still rejects a partial save when the person does NOT have Group A granted anywhere", async () => {
    dbState.existingGranted = [];
    const caller = appRouter.createCaller(authCtx());
    await expect(
      caller.persons.saveConsents({
        personId: PERSON_ID,
        consents: [consentRow("tratamiento_datos_banco_alimentos", true)],
      })
    ).rejects.toThrow(TRPCError);
  });

  it("error message is descriptive (mentions Grupo A)", async () => {
    const caller = appRouter.createCaller(authCtx());
    try {
      await caller.persons.saveConsents({
        personId: PERSON_ID,
        consents: [
          consentRow("tratamiento_datos_bocatas", false),
          consentRow("fotografia", true),
          consentRow("comunicaciones_whatsapp", true),
        ],
      });
      expect.fail("Expected TRPCError to be thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      const trpcErr = err as TRPCError;
      expect(trpcErr.code).toBe("BAD_REQUEST");
      expect(trpcErr.message.toLowerCase()).toContain("tratamiento de datos");
    }
  });

  // Hallazgo de revisión adversarial: `if (consents.length === 0) return []`
  // estaba ANTES de la comprobación, así que una llamada con array vacío
  // devolvía 200 y dejaba a la persona con CERO filas de consentimiento — ni
  // base de tratamiento, ni prueba de las negativas. Justo el agujero que el
  // invariante dice cerrar.
  it("un array vacío no puede saltarse la comprobación", async () => {
    dbState.existingGranted = [];
    const caller = appRouter.createCaller(authCtx());
    await expect(
      caller.persons.saveConsents({ personId: PERSON_ID, consents: [] })
    ).rejects.toThrow(TRPCError);
  });

  it("un array vacío es inocuo si ya consta todo lo obligatorio", async () => {
    dbState.existingGranted = GROUP_A_PURPOSES.map((p) => ({ purpose: p, granted: true }));
    const caller = appRouter.createCaller(authCtx());
    await expect(
      caller.persons.saveConsents({ personId: PERSON_ID, consents: [] })
    ).resolves.toEqual([]);
  });

  it("rejects unauthenticated callers (defense-in-depth)", async () => {
    const caller = appRouter.createCaller({
      user: null,
      logger: new Logger(),
      correlationId: "tc",
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
    });
    await expect(
      caller.persons.saveConsents({
        personId: PERSON_ID,
        consents: GROUP_A_PURPOSES.map((p) => consentRow(p, true)),
      })
    ).rejects.toThrow(TRPCError);
  });
});
