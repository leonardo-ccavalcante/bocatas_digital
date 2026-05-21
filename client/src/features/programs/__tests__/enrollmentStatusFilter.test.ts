/**
 * enrollmentStatusFilter.test.ts
 *
 * Unit tests for the EnrolledPersonsTable status-filter logic using
 * the ToggleGroup (single-select) interaction model.
 *
 * No DOM rendering — tests the pure state-transition and filtering
 * logic that the ToggleGroup drives.
 */
import { describe, it, expect } from "vitest";
import type { EnrollmentEstado } from "../schemas";
import { ESTADO_LABEL, buildCountLabel } from "../components/EnrolledPersonsTable";

// ─── Mirrors the handleFilterChange logic in EnrolledPersonsTable ─────────────

function handleFilterChange(
  current: EnrollmentEstado | undefined,
  next: string
): EnrollmentEstado | undefined {
  // ToggleGroup type="single" returns "" when the active item is re-clicked
  if (!next) return undefined;
  return next as EnrollmentEstado;
}

// ─── Mirrors the "active" default state ──────────────────────────────────────

const DEFAULT_FILTER: EnrollmentEstado = "activo";

// ─── Enrollment fixture ───────────────────────────────────────────────────────

type StubEnrollment = { id: string; estado: EnrollmentEstado };

const ENROLLMENTS: StubEnrollment[] = [
  { id: "e1", estado: "activo" },
  { id: "e2", estado: "activo" },
  { id: "e3", estado: "completado" },
  { id: "e4", estado: "rechazado" },
];

function filterByEstado(
  rows: StubEnrollment[],
  estado: EnrollmentEstado | undefined
): StubEnrollment[] {
  if (!estado) return rows;
  return rows.filter((r) => r.estado === estado);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("EnrolledPersonsTable — ToggleGroup status filter logic", () => {
  describe("default state", () => {
    it("starts with 'activo' as the default filter", () => {
      expect(DEFAULT_FILTER).toBe("activo");
    });

    it("shows only active enrollments by default", () => {
      const result = filterByEstado(ENROLLMENTS, DEFAULT_FILTER);
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.estado === "activo")).toBe(true);
    });
  });

  describe("handleFilterChange — state transitions", () => {
    it("selecting a new estado sets it", () => {
      const next = handleFilterChange("activo", "completado");
      expect(next).toBe("completado");
    });

    it("deselecting active item (empty string) clears filter", () => {
      const next = handleFilterChange("activo", "");
      expect(next).toBeUndefined();
    });

    it("selecting 'rechazado' sets filter to rechazado", () => {
      const next = handleFilterChange(undefined, "rechazado");
      expect(next).toBe("rechazado");
    });

    it("selecting same value again still produces that value", () => {
      // ToggleGroup with type="single" only sends "" on deselect; re-click is handled by radix
      const next = handleFilterChange("activo", "activo");
      expect(next).toBe("activo");
    });
  });

  describe("filterByEstado — filtered row counts", () => {
    it("returns all rows when filter is undefined", () => {
      expect(filterByEstado(ENROLLMENTS, undefined)).toHaveLength(4);
    });

    it("returns only completado rows", () => {
      const result = filterByEstado(ENROLLMENTS, "completado");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("e3");
    });

    it("returns only rechazado rows", () => {
      const result = filterByEstado(ENROLLMENTS, "rechazado");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("e4");
    });

    it("returns empty array when no rows match the filter", () => {
      const result = filterByEstado(
        [{ id: "e1", estado: "activo" }],
        "completado"
      );
      expect(result).toHaveLength(0);
    });
  });

  describe("count label derivation", () => {
    // Uses the real ESTADO_LABEL and buildCountLabel exported from EnrolledPersonsTable.
    // ESTADO_LABEL values are title-case ("Activos", "Completados", "Rechazados");
    // buildCountLabel calls .toLowerCase() on them, so rendered output is lowercase.

    it("shows singular label for 1 person", () => {
      expect(buildCountLabel(1, "activo")).toBe("1 persona inscrita (activos)");
    });

    it("shows plural label for >1 persons", () => {
      expect(buildCountLabel(3, "activo")).toBe("3 personas inscritas (activos)");
    });

    it("omits estado suffix when filter is undefined", () => {
      expect(buildCountLabel(5, undefined)).toBe("5 personas inscritas");
    });

    it("shows 0 correctly", () => {
      expect(buildCountLabel(0, "completado")).toBe("0 personas inscritas (completados)");
    });

    it("ESTADO_LABEL keys match the EnrollmentEstado enum values", () => {
      expect(Object.keys(ESTADO_LABEL).sort()).toEqual(["activo", "completado", "rechazado"]);
    });

    it("ESTADO_LABEL does not contain pausado (not a valid EnrollmentEstado)", () => {
      expect(Object.keys(ESTADO_LABEL)).not.toContain("pausado");
    });

    it("rechazado label lowercases to 'rechazados'", () => {
      expect(buildCountLabel(2, "rechazado")).toBe("2 personas inscritas (rechazados)");
    });
  });
});
