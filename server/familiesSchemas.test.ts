import { describe, it, expect } from "vitest";
import { z } from "zod";

// ─── Inline schema definitions for testing (mirrors client/src/features/families/schemas.ts) ────
const FamilyMemberSchema = z.object({
  person_id: z.string().uuid().optional().nullable(),
  nombre: z.string().min(1, "Nombre obligatorio"),
  apellidos: z.string().min(1, "Apellidos obligatorios"),
  fecha_nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  tipo_documento: z.string().optional().nullable(),
  numero_documento: z.string().optional().nullable(),
  parentesco: z.string().min(1, "Parentesco obligatorio"),
  es_menor: z.boolean().optional().default(false),
});

const FamilyIntakeSchema = z.object({
  titular_id: z.string().uuid("Titular obligatorio"),
  num_adultos: z.number().int().min(1),
  num_menores_18: z.number().int().min(0),
  miembros: z.array(FamilyMemberSchema),
  docs_identidad: z.boolean().default(false),
  padron_recibido: z.boolean().default(false),
  justificante_recibido: z.boolean().default(false),
  informe_social: z.boolean().default(false),
  consent_bocatas: z.boolean().default(false),
  consent_banco_alimentos: z.boolean().default(false),
  alta_en_guf: z.boolean().default(false),
  fecha_alta_guf: z.string().optional(),
  autorizado: z.boolean().default(false),
  persona_recoge: z.string().optional(),
  idioma: z.string().optional(),
});

describe("FamilyMemberSchema", () => {
  it("validates a complete member", () => {
    const result = FamilyMemberSchema.safeParse({
      nombre: "María",
      apellidos: "García López",
      parentesco: "conyuge",
      es_menor: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty nombre", () => {
    const result = FamilyMemberSchema.safeParse({
      nombre: "",
      apellidos: "García",
      parentesco: "hijo",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Nombre obligatorio");
    }
  });

  it("rejects invalid fecha_nacimiento format", () => {
    const result = FamilyMemberSchema.safeParse({
      nombre: "Juan",
      apellidos: "Pérez",
      parentesco: "hijo",
      fecha_nacimiento: "15/03/2010", // wrong format
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid fecha_nacimiento in YYYY-MM-DD format", () => {
    const result = FamilyMemberSchema.safeParse({
      nombre: "Juan",
      apellidos: "Pérez",
      parentesco: "hijo",
      fecha_nacimiento: "2010-03-15",
    });
    expect(result.success).toBe(true);
  });

  it("defaults es_menor to false when not provided", () => {
    const result = FamilyMemberSchema.safeParse({
      nombre: "Ana",
      apellidos: "Martínez",
      parentesco: "hermano",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.es_menor).toBe(false);
    }
  });

  it("accepts null person_id (not yet linked to registry)", () => {
    const result = FamilyMemberSchema.safeParse({
      nombre: "Carlos",
      apellidos: "Ruiz",
      parentesco: "padre",
      person_id: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("FamilyIntakeSchema", () => {
  const validIntake = {
    titular_id: "550e8400-e29b-41d4-a716-446655440000",
    num_adultos: 2,
    num_menores_18: 1,
    miembros: [
      { nombre: "María", apellidos: "García", parentesco: "conyuge" },
    ],
  };

  it("validates a minimal valid intake", () => {
    const result = FamilyIntakeSchema.safeParse(validIntake);
    expect(result.success).toBe(true);
  });

  it("rejects invalid titular_id (not UUID)", () => {
    const result = FamilyIntakeSchema.safeParse({
      ...validIntake,
      titular_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects num_adultos < 1", () => {
    const result = FamilyIntakeSchema.safeParse({
      ...validIntake,
      num_adultos: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects num_menores_18 < 0", () => {
    const result = FamilyIntakeSchema.safeParse({
      ...validIntake,
      num_menores_18: -1,
    });
    expect(result.success).toBe(false);
  });

  it("defaults all boolean fields to false", () => {
    const result = FamilyIntakeSchema.safeParse(validIntake);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.docs_identidad).toBe(false);
      expect(result.data.consent_bocatas).toBe(false);
      expect(result.data.alta_en_guf).toBe(false);
    }
  });

  it("accepts empty miembros array", () => {
    const result = FamilyIntakeSchema.safeParse({
      ...validIntake,
      miembros: [],
    });
    expect(result.success).toBe(true);
  });
});
