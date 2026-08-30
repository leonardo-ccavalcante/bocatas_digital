/**
 * consent-group-a-enforcement.test.ts — Phase 6 QA-9 / F-110, revisado en ALTAS-8.
 *
 * Este fichero fijaba una regla que era ella misma el defecto: exigía los TRES
 * fines (`tratamiento_datos_bocatas`, `fotografia`, `comunicaciones_whatsapp`)
 * como condición para registrar a una persona. El equipo lo detectó desde el
 * mostrador — "podría darse el caso de que la persona no autorizara a ceder
 * imagen" — y tienen razón en Derecho: el RGPD Art. 7(4) sólo considera libre
 * el consentimiento si negarlo no cuesta el servicio. Empaquetar la cesión de
 * imagen y las comunicaciones por WhatsApp con la base de tratamiento invalidaba
 * los tres, y además dejaba fuera del comedor a quien no quisiera salir en una
 * foto.
 *
 * La regla correcta separa dos cosas que no son la misma:
 *   · COMPLETITUD — los tres fines viajan SIEMPRE en la petición. Una negativa
 *     se prueba con su fila `granted=false`, que es lo que exige el principio de
 *     responsabilidad proactiva (Art. 5.2). Esta parte NO se relaja.
 *   · BLOQUEO — sólo `tratamiento_datos_bocatas` puede impedir el registro.
 *
 * No contradice ninguna ADR: la exigencia de los tres no está recogida en
 * AGENTS.md, CONTEXT.md ni en docs/adr/ — vivía sólo en el código y en este
 * test. La referencia a "CLAUDE.md §3" de la cabecera anterior estaba obsoleta.
 *
 * La comprobación ocurre ANTES de la llamada a Supabase, así que basta un caller
 * tRPC puro sin mock de base de datos.
 */
import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { Logger } from "../_core/logger";

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

describe("persons.saveConsents — qué puede bloquear un registro (F-110, ALTAS-8)", () => {
  it("rechaza si falta cualquiera de los tres fines: sin fila no hay prueba", async () => {
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

  // El cambio de fondo de ALTAS-8 —que negar imagen o WhatsApp ya NO impide
  // registrar— se prueba en server/routers/__tests__/persons.saveConsents.grupoA.test.ts:
  // ese caso atraviesa la puerta y llega al INSERT, así que necesita mock de base
  // de datos. Este fichero se queda, por diseño, con lo que se rechaza ANTES de
  // tocar Supabase y no necesita mock.

  it("sigue rechazando si se niega el tratamiento de datos", async () => {
    const caller = appRouter.createCaller(authCtx());
    await expect(
      caller.persons.saveConsents({
        personId: PERSON_ID,
        consents: GROUP_A_PURPOSES.map((p) => consentRow(p, false)),
      })
    ).rejects.toThrow(TRPCError);
  });

  it("el mensaje de error nombra el consentimiento que falta", async () => {
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

  it("rechaza a quien no ha iniciado sesión (defensa en profundidad)", async () => {
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
