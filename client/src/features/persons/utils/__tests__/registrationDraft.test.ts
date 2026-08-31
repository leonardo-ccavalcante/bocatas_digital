/**
 * @vitest-environment jsdom
 *
 * El entorno por defecto es node y aquí hace falta sessionStorage de verdad:
 * probar el borrador contra un doble no diría nada sobre la cuota ni sobre el
 * JSON corrupto, que es justo lo que puede fallar en un móvil.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  limpiarValores,
  mereceGuardarse,
  guardarBorrador,
  leerBorrador,
  borrarBorrador,
  CAMPOS_EXCLUIDOS,
} from "../registrationDraft";
import { HIGH_RISK_FIELD_NAMES } from "../../../../../../server/_core/rlsRedaction";

beforeEach(() => {
  sessionStorage.clear();
});

describe("limpiarValores — qué NO sale del formulario", () => {
  it("nunca guarda datos de categoría especial (Art. 9/10)", () => {
    const limpios = limpiarValores({
      nombre: "Ana",
      colectivos: ["lgtbi"],
      colectivo_otros: "algo",
      colectivo_consentimiento: true,
    });
    expect(limpios).toEqual({ nombre: "Ana" });
  });

  it("nunca guarda notas privadas ni fotos", () => {
    const limpios = limpiarValores({
      nombre: "Ana",
      notas_privadas: "nota interna",
      foto_perfil_url: "base64...",
      foto_documento_url: "base64...",
    });
    expect(limpios).toEqual({ nombre: "Ana" });
  });

  it("todos los campos excluidos están cubiertos por la prueba", () => {
    const entrada = Object.fromEntries(CAMPOS_EXCLUIDOS.map((c) => [c, "x"]));
    expect(limpiarValores({ ...entrada, nombre: "Ana" })).toEqual({ nombre: "Ana" });
  });

  /**
   * Candado contra la deriva. `situacion_legal` es campo de alto riesgo y el
   * wizard lo recoge (Step2Documento), pero no estaba en la lista de exclusión:
   * el borrador lo escribía en sessionStorage, dejando en el navegador de un
   * voluntario un dato que ese voluntario no puede ni leer en la ficha.
   *
   * Se comprueba contra la lista CANÓNICA, no contra una copia, para que añadir
   * un campo de alto riesgo nuevo rompa aquí en vez de filtrarse en silencio.
   */
  it("ningún campo de alto riesgo sobrevive al borrador", () => {
    const entrada = Object.fromEntries(HIGH_RISK_FIELD_NAMES.map((c) => [c, "secreto"]));
    const limpios = limpiarValores({ ...entrada, nombre: "Ana" });
    for (const campo of HIGH_RISK_FIELD_NAMES) {
      expect(limpios, `${campo} no debería sobrevivir al borrador`).not.toHaveProperty(campo);
    }
    expect(limpios).toEqual({ nombre: "Ana" });
  });

  it("descarta vacíos para no ocupar cuota", () => {
    expect(limpiarValores({ nombre: "Ana", telefono: "", email: null, program_ids: [] })).toEqual({
      nombre: "Ana",
    });
  });
});

describe("mereceGuardarse", () => {
  it("un formulario intacto no genera borrador", () => {
    expect(mereceGuardarse({ idioma_principal: "" , program_ids: [] })).toBe(false);
  });

  it("un formulario con algo tecleado sí", () => {
    expect(mereceGuardarse({ nombre: "Ana" })).toBe(true);
  });
});

describe("guardar / leer / borrar", () => {
  it("devuelve lo guardado", () => {
    guardarBorrador({ nombre: "Ana", apellidos: "Ruiz" }, 2);
    const b = leerBorrador();
    expect(b?.valores).toEqual({ nombre: "Ana", apellidos: "Ruiz" });
    expect(b?.fase).toBe(2);
  });

  it("no deja nada si no había nada que guardar", () => {
    guardarBorrador({ telefono: "" }, 1);
    expect(leerBorrador()).toBeNull();
  });

  it("caduca a las 12 horas", () => {
    const ayer = Date.parse("2026-08-30T08:00:00Z");
    guardarBorrador({ nombre: "Ana" }, 1, ayer);
    // 13 h después ya no se ofrece.
    expect(leerBorrador(ayer + 13 * 60 * 60 * 1000)).toBeNull();
    // …y se ha limpiado solo.
    expect(sessionStorage.getItem("bocatas:alta-borrador:v1")).toBeNull();
  });

  it("sigue vigente dentro de la jornada", () => {
    const t0 = Date.parse("2026-08-30T08:00:00Z");
    guardarBorrador({ nombre: "Ana" }, 1, t0);
    expect(leerBorrador(t0 + 2 * 60 * 60 * 1000)?.valores).toEqual({ nombre: "Ana" });
  });

  it("borrarBorrador lo elimina", () => {
    guardarBorrador({ nombre: "Ana" }, 1);
    borrarBorrador();
    expect(leerBorrador()).toBeNull();
  });

  it("no explota con contenido corrupto", () => {
    sessionStorage.setItem("bocatas:alta-borrador:v1", "{no es json");
    expect(leerBorrador()).toBeNull();
  });

  it("no explota si el objeto guardado no tiene la forma esperada", () => {
    sessionStorage.setItem("bocatas:alta-borrador:v1", JSON.stringify({ cualquier: "cosa" }));
    expect(leerBorrador()).toBeNull();
  });
});
