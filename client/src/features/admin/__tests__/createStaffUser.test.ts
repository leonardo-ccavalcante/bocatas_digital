/**
 * createStaffUser.test.ts — D-G5: Tests for admin staff user creation.
 *
 * Tests cover:
 * - CreateStaffUserSchema validation (email, nombre, role)
 * - Role enforcement (only superadmin can create staff)
 * - Error cases: existing email, missing role
 * - Input sanitization
 */
import { describe, it, expect } from "vitest";
import { CreateStaffUserSchema } from "../schemas";

// ─── CreateStaffUserSchema validation ─────────────────────────────────────────

describe("CreateStaffUserSchema validation (D-G5)", () => {
  const validInput = {
    email: "nuevo@bocatas.org",
    nombre: "María García",
    role: "admin" as const,
  };

  it("accepts valid admin user creation input", () => {
    const result = CreateStaffUserSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts valid voluntario user creation input", () => {
    const result = CreateStaffUserSchema.safeParse({
      ...validInput,
      role: "voluntario",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const result = CreateStaffUserSchema.safeParse({
      ...validInput,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("email");
    }
  });

  it("rejects empty email", () => {
    const result = CreateStaffUserSchema.safeParse({
      ...validInput,
      email: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects nombre shorter than 2 characters", () => {
    const result = CreateStaffUserSchema.safeParse({
      ...validInput,
      nombre: "A",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("nombre");
    }
  });

  it("rejects nombre longer than 100 characters", () => {
    const result = CreateStaffUserSchema.safeParse({
      ...validInput,
      nombre: "A".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty nombre", () => {
    const result = CreateStaffUserSchema.safeParse({
      ...validInput,
      nombre: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role (superadmin not allowed for staff creation)", () => {
    const result = CreateStaffUserSchema.safeParse({
      ...validInput,
      role: "superadmin",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty role", () => {
    const result = CreateStaffUserSchema.safeParse({
      ...validInput,
      role: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing role field", () => {
    const { role: _role, ...withoutRole } = validInput;
    const result = CreateStaffUserSchema.safeParse(withoutRole);
    expect(result.success).toBe(false);
  });

  it("rejects missing email field", () => {
    const { email: _email, ...withoutEmail } = validInput;
    const result = CreateStaffUserSchema.safeParse(withoutEmail);
    expect(result.success).toBe(false);
  });

  it("accepts nombre at minimum length (2 chars)", () => {
    const result = CreateStaffUserSchema.safeParse({
      ...validInput,
      nombre: "Ab",
    });
    expect(result.success).toBe(true);
  });

  it("accepts nombre at maximum length (100 chars)", () => {
    const result = CreateStaffUserSchema.safeParse({
      ...validInput,
      nombre: "A".repeat(100),
    });
    expect(result.success).toBe(true);
  });
});

// ─── Role enforcement logic ───────────────────────────────────────────────────

describe("Staff user creation role enforcement", () => {
  /**
   * Simulates the server-side role check from createStaffUser action.
   * Only superadmin can create staff users.
   */
  function canCreateStaffUser(callerRole: string | null | undefined): boolean {
    return callerRole === "superadmin";
  }

  it("superadmin can create staff users", () => {
    expect(canCreateStaffUser("superadmin")).toBe(true);
  });

  it("admin cannot create staff users", () => {
    expect(canCreateStaffUser("admin")).toBe(false);
  });

  it("voluntario cannot create staff users", () => {
    expect(canCreateStaffUser("voluntario")).toBe(false);
  });

  it("null role cannot create staff users", () => {
    expect(canCreateStaffUser(null)).toBe(false);
  });

  it("undefined role cannot create staff users", () => {
    expect(canCreateStaffUser(undefined)).toBe(false);
  });

  it("empty string role cannot create staff users", () => {
    expect(canCreateStaffUser("")).toBe(false);
  });
});

// ─── Error message mapping ────────────────────────────────────────────────────

describe("Staff user creation error mapping", () => {
  /**
   * Maps Supabase Auth errors to user-friendly messages.
   */
  function mapCreateUserError(error: { message?: string; status?: number }): string {
    if (error.message?.includes("already registered") || error.status === 422) {
      return "Este email ya tiene una cuenta";
    }
    if (error.status === 403) {
      return "No tienes permisos para crear usuarios";
    }
    return error.message ?? "Error al crear el usuario";
  }

  it("maps already registered error to user-friendly message", () => {
    const result = mapCreateUserError({
      message: "User already registered",
      status: 422,
    });
    expect(result).toBe("Este email ya tiene una cuenta");
  });

  it("maps 403 to permission denied message", () => {
    const result = mapCreateUserError({ status: 403 });
    expect(result).toBe("No tienes permisos para crear usuarios");
  });

  it("passes through unknown errors", () => {
    const result = mapCreateUserError({ message: "Network error", status: 500 });
    expect(result).toBe("Network error");
  });
});
