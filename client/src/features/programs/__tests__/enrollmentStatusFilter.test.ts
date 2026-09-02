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
import {
  ESTADO_LABEL,
  buildCountLabel,
  buildFilterStates,
  ESTADO_FILTRO_INICIAL,
} from "../components/EnrolledPersonsTable";
import * as tablaModule from "../components/EnrolledPersonsTable";
import { ESTADO_LABELS } from "@shared/programEstados";

// ─── Mirrors the handleFilterChange logic in EnrolledPersonsTable ─────────────

function handleFilterChange(
  current: EnrollmentEstado | undefined,
  next: string
): EnrollmentEstado | undefined {
  // ToggleGroup type="single" returns "" when the active item is re-clicked
  if (!next) return undefined;
  return next as EnrollmentEstado;
}

// ─── Estado inicial del filtro ───────────────────────────────────────────────
// Se IMPORTA de la tabla, no se copia: antes esta constante era una réplica
// local, así que cambiar el componente no rompía ningún test (falso verde).

const DEFAULT_FILTER: EnrollmentEstado | undefined = ESTADO_FILTRO_INICIAL;

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
    // Un curso de formación no habilita 'activo' (su embudo es inscrito →
    // preseleccionado → admitido → …). Con 'activo' por defecto la tabla pedía
    // un estado que ese programa no usa y devolvía 0 inscritos en cursos que sí
    // tenían gente. Por defecto no se filtra: "Todos".
    // Sin esta comprobación el bloque entero es un falso verde: un import de un
    // export inexistente llega como `undefined` y las aserciones de abajo pasan
    // solas, sin que el componente haya cambiado nada.
    it("la tabla exporta ESTADO_FILTRO_INICIAL (el test lee el valor real)", () => {
      expect(Object.keys(tablaModule)).toContain("ESTADO_FILTRO_INICIAL");
    });

    it("arranca sin filtro — la pestaña activa es «Todos»", () => {
      expect(DEFAULT_FILTER).toBeUndefined();
    });

    it("muestra todas las inscripciones por defecto, sea cual sea el estado", () => {
      const result = filterByEstado(ENROLLMENTS, DEFAULT_FILTER);
      expect(result).toHaveLength(ENROLLMENTS.length);
    });

    it("no esconde las inscripciones de un programa que no usa 'activo'", () => {
      const embudoFormacion: StubEnrollment[] = [
        { id: "e1", estado: "inscrito" as EnrollmentEstado },
        { id: "e2", estado: "preseleccionado" as EnrollmentEstado },
        { id: "e3", estado: "admitido" as EnrollmentEstado },
      ];
      expect(filterByEstado(embudoFormacion, DEFAULT_FILTER)).toHaveLength(3);
      // Con el valor anterior ('activo') este mismo curso salía vacío:
      expect(filterByEstado(embudoFormacion, "activo")).toHaveLength(0);
    });

    it("el conteo no lleva sufijo de estado cuando no hay filtro", () => {
      expect(buildCountLabel(23, DEFAULT_FILTER)).toBe("23 personas inscritas");
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

    it("ESTADO_LABEL cubre los estados que el contador puede nombrar", () => {
      expect(Object.keys(ESTADO_LABEL).sort()).toEqual([
        "activo",
        "completado",
        "rechazado",
        "terminado",
      ]);
    });

    it("ESTADO_LABEL does not contain pausado (not a valid EnrollmentEstado)", () => {
      expect(Object.keys(ESTADO_LABEL)).not.toContain("pausado");
    });

    it("rechazado label lowercases to 'rechazados'", () => {
      expect(buildCountLabel(2, "rechazado")).toBe("2 personas inscritas (rechazados)");
    });
  });
});

// ─── buildFilterStates — chips sin «Terminado» duplicado ─────────────────────

describe("buildFilterStates — chips de estado", () => {
  it("con 'terminado' habilitado NO añade 'completado' (pintaba dos chips «Terminado»)", () => {
    const chips = buildFilterStates([
      "inscrito", "preseleccionado", "admitido", "lista_espera",
      "activo", "baja", "terminado",
    ]);
    expect(chips).toContain("terminado");
    expect(chips).not.toContain("completado");
  });

  it("las etiquetas visibles nunca se repiten", () => {
    const labels = buildFilterStates(["activo", "terminado"]).map((e) => ESTADO_LABELS[e]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("sin 'terminado' habilitado, 'completado' sigue disponible para filas legacy", () => {
    expect(buildFilterStates(["activo", "pausado", "baja"])).toEqual([
      "activo", "pausado", "baja", "completado",
    ]);
  });

  it("descarta valores fuera del catálogo", () => {
    expect(buildFilterStates(["activo", "cualquier_cosa"])).toEqual(["activo", "completado"]);
  });

  it("con 'terminado' Y 'completado' habilitados explícitamente, sólo queda 'terminado'", () => {
    // El form UI no ofrece estados legacy, pero la API y la DB los aceptan
    // (el refine admite todo ESTADOS_CATALOGO): el invariante de etiquetas
    // únicas debe aguantar también ese caso.
    expect(buildFilterStates(["terminado", "completado"])).toEqual(["terminado"]);
  });
});

describe("buildCountLabel — el chip único «Terminado» tiene etiqueta propia", () => {
  it("'terminado' pinta '(terminados)', no el token crudo", () => {
    expect(buildCountLabel(2, "terminado")).toBe("2 personas inscritas (terminados)");
  });
});
