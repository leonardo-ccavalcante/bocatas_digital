/**
 * viviendaEstudios.test.ts — desplegables de vivienda y estudios (ALTAS-3, ALTAS-4).
 *
 * Los dos son enums de Postgres, así que las opciones nuevas llegan por
 * migración (20260830110000, 20260830110001). Aquí se fija el contrato de la
 * capa de aplicación:
 *
 *   · lo que VE el voluntario  -> los mapas de etiquetas (son la lista de
 *     opciones de Step4Situacion)
 *   · lo que ACEPTA el sistema -> los esquemas Zod, que siguen admitiendo los
 *     valores antiguos para no invalidar fichas ya guardadas
 *
 * `centro_acogida` es el caso delicado: se retira de la lista pero NO del
 * esquema. Reetiquetarlo como "Centro de menores" habría cambiado el
 * significado de datos ya recogidos, y ese dato acaba en informes.
 */
import { describe, it, expect } from "vitest";
import { TipoViviendaSchema, NivelEstudiosSchema } from "../enums";
import { TIPO_VIVIENDA_LABELS, NIVEL_ESTUDIOS_LABELS } from "../labels";

describe("tipo de vivienda (ALTAS-3)", () => {
  it("'calle' se presenta como «Sin hogar»", () => {
    expect(TIPO_VIVIENDA_LABELS.calle?.label).toBe("Sin hogar");
  });

  it("ofrece «Centro de menores» y «Piso de entidad social»", () => {
    expect(TIPO_VIVIENDA_LABELS.centro_menores?.label).toBe("Centro de menores");
    expect(TIPO_VIVIENDA_LABELS.piso_entidad_social?.label).toBe("Piso de entidad social");
  });

  it("ya no ofrece «Centro de acogida»", () => {
    expect(Object.keys(TIPO_VIVIENDA_LABELS)).not.toContain("centro_acogida");
  });

  it("acepta los valores nuevos y sigue aceptando los históricos", () => {
    for (const v of ["centro_menores", "piso_entidad_social"]) {
      expect(TipoViviendaSchema.safeParse(v).success).toBe(true);
    }
    // Fichas antiguas: el valor sigue siendo válido aunque ya no se ofrezca.
    expect(TipoViviendaSchema.safeParse("centro_acogida").success).toBe(true);
  });
});

describe("nivel de estudios (ALTAS-4)", () => {
  it("ofrece exactamente las cinco categorías pedidas", () => {
    expect(Object.keys(NIVEL_ESTUDIOS_LABELS)).toEqual([
      "sin_estudios",
      "primaria",
      "secundaria",
      "postsecundaria_no_superior",
      "superior",
    ]);
  });

  it("nombra las dos agregadas con sus equivalencias", () => {
    expect(NIVEL_ESTUDIOS_LABELS.postsecundaria_no_superior).toMatch(/bachillerato/i);
    expect(NIVEL_ESTUDIOS_LABELS.postsecundaria_no_superior).toMatch(/FPGM/);
    expect(NIVEL_ESTUDIOS_LABELS.superior).toMatch(/universidad/i);
    expect(NIVEL_ESTUDIOS_LABELS.superior).toMatch(/FPGS/);
  });

  it("acepta los valores nuevos y sigue aceptando los históricos", () => {
    for (const v of ["postsecundaria_no_superior", "superior"]) {
      expect(NivelEstudiosSchema.safeParse(v).success).toBe(true);
    }
    for (const v of ["bachillerato", "formacion_profesional", "universitario", "postgrado"]) {
      expect(NivelEstudiosSchema.safeParse(v).success).toBe(true);
    }
  });
});
