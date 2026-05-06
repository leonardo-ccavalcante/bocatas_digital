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
import { Logger } from "./_core/logger";

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
    logger: new Logger(),
    correlationId: "test-correlation-id",
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

function createAnonContext(): TrpcContext {
  return {
    user: null,
    logger: new Logger(),
    correlationId: "test-correlation-id",
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
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
      caller.persons.getById({ id: "550e8400-e29b-41d4-a716-446655440000" })
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
        titularId: "550e8400-e29b-41d4-a716-446655440001",
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
        titularId: "550e8400-e29b-41d4-a716-446655440002",
        miembros: [],
        numAdultos: 0,
        numMenores: 0,
      })
    ).rejects.toThrow();
  });
});

describe("persons router — updateRole procedure", () => {
  it("rejects unauthenticated updateRole requests", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.persons.updateRole({
        personId: "550e8400-e29b-41d4-a716-446655440003",
        newRole: "admin",
      })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects updateRole with invalid personId UUID", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.updateRole({
        personId: "not-a-uuid",
        newRole: "admin",
      })
    ).rejects.toThrow();
  });

  it("rejects updateRole with invalid role value", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.updateRole({
        personId: "550e8400-e29b-41d4-a716-446655440004",
        // test mock boundary — Supabase client mock
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newRole: "invalid_role" as any,
      })
    ).rejects.toThrow();
  });

  it("rejects updateRole when user is not admin", async () => {
    const context = createAuthContext();
    // User has role "user" (not admin/superadmin)
    const caller = appRouter.createCaller(context);
    await expect(
      caller.persons.updateRole({
        personId: "550e8400-e29b-41d4-a716-446655440005",
        newRole: "admin",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Solo admin puede cambiar roles",
    });
  });

  it("allows updateRole when user is admin", async () => {
    const context = createAuthContext();
    context.user!.role = "admin";
    const caller = appRouter.createCaller(context);
    
    // This will fail at Supabase level (person doesn't exist in unit test),
    // but should NOT fail with FORBIDDEN error
    const promise = caller.persons.updateRole({
      personId: "550e8400-e29b-41d4-a716-446655440006",
      newRole: "voluntario",
    });
    
    // Should fail with INTERNAL_SERVER_ERROR (Supabase error), not FORBIDDEN
    await expect(promise).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("allows updateRole when user is superadmin", async () => {
    const context = createAuthContext();
    context.user!.role = "superadmin";
    const caller = appRouter.createCaller(context);
    
    // This will fail at Supabase level (person doesn't exist in unit test),
    // but should NOT fail with FORBIDDEN error
    const promise = caller.persons.updateRole({
      personId: "550e8400-e29b-41d4-a716-446655440007",
      newRole: "beneficiario",
    });
    
    // Should fail with INTERNAL_SERVER_ERROR (Supabase error), not FORBIDDEN
    await expect(promise).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("accepts updateRole with all valid roles", async () => {
    const context = createAuthContext();
    context.user!.role = "admin";
    const caller = appRouter.createCaller(context);
    
    const validRoles = ["user", "admin", "superadmin", "voluntario", "beneficiario"] as const;
    
    for (const role of validRoles) {
      const promise = caller.persons.updateRole({
        personId: "550e8400-e29b-41d4-a716-446655440008",
        newRole: role,
      });
      
      // Should fail with INTERNAL_SERVER_ERROR (Supabase error), not input validation error
      await expect(promise).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    }
  });
});


describe("persons router — updateFaseItinerario procedure", () => {
  it("rejects unauthenticated updateFaseItinerario requests", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.persons.updateFaseItinerario({
        personId: "550e8400-e29b-41d4-a716-446655440009",
        newFaseItinerario: "formacion",
      })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects updateFaseItinerario with invalid personId UUID", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.updateFaseItinerario({
        personId: "not-a-uuid",
        newFaseItinerario: "formacion",
      })
    ).rejects.toThrow();
  });

  it("rejects updateFaseItinerario with invalid fase value", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.persons.updateFaseItinerario({
        personId: "550e8400-e29b-41d4-a716-446655440010",
        // test mock boundary — Supabase client mock
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newFaseItinerario: "invalid_fase" as any,
      })
    ).rejects.toThrow();
  });

  it("rejects updateFaseItinerario when user is not admin", async () => {
    const context = createAuthContext();
    // User has role "user" (not admin/superadmin)
    const caller = appRouter.createCaller(context);
    await expect(
      caller.persons.updateFaseItinerario({
        personId: "550e8400-e29b-41d4-a716-446655440011",
        newFaseItinerario: "formacion",
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Solo admin puede cambiar fase itinerario",
    });
  });

  it("allows updateFaseItinerario when user is admin", async () => {
    const context = createAuthContext();
    context.user!.role = "admin";
    const caller = appRouter.createCaller(context);
    
    // This will fail at Supabase level (person doesn't exist in unit test),
    // but should NOT fail with FORBIDDEN error
    const promise = caller.persons.updateFaseItinerario({
      personId: "550e8400-e29b-41d4-a716-446655440012",
      newFaseItinerario: "estabilizacion",
    });
    
    // Should fail with NOT_FOUND (Supabase error), not FORBIDDEN
    await expect(promise).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("allows updateFaseItinerario when user is superadmin", async () => {
    const context = createAuthContext();
    context.user!.role = "superadmin";
    const caller = appRouter.createCaller(context);
    
    // This will fail at Supabase level (person doesn't exist in unit test),
    // but should NOT fail with FORBIDDEN error
    const promise = caller.persons.updateFaseItinerario({
      personId: "550e8400-e29b-41d4-a716-446655440013",
      newFaseItinerario: "insercion_laboral",
    });
    
    // Should fail with NOT_FOUND (Supabase error), not FORBIDDEN
    await expect(promise).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("accepts updateFaseItinerario with all valid fase values", async () => {
    const context = createAuthContext();
    context.user!.role = "admin";
    const caller = appRouter.createCaller(context);
    
    const validFases = ["acogida", "estabilizacion", "formacion", "insercion_laboral", "autonomia"] as const;
    
    for (const fase of validFases) {
      const promise = caller.persons.updateFaseItinerario({
        personId: "550e8400-e29b-41d4-a716-446655440014",
        newFaseItinerario: fase,
      });
      
      // Should fail with NOT_FOUND (Supabase error), not input validation error
      await expect(promise).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    }
  });
});

describe("persons router — document country validation", () => {
  it("should warn when Documento_Extranjero lacks pais_documento", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    const result = await caller.persons.create({
      nombre: "Juan",
      apellidos: "García",
      fecha_nacimiento: "1990-01-01",
      idioma_principal: "es",
      canal_llegada: "boca_a_boca",
      tipo_documento: "Documento_Extranjero",
      numero_documento: "A12345678",
      pais_documento: null,
      fase_itinerario: "acogida",
      program_ids: [],
    });

    // Should succeed but include warning
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("validation_warnings");
    expect(result.validation_warnings).toContain(
      "pais_documento required for Documento_Extranjero"
    );
  });

  it("should not warn when Documento_Extranjero has pais_documento", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    const result = await caller.persons.create({
      nombre: "Juan",
      apellidos: "García",
      fecha_nacimiento: "1990-01-01",
      idioma_principal: "es",
      canal_llegada: "boca_a_boca",
      tipo_documento: "Documento_Extranjero",
      numero_documento: "A12345678",
      pais_documento: "FR",
      fase_itinerario: "acogida",
      program_ids: [],
    });

    expect(result).toHaveProperty("id");
    expect(result.validation_warnings || []).not.toContain(
      "pais_documento required for Documento_Extranjero"
    );
  });

  it("should not warn for DNI without pais_documento", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    const result = await caller.persons.create({
      nombre: "Juan",
      apellidos: "García",
      fecha_nacimiento: "1990-01-01",
      idioma_principal: "es",
      canal_llegada: "boca_a_boca",
      tipo_documento: "DNI",
      numero_documento: "12345678A",
      pais_documento: null,
      fase_itinerario: "acogida",
      program_ids: [],
    });

    expect(result).toHaveProperty("id");
    expect(result.validation_warnings || []).not.toContain(
      "pais_documento required"
    );
  });
});
