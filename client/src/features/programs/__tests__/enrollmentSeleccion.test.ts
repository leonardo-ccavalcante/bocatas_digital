/**
 * enrollmentSeleccion.test.ts — la casilla de «seleccionar todo» y el
 * alternar por fila. Lógica pura: lo que se rompe en silencio es que
 * «todo» se quede marcado cuando cambia el filtro y la página trae otras filas.
 */
import { describe, it, expect } from "vitest";
import {
  alternarSeleccion,
  seleccionVisible,
  estanTodosSeleccionados,
} from "../utils/enrollmentSeleccion";

describe("alternarSeleccion", () => {
  it("añade un id que no estaba", () => {
    expect([...alternarSeleccion(new Set(["a"]), "b")]).toEqual(["a", "b"]);
  });

  it("quita un id que ya estaba", () => {
    expect([...alternarSeleccion(new Set(["a", "b"]), "a")]).toEqual(["b"]);
  });

  it("no muta el conjunto de entrada", () => {
    const previa = new Set(["a"]);
    alternarSeleccion(previa, "b");
    expect([...previa]).toEqual(["a"]);
  });
});

describe("seleccionVisible", () => {
  it("descarta los ids que ya no están en la página (cambió el filtro)", () => {
    expect(seleccionVisible(new Set(["a", "z"]), ["a", "b"])).toEqual(["a"]);
  });

  it("respeta el orden de la tabla, no el de la selección", () => {
    expect(seleccionVisible(new Set(["b", "a"]), ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("estanTodosSeleccionados", () => {
  it("una página vacía nunca está toda seleccionada", () => {
    expect(estanTodosSeleccionados(new Set(), [])).toBe(false);
  });

  it("es verdad sólo cuando cubre todas las filas visibles", () => {
    expect(estanTodosSeleccionados(new Set(["a"]), ["a", "b"])).toBe(false);
    expect(estanTodosSeleccionados(new Set(["a", "b"]), ["a", "b"])).toBe(true);
  });
});
