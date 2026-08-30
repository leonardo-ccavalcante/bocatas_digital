/**
 * consentGroups.test.ts — qué consentimientos pueden bloquear un registro.
 *
 * RGPD Art. 7(4): el consentimiento sólo es válido si es libre. Empaquetar el
 * uso de imagen y las comunicaciones por WhatsApp dentro del bloque obligatorio
 * los convertía en condición para recibir el servicio — y una persona que no
 * quisiera ceder su imagen no podía ser registrada (feedback ALTAS-8).
 *
 * El Grupo A queda reducido a la base de tratamiento sin la cual no hay ficha.
 * Los demás fines se siguen recogiendo y se siguen guardando (con granted=false
 * si se deniegan), pero nunca bloquean.
 */
import { describe, it, expect } from "vitest";
import { buildConsentGroups, puedeGuardarFoto } from "../_consentRows";

describe("buildConsentGroups", () => {
  it("sólo exige el tratamiento de datos de Bocatas", () => {
    const { groupA } = buildConsentGroups({ hasProgramaFamilias: false });
    expect(groupA).toEqual(["tratamiento_datos_bocatas"]);
  });

  it("no bloquea el registro por la cesión de imagen", () => {
    const { groupA, groupC } = buildConsentGroups({ hasProgramaFamilias: false });
    expect(groupA).not.toContain("fotografia");
    expect(groupC).toContain("fotografia");
  });

  it("no bloquea el registro por las comunicaciones de WhatsApp", () => {
    const { groupA, groupC } = buildConsentGroups({ hasProgramaFamilias: false });
    expect(groupA).not.toContain("comunicaciones_whatsapp");
    expect(groupC).toContain("comunicaciones_whatsapp");
  });

  it("añade el fin del Banco de Alimentos sólo con ese programa", () => {
    expect(buildConsentGroups({ hasProgramaFamilias: true }).groupB).toEqual([
      "tratamiento_datos_banco_alimentos",
    ]);
    expect(buildConsentGroups({ hasProgramaFamilias: false }).groupB).toEqual([]);
  });

  it("añade compartir datos en red sólo con Programa Familias", () => {
    expect(buildConsentGroups({ hasProgramaFamilias: true }).groupC).toContain(
      "compartir_datos_red"
    );
    expect(
      buildConsentGroups({ hasProgramaFamilias: false }).groupC
    ).not.toContain("compartir_datos_red");
  });

  it("sigue guardando todos los fines, obligatorios y opcionales", () => {
    const { groupA, groupB, groupC } = buildConsentGroups({ hasProgramaFamilias: true });
    expect([...groupA, ...groupB, ...groupC].sort()).toEqual(
      [
        "comunicaciones_whatsapp",
        "compartir_datos_red",
        "fotografia",
        "tratamiento_datos_banco_alimentos",
        "tratamiento_datos_bocatas",
      ].sort()
    );
  });
});

/**
 * La foto de perfil se captura en el paso 6 y el consentimiento de imagen se
 * pide en el paso 7, así que la decisión sólo puede tomarse al enviar. Desde
 * que `fotografia` dejó de ser obligatorio (ALTAS-8) es posible completar un
 * registro habiéndolo denegado — y sin esta puerta la cara se guardaría igual,
 * que es exactamente lo que el equipo temía.
 */
describe("puedeGuardarFoto", () => {
  it("guarda la foto cuando se autorizó el uso de imagen", () => {
    expect(puedeGuardarFoto({ fotografia: true })).toBe(true);
  });

  it("NO guarda la foto cuando se denegó", () => {
    expect(puedeGuardarFoto({ fotografia: false })).toBe(false);
  });

  it("NO guarda la foto si no consta decisión alguna", () => {
    expect(puedeGuardarFoto({})).toBe(false);
  });
});
