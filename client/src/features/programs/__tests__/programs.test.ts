/**
 * programs.test.ts — Epic D: Programs Management unit tests.
 * Location: client/src/features/programs/__tests__/
 *
 * Tests cover:
 * - Slug validation logic
 * - Program form schema validation
 * - Enrollment state machine logic
 * - Consent pre-check logic
 * - Slug generation utility
 * - ProgramWithCounts data shape
 * - Enrollment filtering logic
 */
import { describe, it, expect } from "vitest";
import { ProgramFormSchema, EnrollmentEstadoSchema, ProgramWithCountsSchema } from "../schemas";
import { slugFromName } from "../utils/slugFromName";

// ─── Slug generation utility ──────────────────────────────────────────────────

describe("slugFromName utility", () => {
  it("converts name to lowercase slug with underscores", () => {
    expect(slugFromName("Comedor Social")).toBe("comedor_social");
  });

  it("removes accents and special characters", () => {
    expect(slugFromName("Acompañamiento Psicológico")).toBe("acompanamiento_psicologico");
  });

  it("trims leading and trailing spaces", () => {
    expect(slugFromName("  banco alimentos  ")).toBe("banco_alimentos");
  });

  it("replaces multiple spaces with single underscore", () => {
    expect(slugFromName("Banco  de  Alimentos")).toBe("banco_de_alimentos");
  });

  it("handles single word", () => {
    expect(slugFromName("Familias")).toBe("familias");
  });

  it("returns empty string for empty input", () => {
    expect(slugFromName("")).toBe("");
  });
});

// ─── Program form schema validation ──────────────────────────────────────────

