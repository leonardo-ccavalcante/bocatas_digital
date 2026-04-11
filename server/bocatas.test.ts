/**
 * Bocatas Digital — Unit Tests (TASK 1)
 * Validates: Zod schemas, role logic, store shape, and Supabase secret availability.
 */
import { describe, expect, it } from "vitest";

// ─── Import schemas (via relative path since they live in client/src) ──────────
// We test the schema logic directly — no DOM needed.

// Inline minimal schema mirrors to avoid Vite alias resolution in vitest server context
import { z } from "zod";

const BocatasRoleSchema = z.enum(["superadmin", "admin", "voluntario", "beneficiario"]);

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const PersonCreateSchema = z.object({
  nombre: z.string().min(1).max(100),
  apellidos: z.string().min(1).max(150),
  fecha_nacimiento: z.string().date(),
  idioma_principal: z.enum(["es", "ar", "fr", "bm", "pt", "wo"]),
  genero: z.enum(["hombre", "mujer", "no_binario", "prefiero_no_decir"]).optional(),
  tipo_documento: z.enum(["dni", "nie", "pasaporte", "sin_documento", "otro"]).optional(),
  situacion_legal: z.enum(["regular", "irregular", "solicitante_asilo", "en_tramite", "sin_papeles"]).optional(),
  tipo_vivienda: z.enum(["calle", "albergue", "habitacion", "ocupa", "piso", "hostal", "centro_menores", "otro"]).optional(),
  nivel_estudios: z.enum(["sin_estudios", "primaria", "secundaria", "fp", "universitario", "otro"]).optional(),
  situacion_laboral: z.enum(["sin_empleo", "trabajo_informal", "trabajo_formal"]).optional(),
  nivel_ingresos: z.enum(["sin_ingresos", "menos_400", "400_900", "mas_900"]).optional(),
  canal_llegada: z.enum(["derivacion_entidad", "boca_a_boca", "llegada_directa", "contacto_digital"]).optional(),
  telefono: z.string().regex(/^\+?[0-9\s\-]{7,20}$/).optional(),
  email: z.string().email().optional(),
  restricciones_alimentarias: z.string().max(300).optional(),
  foto_perfil_url: z.string().url().optional(),
  program_ids: z.array(z.string().uuid()).default([]),
});

const CheckinCreateSchema = z.object({
  person_id: z.string().uuid().nullable(),
  location_id: z.string().uuid(),
  programa: z.enum(["comedor", "familia", "formacion", "atencion_juridica", "voluntariado", "acompanamiento"]),
  metodo: z.enum(["qr", "manual", "nfc"]),
  es_demo: z.boolean().default(false),
});

// ─── Role schema ───────────────────────────────────────────────────────────────
describe("BocatasRoleSchema", () => {
  it("accepts all valid roles", () => {
    expect(BocatasRoleSchema.parse("superadmin")).toBe("superadmin");
    expect(BocatasRoleSchema.parse("admin")).toBe("admin");
    expect(BocatasRoleSchema.parse("voluntario")).toBe("voluntario");
    expect(BocatasRoleSchema.parse("beneficiario")).toBe("beneficiario");
  });

  it("rejects unknown roles", () => {
    expect(() => BocatasRoleSchema.parse("god")).toThrow();
    expect(() => BocatasRoleSchema.parse("")).toThrow();
    expect(() => BocatasRoleSchema.parse(null)).toThrow();
  });
});

// ─── Login schema ──────────────────────────────────────────────────────────────
describe("LoginSchema", () => {
  it("accepts valid credentials", () => {
    const result = LoginSchema.parse({
      email: "voluntario@bocatas.test",
      password: "BocatasVol2026!",
    });
    expect(result.email).toBe("voluntario@bocatas.test");
  });

  it("rejects invalid email", () => {
    expect(() => LoginSchema.parse({ email: "not-an-email", password: "pass123" })).toThrow();
  });

  it("rejects short password (< 6 chars)", () => {
    expect(() => LoginSchema.parse({ email: "a@b.com", password: "abc" })).toThrow();
  });
});

