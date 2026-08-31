/**
 * calcularCambios — el diff que decide qué se manda al servidor.
 *
 * Es la pieza donde un fallo BORRA datos sin que nadie lo pida: si el diff
 * mete campos que nadie tocó, el parche los sobreescribe.
 */
import { describe, it, expect } from "vitest";
import { calcularCambios, type EditableValues } from "../edit/editableFields";

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

  // ── Arrays: dos fallos que rompían la función en cuanto entraron `idiomas`
  //    y `colectivos`. `===` sobre arrays compara REFERENCIAS, así que dos
  //    arrays de idéntico contenido nunca eran iguales y el diff los emitía
  //    siempre. Para `colectivos` eso significa que corregir el teléfono de
  //    cualquier persona con un colectivo declarado dispararía la puerta
  //    Art. 9 del servidor y el guardado fallaría ENTERO.
  it("dos arrays con el mismo contenido no son un cambio", () => {
    expect(
      calcularCambios({ idiomas: ["es", "fr"] }, { idiomas: ["es", "fr"] })
    ).toEqual({});
  });

  it("un array vacío y null son el mismo campo vacío", () => {
    expect(calcularCambios({ idiomas: null }, { idiomas: [] })).toEqual({});
    expect(calcularCambios({ idiomas: [] }, { idiomas: null })).toEqual({});
  });

  it("detecta de verdad el cambio de contenido de un array", () => {
    expect(
      calcularCambios({ idiomas: ["es"] }, { idiomas: ["es", "fr"] })
    ).toEqual({ idiomas: ["es", "fr"] });
  });

  it("el orden importa: es lo que se guarda en la columna", () => {
    expect(
      calcularCambios({ idiomas: ["es", "fr"] }, { idiomas: ["fr", "es"] })
    ).toEqual({ idiomas: ["fr", "es"] });
  });
});

describe("calcularCambios — candado Art. 9", () => {
  const CON_COLECTIVO: EditableValues = {
    nombre: "Ana",
    colectivos: ["lgtbi"],
    colectivo_otros: "texto",
  };

  it("con el candado cerrado, los datos de colectivo NUNCA salen", () => {
    const cambios = calcularCambios(
      CON_COLECTIVO,
      { ...CON_COLECTIVO, colectivos: ["gitanos"], colectivo_otros: "otro" }
    );
    expect(cambios).toEqual({});
  });

  it("el caso que rompía todo: cambiar sólo el nombre de alguien con colectivo", () => {
    const cambios = calcularCambios(CON_COLECTIVO, { ...CON_COLECTIVO, nombre: "Ana María" });
    expect(cambios).toEqual({ nombre: "Ana María" });
    expect(cambios).not.toHaveProperty("colectivos");
    expect(cambios).not.toHaveProperty("colectivo_otros");
  });

  it("con el candado abierto sí salen", () => {
    const cambios = calcularCambios(
      CON_COLECTIVO,
      { ...CON_COLECTIVO, colectivos: ["gitanos"] },
      { incluirArt9: true }
    );
    expect(cambios).toEqual({ colectivos: ["gitanos"] });
  });

  it("abierto pero sin tocarlos, tampoco se emiten", () => {
    const cambios = calcularCambios(
      CON_COLECTIVO,
      { ...CON_COLECTIVO, nombre: "Ana María" },
      { incluirArt9: true }
    );
    expect(cambios).toEqual({ nombre: "Ana María" });
  });
});

describe("calcularCambios — lo que nunca puede viajar", () => {
  it("las fotos no salen del diff (getById devuelve URL FIRMADA, no el path)", () => {
    // Emitirlas grabaría una URL firmada en la columna: la violación CAS-02
    // que AGENTS.md prohíbe. La lista de campos editables es la barrera.
    const cambios = calcularCambios(
      { nombre: "Ana", foto_perfil_url: "path/a.jpg" } as never,
      { nombre: "Ana", foto_perfil_url: "https://firmada/a.jpg?token=x" } as never
    );
    expect(cambios).toEqual({});
  });

  it("el flag transitorio de consentimiento no es un cambio", () => {
    const cambios = calcularCambios(
      { nombre: "Ana" } as never,
      { nombre: "Ana", colectivo_consentimiento: true } as never
    );
    expect(cambios).not.toHaveProperty("colectivo_consentimiento");
  });
});