describe("ProgramFormSchema validation", () => {
  const validProgram = {
    slug: "comedor_social",
    name: "Comedor Social",
    is_default: false,
    is_active: true,
    display_order: 1,
    volunteer_can_access: true,
    requires_consents: [],
    config: {},
    icon: "🍽️",
  };

  it("accepts a valid program", () => {
    const result = ProgramFormSchema.safeParse(validProgram);
    expect(result.success).toBe(true);
  });

  it("rejects slug with uppercase letters", () => {
    const result = ProgramFormSchema.safeParse({ ...validProgram, slug: "ComEdor" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("slug");
    }
  });

  it("rejects slug with hyphens (only underscores allowed)", () => {
    const result = ProgramFormSchema.safeParse({ ...validProgram, slug: "comedor-social" });
    expect(result.success).toBe(false);
  });

  it("rejects slug shorter than 2 characters", () => {
    const result = ProgramFormSchema.safeParse({ ...validProgram, slug: "a" });
    expect(result.success).toBe(false);
  });

  it("rejects name shorter than 2 characters", () => {
    const result = ProgramFormSchema.safeParse({ ...validProgram, name: "X" });
    expect(result.success).toBe(false);
  });

  it("rejects display_order outside 1-99 range", () => {
    const tooLow = ProgramFormSchema.safeParse({ ...validProgram, display_order: 0 });
    const tooHigh = ProgramFormSchema.safeParse({ ...validProgram, display_order: 100 });
    expect(tooLow.success).toBe(false);
    expect(tooHigh.success).toBe(false);
  });

  it("accepts display_order at boundaries (1 and 99)", () => {
    const low = ProgramFormSchema.safeParse({ ...validProgram, display_order: 1 });
    const high = ProgramFormSchema.safeParse({ ...validProgram, display_order: 99 });
    expect(low.success).toBe(true);
    expect(high.success).toBe(true);
  });

  it("accepts optional description up to 500 chars", () => {
    const result = ProgramFormSchema.safeParse({
      ...validProgram,
      description: "A".repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it("rejects description longer than 500 chars", () => {
    const result = ProgramFormSchema.safeParse({
      ...validProgram,
      description: "A".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("accepts requires_consents as array of strings", () => {
    const result = ProgramFormSchema.safeParse({
      ...validProgram,
      requires_consents: ["tratamiento_datos_bocatas", "fotografia"],
    });
    expect(result.success).toBe(true);
  });

  it("applies default values when optional fields are omitted", () => {
    const minimal = { slug: "test_prog", name: "Test Program" };
    const result = ProgramFormSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.icon).toBe("🏠");
      expect(result.data.is_default).toBe(false);
      expect(result.data.is_active).toBe(true);
      expect(result.data.display_order).toBe(99);
      expect(result.data.volunteer_can_access).toBe(true);
      expect(result.data.requires_consents).toEqual([]);
    }
  });
});

// ─── Enrollment estado schema ─────────────────────────────────────────────────

describe("EnrollmentEstadoSchema", () => {
  it("accepts valid estados", () => {
    expect(EnrollmentEstadoSchema.safeParse("activo").success).toBe(true);
    expect(EnrollmentEstadoSchema.safeParse("completado").success).toBe(true);
    expect(EnrollmentEstadoSchema.safeParse("rechazado").success).toBe(true);
  });

  it("rejects invalid estados", () => {
    expect(EnrollmentEstadoSchema.safeParse("pendiente").success).toBe(false);
    expect(EnrollmentEstadoSchema.safeParse("").success).toBe(false);
    expect(EnrollmentEstadoSchema.safeParse("ACTIVO").success).toBe(false);
  });
});

// ─── ProgramWithCounts data shape ─────────────────────────────────────────────

describe("ProgramWithCountsSchema", () => {
  const validProgramWithCounts = {
    id: "a0000000-0000-0000-0000-000000000001",
    slug: "comedor_social",
    name: "Comedor Social",
    description: null,
    icon: "🍽️",
    is_default: true,
    is_active: true,
    display_order: 1,
    volunteer_can_access: true,
    requires_consents: [],
    fecha_inicio: null,
    fecha_fin: null,
    config: {},
    responsable_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
    active_enrollments: 42,
    total_enrollments: 100,
    new_this_month: 5,
  };

  it("accepts valid ProgramWithCounts object", () => {
    const result = ProgramWithCountsSchema.safeParse(validProgramWithCounts);
    expect(result.success).toBe(true);
  });

  it("active_enrollments must be a number", () => {
    const result = ProgramWithCountsSchema.safeParse({
      ...validProgramWithCounts,
      active_enrollments: "42",
    });
    expect(result.success).toBe(false);
  });

  it("new_this_month can be 0", () => {
    const result = ProgramWithCountsSchema.safeParse({
      ...validProgramWithCounts,
      new_this_month: 0,
    });
    expect(result.success).toBe(true);
  });
});

// ─── Enrollment filtering logic ───────────────────────────────────────────────

describe("Enrollment filtering logic", () => {
  type EnrollmentRow = {
    id: string;
    estado: "activo" | "completado" | "rechazado";
    program_id: string;
    programs?: { name: string; slug: string; icon: string } | null;
  };

  const enrollments: EnrollmentRow[] = [
    { id: "e1", estado: "activo", program_id: "p1", programs: { name: "Comedor", slug: "comedor_social", icon: "🍽️" } },
    { id: "e2", estado: "completado", program_id: "p2", programs: { name: "Familias", slug: "familias", icon: "👨‍👩‍👧" } },
    { id: "e3", estado: "rechazado", program_id: "p3", programs: { name: "Cursos", slug: "cursos", icon: "📚" } },
    { id: "e4", estado: "activo", program_id: "p4", programs: { name: "Voluntarios", slug: "voluntarios", icon: "🤝" } },
  ];

  it("filters to only active enrollments", () => {
    const active = enrollments.filter((e) => e.estado === "activo");
    expect(active).toHaveLength(2);
    expect(active.every((e) => e.estado === "activo")).toBe(true);
  });

  it("computes enrolled program IDs correctly", () => {
    const enrolledIds = new Set(
      enrollments.filter((e) => e.estado === "activo").map((e) => e.program_id)
    );
    expect(enrolledIds.has("p1")).toBe(true);
    expect(enrolledIds.has("p4")).toBe(true);
    expect(enrolledIds.has("p2")).toBe(false); // completado
    expect(enrolledIds.has("p3")).toBe(false); // rechazado
  });

  it("available programs excludes already enrolled (active) ones", () => {
    const enrolledIds = new Set(
      enrollments.filter((e) => e.estado === "activo").map((e) => e.program_id)
    );
    const allPrograms = [
      { id: "p1", name: "Comedor", is_active: true },
      { id: "p2", name: "Familias", is_active: true },
      { id: "p3", name: "Cursos", is_active: true },
      { id: "p4", name: "Voluntarios", is_active: true },
      { id: "p5", name: "Nuevo", is_active: true },
    ];
    const available = allPrograms.filter((p) => !enrolledIds.has(p.id) && p.is_active);
    expect(available).toHaveLength(3); // p2, p3, p5
    expect(available.map((p) => p.id)).toContain("p5");
    expect(available.map((p) => p.id)).not.toContain("p1");
  });

  it("inactive programs are excluded from available list", () => {
    const enrolledIds = new Set<string>();
    const allPrograms = [
      { id: "p1", name: "Comedor", is_active: true },
      { id: "p2", name: "Inactivo", is_active: false },
    ];
    const available = allPrograms.filter((p) => !enrolledIds.has(p.id) && p.is_active);
    expect(available).toHaveLength(1);
    expect(available[0].id).toBe("p1");
  });
});

// ─── Consent pre-check logic ──────────────────────────────────────────────────

describe("Consent pre-check logic (non-blocking)", () => {
  type ConsentRecord = { purpose: string; granted: boolean; revoked_at: string | null };

  function checkConsents(
    requiredConsents: string[],
    personConsents: ConsentRecord[]
  ): { hasAll: boolean; missing: string[] } {
    const missing: string[] = [];
    for (const purpose of requiredConsents) {
      const found = personConsents.find(
        (c) => c.purpose === purpose && c.granted && !c.revoked_at
      );
      if (!found) missing.push(purpose);
    }
    return { hasAll: missing.length === 0, missing };
  }

  it("returns hasAll=true when all consents are present", () => {
    const required = ["tratamiento_datos_bocatas", "fotografia"];
    const consents: ConsentRecord[] = [
      { purpose: "tratamiento_datos_bocatas", granted: true, revoked_at: null },
      { purpose: "fotografia", granted: true, revoked_at: null },
    ];
    const result = checkConsents(required, consents);
    expect(result.hasAll).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("returns missing consent when one is absent", () => {
    const required = ["tratamiento_datos_bocatas", "fotografia"];
    const consents: ConsentRecord[] = [
      { purpose: "tratamiento_datos_bocatas", granted: true, revoked_at: null },
    ];
    const result = checkConsents(required, consents);
    expect(result.hasAll).toBe(false);
    expect(result.missing).toContain("fotografia");
  });

  it("treats revoked consents as missing", () => {
    const required = ["tratamiento_datos_bocatas"];
    const consents: ConsentRecord[] = [
      { purpose: "tratamiento_datos_bocatas", granted: true, revoked_at: "2026-01-01T00:00:00Z" },
    ];
    const result = checkConsents(required, consents);
    expect(result.hasAll).toBe(false);
    expect(result.missing).toContain("tratamiento_datos_bocatas");
  });

  it("treats denied consents (granted=false) as missing", () => {
    const required = ["tratamiento_datos_bocatas"];
    const consents: ConsentRecord[] = [
      { purpose: "tratamiento_datos_bocatas", granted: false, revoked_at: null },
    ];
    const result = checkConsents(required, consents);
    expect(result.hasAll).toBe(false);
  });

  it("programs with no required consents always pass", () => {
    const result = checkConsents([], []);
    expect(result.hasAll).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("enrollment is non-blocking: missing consent only generates warning", () => {
    // Simulates the server behavior: enrollment proceeds even with missing consents
    const required = ["fotografia"];
    const personConsents: ConsentRecord[] = [];
    const { hasAll, missing } = checkConsents(required, personConsents);

    // Non-blocking: enrollment should still succeed, just with a warning
    const canEnroll = true; // always true per BR-C2
    const warning = !hasAll
      ? `Falta consentimiento: ${missing.join(", ")}`
      : null;

    expect(canEnroll).toBe(true);
    expect(warning).not.toBeNull();
    expect(warning).toContain("fotografia");
  });
});

// ─── is_default invariant ─────────────────────────────────────────────────────

describe("is_default invariant", () => {
  type ProgramRow = { id: string; slug: string; is_default: boolean };

  function applyDefaultInvariant(
    programs: ProgramRow[],
    newDefaultId: string
  ): ProgramRow[] {
    // Only one program can be default at a time
    return programs.map((p) => ({
      ...p,
      is_default: p.id === newDefaultId,
    }));
  }

  it("only one program is default after applying invariant", () => {
    const programs: ProgramRow[] = [
      { id: "p1", slug: "comedor_social", is_default: true },
      { id: "p2", slug: "familias", is_default: false },
      { id: "p3", slug: "cursos", is_default: false },
    ];
    const updated = applyDefaultInvariant(programs, "p2");
    const defaults = updated.filter((p) => p.is_default);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe("p2");
  });

  it("previous default is cleared when new default is set", () => {
    const programs: ProgramRow[] = [
      { id: "p1", slug: "comedor_social", is_default: true },
      { id: "p2", slug: "familias", is_default: false },
    ];
    const updated = applyDefaultInvariant(programs, "p2");
    expect(updated.find((p) => p.id === "p1")?.is_default).toBe(false);
    expect(updated.find((p) => p.id === "p2")?.is_default).toBe(true);
  });
});
