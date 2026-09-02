import { describe, expect, it } from "vitest";
import { buildGrupoQuery, computePrevNext, sanitizeVolver } from "../volverNav";

describe("sanitizeVolver", () => {
  it("acepta rutas internas absolutas", () => {
    expect(sanitizeVolver("/programas/comedor")).toBe("/programas/comedor");
  });

  it("rechaza URLs absolutas, protocol-relative, esquemas y vacíos", () => {
    expect(sanitizeVolver("https://evil.com")).toBeUndefined();
    expect(sanitizeVolver("//evil.com")).toBeUndefined();
    expect(sanitizeVolver("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeVolver("")).toBeUndefined();
    expect(sanitizeVolver(null)).toBeUndefined();
    expect(sanitizeVolver(undefined)).toBeUndefined();
  });
});

describe("computePrevNext", () => {
  const ids = ["a", "b", "c"];

  it("devuelve prev y next en el medio de la lista", () => {
    expect(computePrevNext(ids, "b")).toEqual({ prev: "a", next: "c" });
  });

  it("en los bordes falta el lado correspondiente (chevrón desactivado)", () => {
    expect(computePrevNext(ids, "a")).toEqual({ prev: undefined, next: "b" });
    expect(computePrevNext(ids, "c")).toEqual({ prev: "b", next: undefined });
  });

  it("si la persona no está en la lista, no navega", () => {
    expect(computePrevNext(ids, "x")).toEqual({});
    expect(computePrevNext([], "a")).toEqual({});
  });
});

describe("buildGrupoQuery", () => {
  it("preserva volver/volverLabel/grupo, escapados", () => {
    expect(buildGrupoQuery("p-1", "/programas/comedor", "Comedor Social")).toBe(
      "?volver=%2Fprogramas%2Fcomedor&volverLabel=Comedor+Social&grupo=p-1"
    );
  });

  it("sin volver sólo lleva grupo", () => {
    expect(buildGrupoQuery("p-1")).toBe("?grupo=p-1");
  });
});
