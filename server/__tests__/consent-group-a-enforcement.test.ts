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
 * The check happens BEFORE the Supabase call (consents.ts:69-85), so we
 * can use a pure tRPC caller without a DB mock.
 */
import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { Logger } from "../_core/logger";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function authCtx(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@bocatas.org",
    name: "Test",
    loginMethod: "manus",
    role: "user",
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

  it("rejects with BAD_REQUEST when ANY Group A purpose is explicitly denied", async () => {
    const caller = appRouter.createCaller(authCtx());
    await expect(
      caller.persons.saveConsents({
        personId: PERSON_ID,
        consents: GROUP_A_PURPOSES.map((p) =>
          consentRow(p, p === "comunicaciones_whatsapp" ? false : true)
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
      expect(trpcErr.message.toLowerCase()).toContain("grupo a");
    }
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
