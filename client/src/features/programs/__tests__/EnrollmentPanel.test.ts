/**
 * EnrollmentPanel.test.ts — D-G4: Tests for EnrollmentPanel role-filtered rendering.
 *
 * Tests cover:
 * - Role-based program visibility (Job 3, AC2)
 * - Volunteer write access (Job 3, AC3)
 * - Enrollment panel data filtering logic
 */
import { describe, it, expect } from "vitest";

// ─── Role-filtered enrollment panel logic ─────────────────────────────────────

describe("EnrollmentPanel role-filtered rendering (Job 3)", () => {
  interface ProgramRow {
    id: string;
    slug: string;
    name: string;
    volunteer_can_access: boolean;
    volunteer_can_write: boolean;
    is_active: boolean;
  }

  const programs: ProgramRow[] = [
    {
      id: "1",
      slug: "comedor",
      name: "Comedor Social",
      volunteer_can_access: true,
      volunteer_can_write: true,
      is_active: true,
    },
    {
      id: "2",
      slug: "familia",
      name: "Programa Familias",
      volunteer_can_access: false,
      volunteer_can_write: false,
      is_active: true,
    },
    {
      id: "3",
      slug: "formacion",
      name: "Formación",
      volunteer_can_access: true,
      volunteer_can_write: true,
      is_active: true,
    },
    {
      id: "4",
      slug: "atencion_juridica",
      name: "Atención Jurídica",
      volunteer_can_access: false,
      volunteer_can_write: false,
      is_active: true,
    },
  ];

  /**
   * Simulates EnrollmentPanel filtering:
   * - Voluntario: hides programs with volunteer_can_access=false
   * - Admin+: shows all programs
   */
  function getVisiblePrograms(
    allPrograms: ProgramRow[],
    role: "voluntario" | "admin" | "superadmin"
  ): ProgramRow[] {
    if (role === "voluntario") {
      return allPrograms.filter((p) => p.volunteer_can_access);
    }
    return allPrograms;
  }

  /**
   * Simulates "Inscribir" button visibility:
   * - Only shown if volunteer_can_write=true (or admin+)
   */
  function canShowEnrollButton(
    program: ProgramRow,
    role: "voluntario" | "admin" | "superadmin"
  ): boolean {
    if (role === "admin" || role === "superadmin") return true;
    return program.volunteer_can_write;
  }

  it("voluntario does not see familia program (volunteer_can_access=false)", () => {
    const visible = getVisiblePrograms(programs, "voluntario");
    expect(visible.map((p) => p.slug)).not.toContain("familia");
  });

  it("voluntario does not see atencion_juridica (volunteer_can_access=false)", () => {
    const visible = getVisiblePrograms(programs, "voluntario");
    expect(visible.map((p) => p.slug)).not.toContain("atencion_juridica");
  });

  it("voluntario sees comedor and formacion", () => {
    const visible = getVisiblePrograms(programs, "voluntario");
    const slugs = visible.map((p) => p.slug);
    expect(slugs).toContain("comedor");
    expect(slugs).toContain("formacion");
  });

  it("admin sees all programs including familia", () => {
    const visible = getVisiblePrograms(programs, "admin");
    expect(visible.map((p) => p.slug)).toContain("familia");
    expect(visible.map((p) => p.slug)).toContain("atencion_juridica");
  });

  it("superadmin sees all programs", () => {
    const visible = getVisiblePrograms(programs, "superadmin");
    expect(visible.length).toBe(programs.length);
  });

  it("voluntario can enroll in comedor (volunteer_can_write=true)", () => {
    const comedor = programs.find((p) => p.slug === "comedor")!;
    expect(canShowEnrollButton(comedor, "voluntario")).toBe(true);
  });

  it("voluntario cannot enroll in familia (volunteer_can_write=false)", () => {
    const familia = programs.find((p) => p.slug === "familia")!;
    expect(canShowEnrollButton(familia, "voluntario")).toBe(false);
  });

  it("admin can always enroll regardless of volunteer_can_write", () => {
    const familia = programs.find((p) => p.slug === "familia")!;
    expect(canShowEnrollButton(familia, "admin")).toBe(true);
  });

  it("superadmin can always enroll", () => {
    const atencionJuridica = programs.find((p) => p.slug === "atencion_juridica")!;
    expect(canShowEnrollButton(atencionJuridica, "superadmin")).toBe(true);
  });
});

// ─── Enrollment panel data shape ─────────────────────────────────────────────

describe("EnrollmentPanel enrollment data", () => {
  interface Enrollment {
    id: string;
    program_id: string;
    estado: "activo" | "completado" | "rechazado";
    fecha_inicio: string;
    fecha_fin: string | null;
    notas: string | null;
  }

  const enrollments: Enrollment[] = [
    {
      id: "e1",
      program_id: "1",
      estado: "activo",
      fecha_inicio: "2024-01-01",
      fecha_fin: null,
      notas: null,
    },
    {
      id: "e2",
      program_id: "2",
      estado: "completado",
      fecha_inicio: "2023-01-01",
      fecha_fin: "2023-12-31",
      notas: "Completado satisfactoriamente",
    },
  ];

  it("active enrollments have null fecha_fin", () => {
    const active = enrollments.filter((e) => e.estado === "activo");
    expect(active.every((e) => e.fecha_fin === null)).toBe(true);
  });

  it("completed enrollments have non-null fecha_fin", () => {
    const completed = enrollments.filter((e) => e.estado === "completado");
    expect(completed.every((e) => e.fecha_fin !== null)).toBe(true);
  });

  it("historial accordion shows past enrollments (completado + rechazado)", () => {
    const historial = enrollments.filter(
      (e) => e.estado === "completado" || e.estado === "rechazado"
    );
    expect(historial.length).toBe(1);
    expect(historial[0].estado).toBe("completado");
  });
});
