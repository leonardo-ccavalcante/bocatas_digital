import { describe, it, expect } from "vitest";
import { DocumentValidationError, validateContext } from "../documentService";
import type { FamilyDocumentContext } from "../documentService.types";

const MINIMAL_TEMPLATE = {
  id: "t1",
  slug: "informe_social" as const,
  placeholders: ["titular.nombre", "titular.apellidos", "familia.numero", "informe.fecha_seguimiento"],
  static_blocks: {},
};

const VALID_CONTEXT: FamilyDocumentContext = {
  titular: { nombre: "María", apellidos: "García", documento: "X1", telefono: "600" },
  familia: {
    numero: "0042",
    num_adultos: 2,
    num_menores_18: 1,
    total_miembros: 3,
    distrito: null,
    codigo_postal: null,
    estado: "activa",
  },
  miembros: [],
  informe: {
    fecha_seguimiento: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    notas_seguimiento: "Bien.",
    effective_date: "",
  },
  logos: [],
  static_blocks: {},
  generated_at: new Date().toISOString(),
  generated_by_name: "Voluntario",
};

describe("validateContext", () => {
  it("passes for valid informe_social context", () => {
    expect(() => validateContext(MINIMAL_TEMPLATE, VALID_CONTEXT)).not.toThrow();
  });

  it("throws MISSING_PLACEHOLDER when titular.nombre is empty string", () => {
    const ctx = { ...VALID_CONTEXT, titular: { ...VALID_CONTEXT.titular, nombre: "" } };
    expect(() => validateContext(MINIMAL_TEMPLATE, ctx)).toThrowError(DocumentValidationError);
    try {
      validateContext(MINIMAL_TEMPLATE, ctx);
    } catch (e) {
      expect((e as DocumentValidationError).code).toBe("MISSING_PLACEHOLDER");
      expect((e as DocumentValidationError).details).toHaveProperty("missing");
    }
  });

  it("throws STALE_INFORME when fecha_seguimiento is >365 days ago", () => {
    const staleDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const ctx: FamilyDocumentContext = {
      ...VALID_CONTEXT,
      informe: { ...VALID_CONTEXT.informe!, fecha_seguimiento: staleDate, effective_date: staleDate },
    };
    expect(() => validateContext(MINIMAL_TEMPLATE, ctx)).toThrowError(DocumentValidationError);
    try {
      validateContext(MINIMAL_TEMPLATE, ctx);
    } catch (e) {
      expect((e as DocumentValidationError).code).toBe("STALE_INFORME");
    }
  });

  it("throws MISSING_PLACEHOLDER when informe.fecha_seguimiento is missing entirely", () => {
    const ctx = { ...VALID_CONTEXT, informe: undefined };
    expect(() => validateContext(MINIMAL_TEMPLATE, ctx as never)).toThrowError(
      DocumentValidationError
    );
  });
});