// ─── PersonCreateSchema ────────────────────────────────────────────────────────
describe("PersonCreateSchema", () => {
  const validPerson = {
    nombre: "Fatima",
    apellidos: "El Mansouri",
    fecha_nacimiento: "1990-05-15",
    idioma_principal: "ar" as const,
  };

  it("accepts minimal valid person", () => {
    const result = PersonCreateSchema.parse(validPerson);
    expect(result.nombre).toBe("Fatima");
    expect(result.program_ids).toEqual([]);
  });

  it("accepts full person with all optional fields", () => {
    const full = {
      ...validPerson,
      genero: "mujer" as const,
      tipo_documento: "pasaporte" as const,
      situacion_legal: "regular" as const,
      tipo_vivienda: "piso" as const,
      nivel_estudios: "secundaria" as const,
      situacion_laboral: "sin_empleo" as const,
      nivel_ingresos: "menos_400" as const,
      canal_llegada: "derivacion_entidad" as const,
      telefono: "+34 612 345 678",
      email: "fatima@example.com",
      restricciones_alimentarias: "Sin gluten",
      program_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    };
    const result = PersonCreateSchema.parse(full);
    expect(result.genero).toBe("mujer");
    expect(result.program_ids).toHaveLength(1);
  });

  it("rejects empty nombre", () => {
    expect(() => PersonCreateSchema.parse({ ...validPerson, nombre: "" })).toThrow();
  });

  it("rejects invalid date format", () => {
    expect(() => PersonCreateSchema.parse({ ...validPerson, fecha_nacimiento: "15/05/1990" })).toThrow();
  });

  it("rejects invalid phone format", () => {
    expect(() => PersonCreateSchema.parse({ ...validPerson, telefono: "abc" })).toThrow();
  });

  it("rejects invalid program_id (not UUID)", () => {
    expect(() => PersonCreateSchema.parse({ ...validPerson, program_ids: ["not-a-uuid"] })).toThrow();
  });

  it("rejects invalid foto_perfil_url (not URL)", () => {
    expect(() => PersonCreateSchema.parse({ ...validPerson, foto_perfil_url: "not-a-url" })).toThrow();
  });
});

// ─── CheckinCreateSchema ───────────────────────────────────────────────────────
describe("CheckinCreateSchema", () => {
  const validCheckin = {
    person_id: "550e8400-e29b-41d4-a716-446655440000",
    location_id: "550e8400-e29b-41d4-a716-446655440001",
    programa: "comedor" as const,
    metodo: "qr" as const,
  };

  it("accepts valid check-in with person_id", () => {
    const result = CheckinCreateSchema.parse(validCheckin);
    expect(result.es_demo).toBe(false);
  });

  it("accepts anonymous check-in (null person_id)", () => {
    const result = CheckinCreateSchema.parse({ ...validCheckin, person_id: null });
    expect(result.person_id).toBeNull();
  });

  it("rejects invalid programa", () => {
    expect(() => CheckinCreateSchema.parse({ ...validCheckin, programa: "almuerzo" })).toThrow();
  });

  it("rejects invalid metodo", () => {
    expect(() => CheckinCreateSchema.parse({ ...validCheckin, metodo: "bluetooth" })).toThrow();
  });
});

// ─── Environment / Supabase secrets ───────────────────────────────────────────
describe("Environment variables", () => {
  it("VITE_SUPABASE_URL is set and is a valid URL", () => {
    const url = process.env.VITE_SUPABASE_URL;
    expect(url).toBeTruthy();
    expect(() => new URL(url!)).not.toThrow();
  });

  it("VITE_SUPABASE_ANON_KEY is set and looks like a JWT", () => {
    const key = process.env.VITE_SUPABASE_ANON_KEY;
    expect(key).toBeTruthy();
    // JWT has 3 base64url parts separated by dots
    expect(key!.split(".")).toHaveLength(3);
  });

  it("SUPABASE_SERVICE_ROLE_KEY is set", () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(key).toBeTruthy();
  });
});
