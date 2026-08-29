/** @vitest-environment jsdom */
/**
 * Personas.hooks.filter.test.tsx — RC-06 (F065).
 *
 * The admin-path client text filter must be accent- and word-order-
 * insensitive: every token of the normalised query must appear in the
 * normalised "nombre apellidos id" haystack.
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

import { usePersonsData } from "../Personas.hooks";

afterEach(() => {
  cleanup();
});

const MARIA = {
  id: "p1",
  nombre: "María",
  apellidos: "García López",
  fase_itinerario: "acogida",
  created_at: "2026-01-01T00:00:00Z",
  foto_perfil_url: null,
};

const MINIMA = {
  id: "p2",
  nombre: "QA-PER",
  apellidos: "Mínima",
  fase_itinerario: null,
  created_at: "2026-01-02T00:00:00Z",
  foto_perfil_url: null,
};

function filteredFor(query: string) {
  const { result } = renderHook(() =>
    usePersonsData({
      isAdmin: true,
      allPersons: [MARIA, MINIMA],
      searchResults: undefined,
      query,
      estadoFilter: "todas",
      faseFilter: "todas",
      sortBy: "name",
    })
  );
  return result.current.filteredRows;
}

describe("usePersonsData text filter — accent/word-order insensitive (RC-06)", () => {
  it.each(["maria garcia", "garcia maria", "  maria ", "María", "garcía lópez"])(
    "finds 'María García López' with query %j",
    (query) => {
      const rows = filteredFor(query);
      expect(rows.map((r) => r.id)).toEqual(["p1"]);
    }
  );

  it("finds 'Mínima' with the unaccented prefix 'min'", () => {
    expect(filteredFor("min").map((r) => r.id)).toEqual(["p2"]);
  });

  it("does not match unrelated queries", () => {
    expect(filteredFor("mariana")).toEqual([]);
  });
});
