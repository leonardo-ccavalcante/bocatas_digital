import { describe, it, expect } from "vitest";
import { diffForAudit } from "../announcements-helpers";
import type { AuditChange } from "../announcements-helpers";

describe("diffForAudit", () => {
  const base = {
    titulo: "Comedor cerrado",
    contenido: "Mañana no habrá comedor.",
    tipo: "cierre_servicio" as const,
    es_urgente: false,
    fecha_inicio: null,
    fecha_fin: null,
    fijado: false,
    imagen_url: null,
  };

  it("returns empty array when nothing changed", () => {
    const result = diffForAudit(base, { ...base });
    expect(result).toEqual([]);
  });

  it("returns one entry when a single string field changes", () => {
    const next = { ...base, titulo: "Comedor CERRADO" };
    const result = diffForAudit(base, next);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<AuditChange>({
      field: "titulo",
      old_value: "Comedor cerrado",
      new_value: "Comedor CERRADO",
    });
  });

  it("returns N entries when N fields change", () => {
    const next = {
      ...base,
      titulo: "Nuevo título",
      contenido: "Nuevo contenido.",
      es_urgente: true,
    };
    const result = diffForAudit(base, next);
    expect(result).toHaveLength(3);
    const fields = result.map((c) => c.field);
    expect(fields).toContain("titulo");
    expect(fields).toContain("contenido");
    expect(fields).toContain("es_urgente");
  });

  it("detects null → string transition on fecha_fin", () => {
    const next = { ...base, fecha_fin: "2026-05-01T00:00:00Z" };
    const result = diffForAudit(base, next);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<AuditChange>({
      field: "fecha_fin",
      old_value: null,
      new_value: "2026-05-01T00:00:00Z",
    });
  });

  it("detects string → null transition on fecha_fin", () => {
    const prev = { ...base, fecha_fin: "2026-05-01T00:00:00Z" };
    const next = { ...base, fecha_fin: null };
    const result = diffForAudit(prev, next);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<AuditChange>({
      field: "fecha_fin",
      old_value: "2026-05-01T00:00:00Z",
      new_value: null,
    });
  });

  it("detects tipo change: 'info' → 'evento'", () => {
    const prev = { ...base, tipo: "info" as const };
    const next = { ...base, tipo: "evento" as const };
    const result = diffForAudit(prev, next);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<AuditChange>({
      field: "tipo",
      old_value: "info",
      new_value: "evento",
    });
  });

  it("detects es_urgente change: false → true", () => {
    const next = { ...base, es_urgente: true };
    const result = diffForAudit(base, next);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<AuditChange>({
      field: "es_urgente",
      old_value: false,
      new_value: true,
    });
  });

  it("does not produce spurious diff for unchanged strings (strict equality)", () => {
    const prev = { ...base, titulo: "foo" };
    const next = { ...base, titulo: "foo" };
    const result = diffForAudit(prev, next);
    expect(result).toEqual([]);
  });

  it("detects fijado change: false → true", () => {
    const next = { ...base, fijado: true };
    const result = diffForAudit(base, next);
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe("fijado");
  });

  it("detects imagen_url change: null → url string", () => {
    const next = { ...base, imagen_url: "https://cdn.example.com/img.jpg" };
    const result = diffForAudit(base, next);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual<AuditChange>({
      field: "imagen_url",
      old_value: null,
      new_value: "https://cdn.example.com/img.jpg",
    });
  });

  it("covers all 8 mutable fields when everything changes", () => {
    const prev = {
      titulo: "A",
      contenido: "B",
      tipo: "info" as const,
      es_urgente: false,
      fecha_inicio: null,
      fecha_fin: null,
      fijado: false,
      imagen_url: null,
    };
    const next = {
      titulo: "A2",
      contenido: "B2",
      tipo: "evento" as const,
      es_urgente: true,
      fecha_inicio: "2026-05-01T00:00:00Z",
      fecha_fin: "2026-05-02T00:00:00Z",
      fijado: true,
      imagen_url: "https://cdn.example.com/img.jpg",
    };
    const result = diffForAudit(prev, next);
    expect(result).toHaveLength(8);
  });
});
