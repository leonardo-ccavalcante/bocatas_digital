/**
 * calcularCambios — el diff que decide qué se manda al servidor.
 *
 * Es la pieza donde un fallo BORRA datos sin que nadie lo pida: si el diff
 * mete campos que nadie tocó, el parche los sobreescribe.
 */
import { describe, it, expect } from "vitest";
import { calcularCambios } from "../EditPersonModal";

describe("calcularCambios", () => {
  it("no devuelve nada cuando no se ha tocado nada", () => {
    const v = { nombre: "Ana", apellidos: "Ruiz", telefono: "600111222" };
    expect(calcularCambios(v, { ...v })).toEqual({});
  });

  it("devuelve sólo el campo cambiado", () => {
    const antes = { nombre: "Ana", apellidos: "Ruiz" };
    expect(calcularCambios(antes, { ...antes, apellidos: "Ruiz Gómez" })).toEqual({
      apellidos: "Ruiz Gómez",
    });
  });

  it("trata null, undefined y cadena vacía como el mismo campo vacío", () => {
    // Abrir el formulario convierte null en "" en los inputs; eso NO es un cambio.
    expect(calcularCambios({ telefono: null }, { telefono: "" })).toEqual({});
    expect(calcularCambios({ municipio: undefined }, { municipio: "" })).toEqual({});
    expect(calcularCambios({ email: "" }, { email: null })).toEqual({});
  });

  it("permite vaciar un campo que tenía valor", () => {
    expect(calcularCambios({ telefono: "600111222" }, { telefono: "" })).toEqual({
      telefono: "",
    });
  });

  it("nunca incluye campos que no son editables", () => {
    const cambios = calcularCambios(
      { nombre: "Ana" },
      { nombre: "Ana", program_ids: ["x"], fase_itinerario: "autonomia" } as never
    );
    expect(cambios).not.toHaveProperty("program_ids");
    expect(cambios).not.toHaveProperty("fase_itinerario");
  });

  it("detecta el cambio de un booleano a false (no lo confunde con vacío)", () => {
    expect(calcularCambios({ empadronado: true }, { empadronado: false })).toEqual({
      empadronado: false,
    });
  });
});
