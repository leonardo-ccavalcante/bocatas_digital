/**
 * enrollmentFiltros.test.ts — el defecto «Todos» y la traducción al servidor.
 *
 * Verificado contra producción: el curso 2026_09_coc (Cocina) tiene 23
 * inscritos y sus `estados_habilitados` NO incluyen 'activo' (inscrito,
 * preseleccionado, admitido, lista_espera, baja, terminado, pausado). Con el
 * defecto viejo la tabla pedía estado=activo y la pantalla decía «0 personas
 * inscritas (activos)». Igual en 26_09_cam (13 inscritos). Por eso
 * FILTROS_VACIOS.estado es undefined y este test lo fija.
 */
import { describe, it, expect } from "vitest";
import {
  FILTROS_VACIOS,
  hayFiltrosActivos,
  aInputServidor,
} from "../utils/enrollmentFiltros";

describe("FILTROS_VACIOS — la tabla abre en «Todos»", () => {
  it("no arranca con ningún estado seleccionado", () => {
    expect(FILTROS_VACIOS.estado).toBeUndefined();
  });

  it("no arranca con ningún eje ni búsqueda", () => {
    expect(aInputServidor(FILTROS_VACIOS)).toEqual({
      estado: undefined,
      search: undefined,
      pais_origen: undefined,
      genero: undefined,
      situacion_laboral: undefined,
      situacion_ante_empleo: undefined,
    });
  });
});

describe("hayFiltrosActivos — cuándo se ofrece «Limpiar filtros»", () => {
  it("false con los filtros vacíos", () => {
    expect(hayFiltrosActivos(FILTROS_VACIOS)).toBe(false);
  });

  it("true con un estado", () => {
    expect(hayFiltrosActivos({ ...FILTROS_VACIOS, estado: "admitido" })).toBe(true);
  });

  it("true con un eje", () => {
    expect(hayFiltrosActivos({ ...FILTROS_VACIOS, pais_origen: "MA" })).toBe(true);
  });

  it("true con búsqueda", () => {
    expect(hayFiltrosActivos({ ...FILTROS_VACIOS, search: "a" })).toBe(true);
  });
});

describe("aInputServidor — «» es «sin filtro»", () => {
  it("los ejes vacíos no viajan al servidor", () => {
    const input = aInputServidor({ ...FILTROS_VACIOS, pais_origen: "MA" });
    expect(input.pais_origen).toBe("MA");
    expect(input.genero).toBeUndefined();
    expect(input.situacion_laboral).toBeUndefined();
  });

  it("una búsqueda de 1 carácter no viaja (sería un ilike '%a%' sobre la tabla entera)", () => {
    expect(aInputServidor({ ...FILTROS_VACIOS, search: "a" }).search).toBeUndefined();
  });

  it("desde 2 caracteres viaja recortada", () => {
    expect(aInputServidor({ ...FILTROS_VACIOS, search: "  ben " }).search).toBe("ben");
  });

  it("el estado pasa tal cual", () => {
    expect(aInputServidor({ ...FILTROS_VACIOS, estado: "terminado" }).estado).toBe("terminado");
  });
});
