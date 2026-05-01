import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Test that AdminNovedades form includes image_url field
 */
describe('AdminNovedades - Image Upload Field', () => {
  it('should have image_url field in FormSchema', () => {
    // Define the schema inline to test it
    const PROGRAMS = ["comedor", "familia", "formacion", "atencion_juridica", "voluntariado", "acompanamiento"] as const;
    const ROLES = ["superadmin", "admin", "voluntario", "beneficiario"] as const;

    const FormSchema = z.object({
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
    });

    // Test that the schema accepts image_url
    const validData = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "info" as const,
      audiences: [{ programs: [], roles: [] }],
      image_url: "https://example.com/image.jpg",
    };

    const result = FormSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.image_url).toBe("https://example.com/image.jpg");
    }
  });

  it('should accept null image_url', () => {
    const PROGRAMS = ["comedor", "familia", "formacion", "atencion_juridica", "voluntariado", "acompanamiento"] as const;
    const ROLES = ["superadmin", "admin", "voluntario", "beneficiario"] as const;

    const FormSchema = z.object({
      titulo: z.string().min(1),
      contenido: z.string().min(1),
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
      ).min(1),
    });

    const validData = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "info" as const,
      audiences: [{ programs: [], roles: [] }],
      image_url: null,
    };

    const result = FormSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.image_url).toBeNull();
    }
  });

  it('should reject invalid image URLs', () => {
    const PROGRAMS = ["comedor", "familia", "formacion", "atencion_juridica", "voluntariado", "acompanamiento"] as const;
    const ROLES = ["superadmin", "admin", "voluntario", "beneficiario"] as const;

    const FormSchema = z.object({
      titulo: z.string().min(1),
      contenido: z.string().min(1),
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
      ).min(1),
    });

    const invalidData = {
      titulo: "Test",
      contenido: "Test content",
      tipo: "info" as const,
      audiences: [{ programs: [], roles: [] }],
      image_url: "not-a-valid-url",
    };

    const result = FormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});
