/**
 * enrollmentContacto.test.ts — el reparto entre «a quién le llega el aviso»
 * y «a quién hay que llamar». Es la única lógica de la toolbar; el resto es
 * pintura.
 */
import { describe, it, expect } from "vitest";
import {
  repartirContacto,
  formatearParaPegar,
  nombreCompleto,
} from "../utils/enrollmentContacto";

const PERSONAS = [
  // `puede_whatsapp` lo calcula el servidor leyendo `consents`; aquí se fija
  // a mano porque lo que se prueba es el reparto, no la consulta.
  { nombre: "Ana", apellidos: "García", email: "ana@example.org", telefono: "600111222", puede_whatsapp: true },
  { nombre: "José", apellidos: "Núñez", email: null, telefono: "600333444", puede_whatsapp: true },
  { nombre: "Marta", apellidos: null, email: "  marta@example.org  ", telefono: null, puede_whatsapp: true },
  { nombre: "Otro", apellidos: "Ana", email: "ANA@example.org", telefono: "", puede_whatsapp: false },
  { nombre: "Luis", apellidos: "Pérez", email: "luis@example.org", telefono: "600555666", puede_whatsapp: false },
  // Sin el flag: un alta antigua que no tiene fila de consentimiento.
  { nombre: "Sara", apellidos: "Gil", email: "sara@example.org", telefono: "600777888" },
];

describe("repartirContacto — email", () => {
  it("devuelve los correos no vacíos, trimados y sin repetir (case-insensitive)", () => {
    const { valores } = repartirContacto(PERSONAS, "email");
    expect(valores).toEqual([
      "ana@example.org",
      "marta@example.org",
      "luis@example.org",
      "sara@example.org",
    ]);
  });

  it("lista con nombre completo a quien no tiene correo", () => {
    const { sinDato } = repartirContacto(PERSONAS, "email");
    expect(sinDato).toEqual(["José Núñez"]);
  });

  it("no aparta a nadie por consentimiento: el correo no tiene un fin propio en el catálogo", () => {
    const { valores, sinConsentimiento } = repartirContacto(PERSONAS, "email");
    expect(sinConsentimiento).toEqual([]);
    expect(valores).toContain("luis@example.org");
  });
});

describe("repartirContacto — telefono", () => {
  it("copia sólo los teléfonos de quien puede recibir WhatsApp", () => {
    const { valores } = repartirContacto(PERSONAS, "telefono");
    expect(valores).toEqual(["600111222", "600333444"]);
    expect(valores).not.toContain("600555666");
    expect(valores).not.toContain("600777888");
  });

  it("aparta —por nombre, no por número— a quien no ha dado ese consentimiento", () => {
    const { sinConsentimiento } = repartirContacto(PERSONAS, "telefono");
    expect(sinConsentimiento).toEqual(["Luis Pérez", "Sara Gil"]);
  });

  it("sin el flag cuenta como NO: la ausencia de fila no es un permiso", () => {
    const sinFila = [
      { nombre: "Sara", apellidos: "Gil", email: "sara@example.org", telefono: "600777888" },
    ];
    const { valores, sinConsentimiento } = repartirContacto(sinFila, "telefono");
    expect(valores).toEqual([]);
    expect(sinConsentimiento).toEqual(["Sara Gil"]);
  });

  it("no tener teléfono se sigue contando aparte de no haber consentido", () => {
    const { sinDato } = repartirContacto(PERSONAS, "telefono");
    expect(sinDato).toEqual(["Marta", "Otro Ana"]);
  });
});

describe("nombreCompleto / formatearParaPegar", () => {
  it("sin apellidos no deja un espacio colgando", () => {
    expect(nombreCompleto({ nombre: "Marta", apellidos: null })).toBe("Marta");
  });

  it("sin nombre ni apellidos no devuelve cadena vacía", () => {
    expect(nombreCompleto({ nombre: null, apellidos: null })).toBe("(sin nombre)");
  });

  it("pega con '; ' — el separador que aceptan Gmail y Outlook", () => {
    expect(formatearParaPegar(["a@x.org", "b@x.org"])).toBe("a@x.org; b@x.org");
  });
});
