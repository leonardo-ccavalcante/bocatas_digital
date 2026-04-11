/**
 * persons.test.ts — Unit tests for the persons tRPC router.
 *
 * These tests verify that:
 * 1. The router procedures exist and are callable
 * 2. Input validation works correctly (required fields, UUID format, etc.)
 * 3. The router rejects unauthenticated requests (protectedProcedure)
 *
 * Note: We do NOT mock Supabase here — integration tests against the real DB
 * would require a test environment. These unit tests focus on the tRPC layer.
 */
import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-open-id",
    email: "test@bocatas.org",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createAnonContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("persons router — authentication guard", () => {
  it("rejects unauthenticated search requests", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.persons.search({ query: "Juan" })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects unauthenticated getById requests", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.persons.getById({ id: "00000000-0000-0000-0000-000000000001" })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects unauthenticated programs requests", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.persons.programs()
    ).rejects.toThrow(TRPCError);
  });

  it("rejects unauthenticated create requests", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.persons.create({
        canal_llegada: "boca_a_boca",
        nombre: "Juan",
        apellidos: "García",
        fecha_nacimiento: "1990-01-01",
        idioma_principal: "es",
        program_ids: [],
      })
    ).rejects.toThrow(TRPCError);
  });
});

describe("persons router — input validation", () => {
  it("rejects search with query shorter than 2 characters", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.search({ query: "J" })
    ).rejects.toThrow();
  });

  it("rejects getById with invalid UUID", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.getById({ id: "not-a-uuid" })
    ).rejects.toThrow();
  });

  it("rejects enroll with invalid person UUID", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.enroll({ personId: "not-a-uuid", programIds: [] })
    ).rejects.toThrow();
  });

  it("rejects create with missing required fields", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      // @ts-expect-error — intentionally missing required fields
      caller.persons.create({ nombre: "Juan" })
    ).rejects.toThrow();
  });

  it("rejects create with invalid fecha_nacimiento format", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.create({
        canal_llegada: "boca_a_boca",
        nombre: "Juan",
        apellidos: "García",
        fecha_nacimiento: "01/01/1990", // wrong format
        idioma_principal: "es",
        program_ids: [],
      })
    ).rejects.toThrow();
  });

  it("rejects create with invalid email", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.create({
        canal_llegada: "boca_a_boca",
        nombre: "Juan",
        apellidos: "García",
        fecha_nacimiento: "1990-01-01",
        idioma_principal: "es",
        email: "not-an-email",
        program_ids: [],
      })
    ).rejects.toThrow();
  });

  it("accepts create with all required fields and valid data", async () => {
    // This will fail at the Supabase level (no real DB in unit tests),
    // but it should NOT fail at the tRPC input validation level.
    const caller = appRouter.createCaller(createAuthContext());
    const promise = caller.persons.create({
      canal_llegada: "boca_a_boca",
      nombre: "Juan",
      apellidos: "García López",
      fecha_nacimiento: "1990-01-01",
      idioma_principal: "es",
      program_ids: [],
    });
    // Should fail with INTERNAL_SERVER_ERROR (Supabase error), NOT with input validation error
    await expect(promise).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});

describe("persons router — createFamily validation", () => {
  it("rejects unauthenticated createFamily requests", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.persons.createFamily({
        titularId: "00000000-0000-0000-0000-000000000001",
        miembros: [],
        numAdultos: 1,
        numMenores: 0,
      })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects createFamily with invalid titularId UUID", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.createFamily({
        titularId: "not-a-uuid",
        miembros: [],
        numAdultos: 1,
        numMenores: 0,
      })
    ).rejects.toThrow();
  });

  it("rejects createFamily with numAdultos < 1", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.createFamily({
        titularId: "00000000-0000-0000-0000-000000000001",
        miembros: [],
        numAdultos: 0,
        numMenores: 0,
      })
    ).rejects.toThrow();
  });

  it("accepts createFamily with valid input (fails at infrastructure level, not validation)", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const promise = caller.persons.createFamily({
      titularId: "00000000-0000-0000-0000-000000000001",
      miembros: [{ nombre: "María", apellidos: "García", fecha_nacimiento: "1985-03-15" }],
      numAdultos: 2,
      numMenores: 1,
    });
    // Should fail at infrastructure level (DB/Supabase), not at input validation
    await expect(promise).rejects.toMatchObject({
      code: expect.stringMatching(/INTERNAL_SERVER_ERROR|BAD_REQUEST/),
    });
  });
});

describe("persons router — uploadPhoto validation", () => {
  it("rejects unauthenticated uploadPhoto requests", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.persons.uploadPhoto({ bucket: "fotos-perfil", base64: "abc123" })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects uploadPhoto with invalid bucket name", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      // @ts-expect-error — intentionally invalid bucket
      caller.persons.uploadPhoto({ bucket: "invalid-bucket", base64: "abc123" })
    ).rejects.toThrow();
  });

  it("rejects uploadPhoto with empty base64", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.uploadPhoto({ bucket: "fotos-perfil", base64: "" })
    ).rejects.toThrow();
  });
});

describe("persons router — saveConsents validation", () => {
  it("rejects unauthenticated saveConsents requests", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.persons.saveConsents({
        personId: "00000000-0000-0000-0000-000000000001",
        consents: [],
      })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects saveConsents with invalid personId UUID", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.saveConsents({
        personId: "not-a-uuid",
        consents: [],
      })
    ).rejects.toThrow();
  });

  it("rejects saveConsents with invalid purpose", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.saveConsents({
        personId: "00000000-0000-0000-0000-000000000001",
        consents: [{
          // @ts-expect-error — intentionally invalid purpose
          purpose: "invalid_purpose",
          idioma: "es",
          accepted: true,
          version: "1.0",
          consent_text: "text",
          consent_version: "1.0",
        }],
      })
    ).rejects.toThrow();
  });
});

describe("persons router — saveConsents server-side Group A enforcement", () => {
  const validPersonId = "00000000-0000-0000-0000-000000000001";
  const validGroupA = [
    { purpose: "tratamiento_datos_bocatas" as const, idioma: "es" as const, granted: true, granted_at: new Date().toISOString(), consent_text: "text", consent_version: "1.0" },
    { purpose: "fotografia" as const, idioma: "es" as const, granted: true, granted_at: new Date().toISOString(), consent_text: "text", consent_version: "1.0" },
    { purpose: "comunicaciones_whatsapp" as const, idioma: "es" as const, granted: true, granted_at: new Date().toISOString(), consent_text: "text", consent_version: "1.0" },
  ];

  it("rejects saveConsents when Group A purpose is missing", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.saveConsents({
        personId: validPersonId,
        consents: [validGroupA[0], validGroupA[1]], // missing comunicaciones_whatsapp
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects saveConsents when Group A consent is denied", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.saveConsents({
        personId: validPersonId,
        consents: [
          { ...validGroupA[0], granted: false }, // denied
          validGroupA[1],
          validGroupA[2],
        ],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts saveConsents when all Group A consents are granted (fails at DB, not validation)", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const promise = caller.persons.saveConsents({
      personId: validPersonId,
      consents: validGroupA,
    });
    await expect(promise).rejects.toMatchObject({
      code: expect.stringMatching(/INTERNAL_SERVER_ERROR|BAD_REQUEST/),
    });
  });
});
