/**
 * estadoInicial — orden de embudo (reunión 2026-08-31).
 *
 * Una edición de formación tiene 'inscrito' Y 'activo' habilitados: el alta
 * debe arrancar en 'inscrito' (la persona se apunta; activarla es un paso
 * posterior). La versión anterior prefería 'activo' siempre que estuviera
 * habilitado, así que toda formación nacía 'activo'.
 */
import { describe, it, expect } from "vitest";
import { TIPO_PRESETS, estadoInicial } from "../programEstados";

describe("estadoInicial — orden de embudo", () => {
  it("una edición (preset con 'inscrito' y 'activo') arranca en 'inscrito'", () => {
    expect(estadoInicial(TIPO_PRESETS.edicion.estados)).toBe("inscrito");
  });

  it("un continuo (sin tramo de captación) sigue arrancando en 'activo'", () => {
    expect(estadoInicial(TIPO_PRESETS.continuo.estados)).toBe("activo");
  });

  it("['activo'] arranca en 'activo'", () => {
    expect(estadoInicial(["activo"])).toBe("activo");
  });

  it("['pausado','activo'] arranca en 'activo' (orden del catálogo, no del array)", () => {
    expect(estadoInicial(["pausado", "activo"])).toBe("activo");
  });

  it("lista vacía cae al fallback 'activo' (comportamiento actual)", () => {
    // Los call-sites pasan `program.estados_habilitados ?? ["activo"]`, así
    // que undefined nunca llega aquí; el fallback cubre la lista vacía.
    expect(estadoInicial([])).toBe("activo");
  });

  it("valores fuera del catálogo se ignoran y cae a 'activo'", () => {
    expect(estadoInicial(["cualquier_cosa"])).toBe("activo");
  });
});
