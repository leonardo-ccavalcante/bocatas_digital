/**
 * TASK2 — Vitest test suite
 * Tests: Zod schemas, imageUtils, wizard step validation, duplicate check logic
 */
import { describe, it, expect } from "vitest";
import {
  PersonCreateSchema,
  OcrExtractedSchema,
  ConsentTemplateSchema,
  ProgramSchema,
  DuplicateCandidateSchema,
} from "../client/src/features/persons/schemas";

// ─── PersonCreateSchema ───────────────────────────────────────────────────────

describe("PersonCreateSchema", () => {
  const minimalValid = {
    canal_llegada: "boca_a_boca",
    nombre: "María",
    apellidos: "García López",
    fecha_nacimiento: "1985-03-15",
    idioma_principal: "es",
    program_ids: [],
  };

  it("accepts a minimal valid person", () => {
    const result = PersonCreateSchema.safeParse(minimalValid);
    expect(result.success).toBe(true);
  });

  it("rejects missing required canal_llegada", () => {
    const { canal_llegada: _canal, ...rest } = minimalValid;
    void _canal;
    const result = PersonCreateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing nombre", () => {
    const result = PersonCreateSchema.safeParse({ ...minimalValid, nombre: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = PersonCreateSchema.safeParse({ ...minimalValid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("accepts valid email", () => {
    const result = PersonCreateSchema.safeParse({ ...minimalValid, email: "test@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid canal_llegada value", () => {
    const result = PersonCreateSchema.safeParse({ ...minimalValid, canal_llegada: "invalid_canal" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid canal_llegada values", () => {
    const validCanales = [
      "boca_a_boca", "cruz_roja", "servicios_sociales", "otra_ong",
      "internet", "presencial_directo", "whatsapp", "telefono",
      "email", "instagram", "retorno_bocatas", "otros",
    ];
    for (const canal of validCanales) {
      const result = PersonCreateSchema.safeParse({ ...minimalValid, canal_llegada: canal });
      expect(result.success, `canal_llegada '${canal}' should be valid`).toBe(true);
    }
  });

  it("rejects future fecha_nacimiento", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const result = PersonCreateSchema.safeParse({
      ...minimalValid,
      fecha_nacimiento: future.toISOString().split("T")[0],
    });
    expect(result.success).toBe(false);
  });

  it("rejects fecha_nacimiento for person under 5 years old", () => {
    const tooYoung = new Date();
    tooYoung.setFullYear(tooYoung.getFullYear() - 3);
    const result = PersonCreateSchema.safeParse({
      ...minimalValid,
      fecha_nacimiento: tooYoung.toISOString().split("T")[0],
    });
    expect(result.success).toBe(false);
  });

  it("accepts program_ids as empty array", () => {
    const result = PersonCreateSchema.safeParse({ ...minimalValid, program_ids: [] });
    expect(result.success).toBe(true);
  });

  it("accepts multiple program_ids", () => {
    const result = PersonCreateSchema.safeParse({
      ...minimalValid,
      program_ids: [
        "123e4567-e89b-12d3-a456-426614174000",
        "987fcdeb-51a2-43f7-b012-345678901234",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID program_ids", () => {
    const result = PersonCreateSchema.safeParse({
      ...minimalValid,
      program_ids: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });
});

// ─── OcrExtractedSchema ───────────────────────────────────────────────────────

describe("OcrExtractedSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = OcrExtractedSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial OCR data", () => {
    const result = OcrExtractedSchema.safeParse({
      nombre: "Juan",
      apellidos: "Pérez",
      tipo_documento: "dni",
      numero_documento: "12345678A",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid tipo_documento", () => {
    const result = OcrExtractedSchema.safeParse({ tipo_documento: "cedula" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid tipo_documento values", () => {
    for (const tipo of ["dni", "nie", "pasaporte", "otro"]) {
      const result = OcrExtractedSchema.safeParse({ tipo_documento: tipo });
      expect(result.success, `tipo_documento '${tipo}' should be valid`).toBe(true);
    }
  });
});

// ─── ConsentTemplateSchema ────────────────────────────────────────────────────

describe("ConsentTemplateSchema", () => {
  const validTemplate = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    purpose: "tratamiento_datos_bocatas",
    idioma: "es",
    version: "1.0",
    text_content: "Autorizo el tratamiento de mis datos personales...",
    is_active: true,
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("accepts a valid consent template", () => {
    const result = ConsentTemplateSchema.safeParse(validTemplate);
    expect(result.success).toBe(true);
  });

  it("rejects template without id", () => {
    const { id: _id, ...rest } = validTemplate;
    void _id;
    const result = ConsentTemplateSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts all valid idioma values", () => {
    for (const idioma of ["es", "ar", "fr", "bm"]) {
      const result = ConsentTemplateSchema.safeParse({ ...validTemplate, idioma });
      expect(result.success, `idioma '${idioma}' should be valid`).toBe(true);
    }
  });
});

// ─── ProgramSchema ────────────────────────────────────────────────────────────

describe("ProgramSchema", () => {
  const validProgram = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    slug: "comedor-social",
    name: "Comedor Social",
    icon: "🍽️",
    is_default: true,
    is_active: true,
    display_order: 1,
  };

  it("accepts a valid program", () => {
    const result = ProgramSchema.safeParse(validProgram);
    expect(result.success).toBe(true);
  });

  it("accepts program with optional description", () => {
    const result = ProgramSchema.safeParse({ ...validProgram, description: "Comida diaria" });
    expect(result.success).toBe(true);
  });

  it("rejects program without slug", () => {
    const { slug: _slug, ...rest } = validProgram;
    void _slug;
    const result = ProgramSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

// ─── DuplicateCandidateSchema ─────────────────────────────────────────────────

describe("DuplicateCandidateSchema", () => {
  it("accepts a valid duplicate candidate", () => {
    const result = DuplicateCandidateSchema.safeParse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      nombre: "María",
      apellidos: "García",
      similarity: 0.87,
    });
    expect(result.success).toBe(true);
  });

  it("rejects similarity > 1", () => {
    const result = DuplicateCandidateSchema.safeParse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      nombre: "María",
      apellidos: "García",
      similarity: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative similarity", () => {
    const result = DuplicateCandidateSchema.safeParse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      nombre: "María",
      apellidos: "García",
      similarity: -0.1,
    });
    expect(result.success).toBe(false);
  });
});

// ─── imageUtils ───────────────────────────────────────────────────────────────

describe("imageUtils — base64ToBlob", () => {
  it("converts base64 string to Blob with correct MIME type", async () => {
    // 1x1 white JPEG in base64
    const base64 =
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEB/8QAIRAAAQMEAgMAAAAAAAAAAAAAAQIDBBEhMQUSQVH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8Aq2la3bKqoqKmqJpZZXFznuOST7k96KKAf//Z";
    // Dynamic import to avoid server-side issues in vitest
    const { base64ToBlob } = await import("../client/src/features/persons/utils/imageUtils");
    const blob = base64ToBlob(base64, "image/jpeg");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("base64ToFile returns a File with correct name and type", async () => {
    const { base64ToFile } = await import("../client/src/features/persons/utils/imageUtils");
    const base64 = "AAAA"; // minimal valid base64
    const file = base64ToFile(base64, "test.jpg", "image/jpeg");
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("test.jpg");
    expect(file.type).toBe("image/jpeg");
  });
});
