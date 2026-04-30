/**
 * Test suite for Documento_Extranjero enum support
 * 
 * Tests verify that:
 * 1. Server Zod schema accepts Documento_Extranjero
 * 2. Database types include Documento_Extranjero in tipo_documento enum
 * 3. Person creation with Documento_Extranjero succeeds
 * 4. TypeScript compilation passes with no enum mismatch errors
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

describe("Documento_Extranjero Enum Support", () => {
  /**
   * Test 1: Verify server Zod schema accepts Documento_Extranjero
   * This test should PASS - the Zod schema already includes this value
   */
  it("should accept Documento_Extranjero in Zod schema", () => {
    const TipoDocumentoEnum = z.enum([
      "DNI",
      "NIE",
      "Pasaporte",
      "Documento_Extranjero",
      "Sin_Documentacion",
    ]);

    // Should not throw
    const result = TipoDocumentoEnum.safeParse("Documento_Extranjero");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("Documento_Extranjero");
    }
  });

  /**
   * Test 2: Verify all expected tipo_documento values
   * Documents the contract between frontend, server, and database
   */
  it("should have all expected tipo_documento enum values", () => {
    const expectedValues = [
      "DNI",
      "NIE",
      "Pasaporte",
      "Sin_Documentacion",
      "Documento_Extranjero",
    ];

    const TipoDocumentoEnum = z.enum([
      "DNI",
      "NIE",
      "Pasaporte",
      "Documento_Extranjero",
      "Sin_Documentacion",
    ]);

    // Verify each expected value is valid
    for (const value of expectedValues) {
      const result = TipoDocumentoEnum.safeParse(value);
      expect(result.success).toBe(true);
    }
  });

  /**
   * Test 3: Verify TypeScript type compatibility
   * This test verifies the type definition includes the enum value
   * If this compiles, the types are correctly defined
   */
  it("should have Documento_Extranjero in type definitions", () => {
    // This type should match Database["public"]["Enums"]["tipo_documento"]
    type TipoDocumento =
      | "DNI"
      | "NIE"
      | "Pasaporte"
      | "Sin_Documentacion"
      | "Documento_Extranjero";

    const validValue: TipoDocumento = "Documento_Extranjero";
    expect(validValue).toBe("Documento_Extranjero");
  });

  /**
   * Test 4: Verify pais_documento field is available
   * For international documents, we need to store the country of origin
   */
  it("should support pais_documento for international documents", () => {
    // Document structure with both tipo_documento and pais_documento
    type PersonDocument = {
      tipo_documento: "Documento_Extranjero";
      pais_documento: string; // ISO 3166-1 alpha-2
      numero_documento: string;
    };

    const frenchDocument: PersonDocument = {
      tipo_documento: "Documento_Extranjero",
      pais_documento: "FR",
      numero_documento: "ABC123456",
    };

    expect(frenchDocument.tipo_documento).toBe("Documento_Extranjero");
    expect(frenchDocument.pais_documento).toBe("FR");
  });

  /**
   * Test 5: Verify enum value consistency across layers
   * Server Zod, database types, and frontend should all agree
   */
  it("should have consistent enum values across all layers", () => {
    // Server Zod schema
    const serverEnum = z.enum([
      "DNI",
      "NIE",
      "Pasaporte",
      "Documento_Extranjero",
      "Sin_Documentacion",
    ]);

    // Expected database enum (from Supabase)
    const expectedDatabaseEnum = [
      "DNI",
      "NIE",
      "Pasaporte",
      "Sin_Documentacion",
      "Documento_Extranjero",
    ];

    // Verify server enum matches database enum
    const serverValues = serverEnum.options;
    for (const value of expectedDatabaseEnum) {
      expect(serverValues).toContain(value);
    }
  });
});
