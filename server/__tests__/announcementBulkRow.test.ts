import { describe, it, expect } from "vitest";
import { validateBulkRow } from "../announcements-helpers";

describe("validateBulkRow", () => {
  const validRow = {
    titulo: "Comedor cerrado mañana",
    contenido: "Por obras imprevistas el comedor no abrirá.",
    tipo: "cierre_servicio",
    es_urgente: "true",
    fecha_inicio: "2026-05-01T08:00:00Z",
    fecha_fin: "2026-05-02T00:00:00Z",
    fijado: "false",
    audiencias: "voluntario:comedor;admin:*",
  };

  it("returns ok=true with fully parsed row when all fields are valid", () => {
    const result = validateBulkRow(validRow, 1);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.parsed).toBeDefined();
    expect(result.parsed!.titulo).toBe("Comedor cerrado mañana");
    expect(result.parsed!.tipo).toBe("cierre_servicio");
    expect(result.parsed!.es_urgente).toBe(true);
    expect(result.parsed!.fijado).toBe(false);
    expect(result.parsed!.audiencias).toHaveLength(2);
  });

  it("returns error for missing titulo", () => {
    const result = validateBulkRow({ ...validRow, titulo: undefined }, 2);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === "titulo")).toBe(true);
    expect(result.errors.every((e) => e.row === 2)).toBe(true);
  });

  it("returns error for titulo exceeding 200 chars", () => {
    const result = validateBulkRow(
      { ...validRow, titulo: "x".repeat(201) },
      3
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === "titulo")).toBe(true);
  });

  it("returns error for missing contenido", () => {
    const result = validateBulkRow({ ...validRow, contenido: "" }, 4);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === "contenido")).toBe(true);
  });

  it("returns error for contenido exceeding 5000 chars", () => {
    const result = validateBulkRow(
      { ...validRow, contenido: "x".repeat(5001) },
      5
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === "contenido")).toBe(true);
  });

  it("rejects legacy tipo='cierre' with explicit message naming the legacy value", () => {
    const result = validateBulkRow({ ...validRow, tipo: "cierre" }, 6);
    expect(result.ok).toBe(false);
    const tipoError = result.errors.find((e) => e.field === "tipo");
    expect(tipoError).toBeDefined();
    expect(tipoError!.message).toMatch(/cierre/);
    expect(tipoError!.message).toMatch(/no permitido|legacy|deprecated|no válido/i);
  });

  it("rejects legacy tipo='urgente' with explicit message naming the legacy value", () => {
    const result = validateBulkRow({ ...validRow, tipo: "urgente" }, 7);
    expect(result.ok).toBe(false);
    const tipoError = result.errors.find((e) => e.field === "tipo");
    expect(tipoError).toBeDefined();
    expect(tipoError!.message).toMatch(/urgente/);
  });

  it("trims trailing/leading whitespace on tipo: 'evento ' is valid", () => {
    const result = validateBulkRow({ ...validRow, tipo: "evento " }, 8);
    expect(result.ok).toBe(true);
    expect(result.parsed!.tipo).toBe("evento");
  });

  it("returns error for completely unknown tipo", () => {
    const result = validateBulkRow({ ...validRow, tipo: "notreal" }, 9);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === "tipo")).toBe(true);
  });

  it("coerces es_urgente='True' (mixed case) to true", () => {
    const result = validateBulkRow({ ...validRow, es_urgente: "True" }, 10);
    expect(result.ok).toBe(true);
    expect(result.parsed!.es_urgente).toBe(true);
  });

  it("coerces es_urgente='SÍ' (with accent + caps) to true", () => {
    const result = validateBulkRow({ ...validRow, es_urgente: "SÍ" }, 11);
    expect(result.ok).toBe(true);
    expect(result.parsed!.es_urgente).toBe(true);
  });

  it("coerces es_urgente='si' to true", () => {
    const result = validateBulkRow({ ...validRow, es_urgente: "si" }, 12);
    expect(result.ok).toBe(true);
    expect(result.parsed!.es_urgente).toBe(true);
  });

  it("coerces es_urgente='0' to false", () => {
    const result = validateBulkRow({ ...validRow, es_urgente: "0" }, 13);
    expect(result.ok).toBe(true);
    expect(result.parsed!.es_urgente).toBe(false);
  });

  it("coerces es_urgente='no' to false", () => {
    const result = validateBulkRow({ ...validRow, es_urgente: "no" }, 14);
    expect(result.ok).toBe(true);
    expect(result.parsed!.es_urgente).toBe(false);
  });

  it("defaults es_urgente to false when undefined", () => {
    const result = validateBulkRow({ ...validRow, es_urgente: undefined }, 15);
    expect(result.ok).toBe(true);
    expect(result.parsed!.es_urgente).toBe(false);
  });

  it("defaults es_urgente to false when empty string", () => {
    const result = validateBulkRow({ ...validRow, es_urgente: "" }, 16);
    expect(result.ok).toBe(true);
    expect(result.parsed!.es_urgente).toBe(false);
  });

  it("returns error for unrecognized es_urgente='maybe'", () => {
    const result = validateBulkRow({ ...validRow, es_urgente: "maybe" }, 17);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === "es_urgente")).toBe(true);
  });

  it("returns error when fecha_fin < fecha_inicio", () => {
    const result = validateBulkRow(
      {
        ...validRow,
        fecha_inicio: "2026-05-02T00:00:00Z",
        fecha_fin: "2026-05-01T00:00:00Z",
      },
      18
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === "fecha_fin")).toBe(true);
  });

  it("accepts both fecha_inicio and fecha_fin as null/undefined (optional)", () => {
    const result = validateBulkRow(
      { ...validRow, fecha_inicio: undefined, fecha_fin: undefined },
      19
    );
    expect(result.ok).toBe(true);
    expect(result.parsed!.fecha_inicio).toBeNull();
    expect(result.parsed!.fecha_fin).toBeNull();
  });

  it("returns error for invalid ISO date string", () => {
    const result = validateBulkRow(
      { ...validRow, fecha_inicio: "not-a-date" },
      20
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === "fecha_inicio")).toBe(true);
  });

  it("returns error when audiencias is empty string", () => {
    const result = validateBulkRow({ ...validRow, audiencias: "" }, 21);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === "audiencias")).toBe(true);
  });

  it("parses audiencias='admin:*;voluntario:comedor' to 2 rules", () => {
    const result = validateBulkRow(
      { ...validRow, audiencias: "admin:*;voluntario:comedor" },
      22
    );
    expect(result.ok).toBe(true);
    expect(result.parsed!.audiencias).toHaveLength(2);
  });

  it("returns error (not ok) when audiencias contains unknown role", () => {
    const result = validateBulkRow(
      { ...validRow, audiencias: "unknownrole:comedor" },
      23
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.field === "audiencias")).toBe(true);
  });

  it("threads lineNumber into every error", () => {
    const result = validateBulkRow(
      { ...validRow, titulo: undefined, contenido: "", tipo: "bad" },
      42
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.every((e) => e.row === 42)).toBe(true);
  });

  it("parsed is absent (undefined) when ok=false", () => {
    const result = validateBulkRow({ ...validRow, titulo: undefined }, 24);
    expect(result.ok).toBe(false);
    expect(result.parsed).toBeUndefined();
  });
});
