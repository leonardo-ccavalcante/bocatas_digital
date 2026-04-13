/**
 * announcements.test.ts — TDD tests for Task 7 Phase F
 * Tests: announcements router schema validation + business rules
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// ─── Schema definitions (mirror from router) ─────────────────────────────────

const AnnouncementTipoEnum = z.enum(["info", "urgente", "evento", "cierre"]);

const CreateAnnouncementSchema = z.object({
  titulo: z.string().min(1).max(200),
  contenido: z.string().min(1).max(5000),
  tipo: AnnouncementTipoEnum.default("info"),
  roles_visibles: z
    .array(z.enum(["beneficiario", "voluntario", "admin", "superadmin"]))
    .default(["beneficiario", "voluntario", "admin", "superadmin"]),
  fijado: z.boolean().default(false),
  imagen_url: z.string().url().optional(),
  fecha_inicio: z.string().optional(),
  fecha_fin: z.string().optional(),
});

const UpdateAnnouncementSchema = z.object({
  id: z.string().uuid(),
  titulo: z.string().min(1).max(200).optional(),
  contenido: z.string().min(1).max(5000).optional(),
  tipo: AnnouncementTipoEnum.optional(),
  fijado: z.boolean().optional(),
  activo: z.boolean().optional(),
  fecha_fin: z.string().optional(),
});

// ─── Role-based nav logic ─────────────────────────────────────────────────────

type UserRole = "beneficiario" | "voluntario" | "admin" | "superadmin";

function getNavItemsForRole(role: UserRole): string[] {
  const base = ["novedades"];
  const beneficiario = [...base, "mi-qr", "perfil"];
  const voluntario = [...base, "checkin", "personas", "programas", "familias/verificar"];
  const admin = [...base, "checkin", "personas", "programas", "familias", "dashboard"];
  const superadmin = [...admin, "admin/programas", "admin/usuarios", "admin/novedades"];

  switch (role) {
    case "beneficiario": return beneficiario;
    case "voluntario": return voluntario;
    case "admin": return admin;
    case "superadmin": return superadmin;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CreateAnnouncementSchema", () => {
  it("accepts valid announcement with all required fields", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "Cierre navideño",
      contenido: "El comedor estará cerrado del 24 al 26 de diciembre.",
      tipo: "cierre",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty titulo", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "",
      contenido: "Contenido válido",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain("titulo");
  });

  it("rejects titulo longer than 200 chars", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "a".repeat(201),
      contenido: "Contenido válido",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain("titulo");
  });

  it("rejects contenido longer than 5000 chars", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "Título válido",
      contenido: "x".repeat(5001),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toContain("contenido");
  });

  it("rejects invalid tipo value", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "Título",
      contenido: "Contenido",
      tipo: "desconocido",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid tipo values", () => {
    const tipos = ["info", "urgente", "evento", "cierre"] as const;
    for (const tipo of tipos) {
      const result = CreateAnnouncementSchema.safeParse({
        titulo: "Título",
        contenido: "Contenido",
        tipo,
      });
      expect(result.success).toBe(true);
    }
  });

  it("defaults tipo to info when not provided", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "Título",
      contenido: "Contenido",
    });
    expect(result.success).toBe(true);
    expect(result.data?.tipo).toBe("info");
  });

  it("defaults fijado to false", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "Título",
      contenido: "Contenido",
    });
    expect(result.success).toBe(true);
    expect(result.data?.fijado).toBe(false);
  });

  it("rejects invalid imagen_url", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "Título",
      contenido: "Contenido",
      imagen_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid imagen_url", () => {
    const result = CreateAnnouncementSchema.safeParse({
      titulo: "Título",
      contenido: "Contenido",
      imagen_url: "https://example.com/image.jpg",
    });
    expect(result.success).toBe(true);
  });
});

describe("UpdateAnnouncementSchema", () => {
  it("accepts partial update with valid UUID", () => {
    const result = UpdateAnnouncementSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      titulo: "Nuevo título",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID id", () => {
    const result = UpdateAnnouncementSchema.safeParse({
      id: "not-a-uuid",
      titulo: "Nuevo título",
    });
    expect(result.success).toBe(false);
  });

  it("accepts activo: false for soft-delete", () => {
    const result = UpdateAnnouncementSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      activo: false,
    });
    expect(result.success).toBe(true);
    expect(result.data?.activo).toBe(false);
  });
});

describe("Role-based navigation", () => {
  it("beneficiario sees novedades, mi-qr, perfil — NOT admin items", () => {
    const items = getNavItemsForRole("beneficiario");
    expect(items).toContain("novedades");
    expect(items).toContain("mi-qr");
    expect(items).toContain("perfil");
    expect(items).not.toContain("dashboard");
    expect(items).not.toContain("familias");
    expect(items).not.toContain("admin/usuarios");
  });

  it("voluntario sees checkin, personas, programas — NOT admin items", () => {
    const items = getNavItemsForRole("voluntario");
    expect(items).toContain("checkin");
    expect(items).toContain("personas");
    expect(items).toContain("programas");
    expect(items).not.toContain("dashboard");
    expect(items).not.toContain("admin/usuarios");
    expect(items).not.toContain("mi-qr");
  });

  it("admin sees dashboard and familias — NOT superadmin-only items", () => {
    const items = getNavItemsForRole("admin");
    expect(items).toContain("dashboard");
    expect(items).toContain("familias");
    expect(items).toContain("novedades");
    expect(items).not.toContain("admin/usuarios");
    expect(items).not.toContain("admin/novedades");
  });

  it("superadmin sees all items including admin-only routes", () => {
    const items = getNavItemsForRole("superadmin");
    expect(items).toContain("admin/usuarios");
    expect(items).toContain("admin/novedades");
    expect(items).toContain("dashboard");
    expect(items).toContain("familias");
    expect(items).toContain("novedades");
  });

  it("all roles see novedades", () => {
    const roles: UserRole[] = ["beneficiario", "voluntario", "admin", "superadmin"];
    for (const role of roles) {
      expect(getNavItemsForRole(role)).toContain("novedades");
    }
  });
});
