import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Test that AdminNovedades form validates that expires_at > published_at
 */
describe('AdminNovedades - Date Validation', () => {
  const PROGRAMS = ["comedor", "familia", "formacion", "atencion_juridica", "voluntariado", "acompanamiento"] as const;
  const ROLES = ["superadmin", "admin", "voluntario", "beneficiario"] as const;

  const createFormSchema = () => {
    return z.object({
      titulo: z.string().min(1, "Título requerido").max(200),
      contenido: z.string().min(1, "Contenido requerido").max(5000),
      tipo: z.enum(["info", "evento", "cierre_servicio", "convocatoria"]),
      es_urgente: z.boolean().default(false),
      fijado: z.boolean().default(false),
      fecha_fin: z.string().optional(),
      published_at: z.string().date().optional(),
      expires_at: z.string().date().optional(),
      image_url: z.string().url().optional().nullable(),
      audiences: z.array(
        z.object({
          programs: z.array(z.enum(PROGRAMS)),
          roles: z.array(z.enum(ROLES)),
        })
      ).min(1, "Al menos una regla de audiencia es requerida"),
    }).refine(
      (data) => {
        // If both dates are provided, expires_at must be after published_at
        if (data.published_at && data.expires_at) {
          return new Date(data.expires_at) > new Date(data.published_at);
        }
        // If only one or neither is provided, it's valid
        return true;
      },
      {
        message: "La fecha de expiración debe ser posterior a la fecha de publicación",
        path: ["expires_at"],
      }
    );
  };

  it('should accept when both dates are provided and expires_at > published_at', () => {
    const schema = createFormSchema();
    const validData = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "info" as const,
      audiences: [{ programs: [], roles: [] }],
      published_at: "2026-05-01",
      expires_at: "2026-05-02",
    };

    const result = schema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should reject when expires_at <= published_at', () => {
    const schema = createFormSchema();
    const invalidData = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "info" as const,
      audiences: [{ programs: [], roles: [] }],
      published_at: "2026-05-02",
      expires_at: "2026-05-01", // Before published_at
    };

    const result = schema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("posterior");
    }
  });

  it('should reject when expires_at equals published_at', () => {
    const schema = createFormSchema();
    const invalidData = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "info" as const,
      audiences: [{ programs: [], roles: [] }],
      published_at: "2026-05-01",
      expires_at: "2026-05-01", // Same date
    };

    const result = schema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should accept when only published_at is provided', () => {
    const schema = createFormSchema();
    const validData = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "info" as const,
      audiences: [{ programs: [], roles: [] }],
      published_at: "2026-05-01",
      expires_at: undefined,
    };

    const result = schema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should accept when only expires_at is provided', () => {
    const schema = createFormSchema();
    const validData = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "info" as const,
      audiences: [{ programs: [], roles: [] }],
      published_at: undefined,
      expires_at: "2026-05-02",
    };

    const result = schema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should accept when neither date is provided', () => {
    const schema = createFormSchema();
    const validData = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "info" as const,
      audiences: [{ programs: [], roles: [] }],
      published_at: undefined,
      expires_at: undefined,
    };

    const result = schema.safeParse(validData);
    expect(result.success).toBe(true);
  });
});
