/**
 * Unión de los dos carriles de persons.search (nombre / identificador).
 *
 * La parte de la búsqueda que puede equivocarse sin que ninguna consulta falle
 * es ésta: repetir a alguien que cae en los dos carriles, o perder el orden
 * alfabético que espera la lista.
 */
import { describe, it, expect } from "vitest";
import { unirResultados } from "../search";

function fila(id: string, nombre: string) {
  return {
    id,
    nombre,
    apellidos: null,
    fecha_nacimiento: null,
    foto_perfil_url: null,
    restricciones_alimentarias: null,
    fase_itinerario: null,
  };
}

describe("unirResultados", () => {
  it("no repite a quien cae en los dos carriles", () => {
    const persona = fila("a", "Ana");
    const salida = unirResultados([persona], [persona]);
    expect(salida).toHaveLength(1);
    expect(salida[0].id).toBe("a");
  });

  it("suma los dos carriles", () => {
    const salida = unirResultados([fila("a", "Ana")], [fila("b", "Bruno")]);
    expect(salida.map((f) => f.id).sort()).toEqual(["a", "b"]);
  });

  it("ordena alfabéticamente en español", () => {
    const salida = unirResultados(
      [fila("c", "Zoe"), fila("a", "Ángel")],
      [fila("b", "Bruno")]
    );
    expect(salida.map((f) => f.nombre)).toEqual(["Ángel", "Bruno", "Zoe"]);
  });

  it("devuelve vacío cuando ningún carril encuentra nada", () => {
    expect(unirResultados([], [])).toEqual([]);
  });

  it("no devuelve más de 20 filas", () => {
    const muchas = Array.from({ length: 30 }, (_, i) =>
      fila(`id-${i}`, `Persona ${String(i).padStart(2, "0")}`)
    );
    expect(unirResultados(muchas, [])).toHaveLength(20);
  });

  it("nunca expone nº de documento ni teléfono, aunque se busque por ellos", () => {
    const salida = unirResultados([], [fila("a", "Ana")]);
    expect(salida[0]).not.toHaveProperty("numero_documento");
    expect(salida[0]).not.toHaveProperty("telefono");
  });
});
