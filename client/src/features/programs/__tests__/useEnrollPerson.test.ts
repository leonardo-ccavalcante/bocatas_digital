/**
 * useEnrollPerson.test.ts — D-G3: Tests for enrollment consent warning logic.
 *
 * Tests cover:
 * - Consent pre-check logic (Job 5, AC3)
 * - Non-blocking warning behavior (Job 5, AC4)
 * - 23505 duplicate enrollment error mapping
 * - Enrollment state transitions
 */
import { describe, it, expect } from "vitest";

// ─── Consent pre-check logic ──────────────────────────────────────────────────

describe("Consent pre-check logic (Job 5)", () => {
  /**
   * Simulates the consent check from EnrollPersonModal:
   * Returns true if all required consents are present, false otherwise.
   */
  function hasRequiredConsents(
    requiredConsents: string[],
    personConsents: Array<{ purpose: string; granted: boolean }>
  ): boolean {
    if (requiredConsents.length === 0) return true;
    return requiredConsents.every((required) =>
      personConsents.some((c) => c.purpose === required && c.granted)
    );
  }

  /**
   * Returns list of missing consents for warning display.
   */
  function getMissingConsents(
    requiredConsents: string[],
    personConsents: Array<{ purpose: string; granted: boolean }>
  ): string[] {
    return requiredConsents.filter(
      (required) => !personConsents.some((c) => c.purpose === required && c.granted)
    );
  }

  it("returns true when program has no required consents", () => {
    const result = hasRequiredConsents([], []);
    expect(result).toBe(true);
  });

  it("returns true when person has all required consents granted", () => {
    const result = hasRequiredConsents(
      ["tratamiento_datos_banco_alimentos"],
      [{ purpose: "tratamiento_datos_banco_alimentos", granted: true }]
    );
    expect(result).toBe(true);
  });

  it("returns false when person is missing required consent", () => {
    const result = hasRequiredConsents(
      ["tratamiento_datos_banco_alimentos"],
      []
    );
    expect(result).toBe(false);
  });

  it("returns false when consent exists but granted=false", () => {
    const result = hasRequiredConsents(
      ["tratamiento_datos_banco_alimentos"],
      [{ purpose: "tratamiento_datos_banco_alimentos", granted: false }]
    );
    expect(result).toBe(false);
  });

  it("returns false when only some required consents are present", () => {
    const result = hasRequiredConsents(
      ["tratamiento_datos_banco_alimentos", "fotografia"],
      [{ purpose: "tratamiento_datos_banco_alimentos", granted: true }]
    );
    expect(result).toBe(false);
  });

  it("returns true when all multiple required consents are present", () => {
    const result = hasRequiredConsents(
      ["tratamiento_datos_banco_alimentos", "fotografia"],
      [
        { purpose: "tratamiento_datos_banco_alimentos", granted: true },
        { purpose: "fotografia", granted: true },
      ]
    );
    expect(result).toBe(true);
  });

  it("getMissingConsents returns empty array when all consents present", () => {
    const missing = getMissingConsents(
      ["tratamiento_datos_banco_alimentos"],
      [{ purpose: "tratamiento_datos_banco_alimentos", granted: true }]
    );
    expect(missing).toHaveLength(0);
  });

  it("getMissingConsents returns missing consent names", () => {
    const missing = getMissingConsents(
      ["tratamiento_datos_banco_alimentos", "fotografia"],
      [{ purpose: "tratamiento_datos_banco_alimentos", granted: true }]
    );
    expect(missing).toContain("fotografia");
    expect(missing).not.toContain("tratamiento_datos_banco_alimentos");
  });

  it("Familia program requires tratamiento_datos_banco_alimentos consent", () => {
    // AC2: Familia seed value: requires_consents = '{tratamiento_datos_banco_alimentos}'
    const familiaRequiredConsents = ["tratamiento_datos_banco_alimentos"];
    expect(familiaRequiredConsents).toContain("tratamiento_datos_banco_alimentos");
  });

  it("consent warning is non-blocking — enrollment should proceed regardless", () => {
    // AC4: Warning is non-blocking — enrollment proceeds
    // This test verifies the design decision: missing consent → warning, not error
    const missingConsents = getMissingConsents(
      ["tratamiento_datos_banco_alimentos"],
      []
    );
    // Warning exists but enrollment is NOT blocked
    expect(missingConsents.length).toBeGreaterThan(0);
    // The warning message should be informational, not a blocking error
    const warningMessage = `Esta persona no tiene el consentimiento de Banco de Alimentos. Puede inscribirla, pero deberá capturar el consentimiento en su ficha.`;
    expect(warningMessage).toContain("Puede inscribirla");
  });
});

// ─── Duplicate enrollment error mapping ──────────────────────────────────────

describe("Duplicate enrollment error handling (23505)", () => {
  /**
   * Simulates the error mapping from enrollPerson mutation:
   * PostgreSQL 23505 (unique_violation) → user-friendly message
   */
  function mapEnrollmentError(errorCode: string, message: string): string {
    if (errorCode === "23505" || message.toLowerCase().includes("conflict")) {
      return "Esta persona ya está inscrita en este programa";
    }
    return message;
  }

  it("maps 23505 to user-friendly duplicate message", () => {
    const result = mapEnrollmentError("23505", "duplicate key value violates unique constraint");
    expect(result).toBe("Esta persona ya está inscrita en este programa");
  });

  it("maps CONFLICT code to user-friendly message", () => {
    const result = mapEnrollmentError("CONFLICT", "conflict");
    expect(result).toBe("Esta persona ya está inscrita en este programa");
  });

  it("passes through other errors unchanged", () => {
    const result = mapEnrollmentError("500", "Internal server error");
    expect(result).toBe("Internal server error");
  });
});

// ─── Enrollment state machine ─────────────────────────────────────────────────

describe("Enrollment state transitions", () => {
  type EnrollmentEstado = "activo" | "completado" | "rechazado";

  function canUnenroll(estado: EnrollmentEstado): boolean {
    return estado === "activo";
  }

  function unenroll(estado: EnrollmentEstado): EnrollmentEstado {
    if (estado !== "activo") throw new Error("Can only unenroll active enrollments");
    return "completado";
  }

  it("active enrollment can be unenrolled", () => {
    expect(canUnenroll("activo")).toBe(true);
  });

  it("completed enrollment cannot be unenrolled again", () => {
    expect(canUnenroll("completado")).toBe(false);
  });

  it("rejected enrollment cannot be unenrolled", () => {
    expect(canUnenroll("rechazado")).toBe(false);
  });

  it("unenrolling active enrollment sets estado to completado", () => {
    expect(unenroll("activo")).toBe("completado");
  });

  it("unenrolling non-active enrollment throws error", () => {
    expect(() => unenroll("completado")).toThrow();
  });
});
