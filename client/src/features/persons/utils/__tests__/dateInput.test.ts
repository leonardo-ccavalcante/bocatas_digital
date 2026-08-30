import { describe, it, expect } from "vitest";
import { isoToDisplay, maskDateInput, displayToIso } from "../dateInput";

describe("isoToDisplay", () => {
  it("convierte ISO a dd/mm/aaaa", () => {
    expect(isoToDisplay("1985-03-07")).toBe("07/03/1985");
  });

  it("devuelve vacío para nulo, vacío o ISO incompleto", () => {
    expect(isoToDisplay(null)).toBe("");
    expect(isoToDisplay("")).toBe("");
    expect(isoToDisplay("1985-03")).toBe("");
  });
});

describe("maskDateInput", () => {
  it("inserta las barras según se teclea", () => {
    expect(maskDateInput("0")).toBe("0");
    expect(maskDateInput("07")).toBe("07");
    expect(maskDateInput("073")).toBe("07/3");
    expect(maskDateInput("0703")).toBe("07/03");
    expect(maskDateInput("07031985")).toBe("07/03/1985");
  });

  it("descarta lo que no sea dígito y corta en ocho", () => {
    expect(maskDateInput("07/03/1985")).toBe("07/03/1985");
    expect(maskDateInput("07-03-1985")).toBe("07/03/1985");
    expect(maskDateInput("070319850000")).toBe("07/03/1985");
  });
});

describe("displayToIso", () => {
  it("convierte una fecha real a ISO", () => {
    expect(displayToIso("07/03/1985")).toBe("1985-03-07");
    expect(displayToIso("29/02/2024")).toBe("2024-02-29"); // bisiesto
  });

  it("rechaza días que el calendario no tiene", () => {
    // `new Date` acepta esto y lo desplaza a marzo: el fallo que la función evita.
    expect(displayToIso("31/02/1985")).toBeNull();
    expect(displayToIso("29/02/2023")).toBeNull(); // no bisiesto
    expect(displayToIso("31/04/1990")).toBeNull();
  });

  it("rechaza formatos incompletos o fuera de rango", () => {
    expect(displayToIso("7/3/1985")).toBeNull();
    expect(displayToIso("07/03/85")).toBeNull();
    expect(displayToIso("07/13/1985")).toBeNull();
    expect(displayToIso("00/03/1985")).toBeNull();
    expect(displayToIso("07/03/0007")).toBeNull();
    expect(displayToIso("")).toBeNull();
  });

  it("es la inversa de isoToDisplay", () => {
    const iso = "2001-12-31";
    expect(displayToIso(isoToDisplay(iso))).toBe(iso);
  });
});
