/**
 * notionFicha.test.ts — pure parser tests for the Notion ficha export format.
 *
 * ALL fixture data is SYNTHETIC (invented people/documents) — never paste real
 * beneficiary data here. Mojibake fixtures are produced by double-encoding
 * clean UTF-8 through latin1, exactly the corruption the real export exhibits.
 */
import { describe, it, expect } from "vitest";
import { parseFicha, repairMojibake } from "../notionFicha";

/** Simulate the Notion export corruption: UTF-8 bytes re-read as latin1. */
function toMojibake(clean: string): string {
  return Buffer.from(clean, "utf8").toString("latin1");
}

const CLEAN_FICHA = `# Pruebas, Ana

Fecha Inscripción: 27/11/2025
Nombre: Ana
Apellidos: PRUEBAS
País de Origen: Marruecos
Tipo DOC: NIE
Nº DOC: X0000000T
Estado Curso Español: Baja
GRUPO (ESPAÑOL): Bajo
Estado Curso Camarero : Terminado
🎓 Cursos de formación: 2025/09 ESP (https://www.notion.so/2025-09-ESP-25b5?pvs=21), 2026/01 ESP L.Espera (https://www.notion.so/2026-01-ESP-L-Espera-2e65?pvs=21), 2025/04 CAM (https://www.notion.so/2025-04-CAM-77aa?pvs=21), Español Satelites (https://www.notion.so/Espanol-Satelites-88bb?pvs=21)
🧾 Talleres: 25/04 HHDD (https://www.notion.so/25-04-HHDD-99cc?pvs=21), 26/04 Español (https://www.notion.so/26-04-Espanol-00dd?pvs=21)
`;

describe("repairMojibake", () => {
  it("repairs double-encoded accents (Ã³ → ó)", () => {
    expect(repairMojibake("Fecha InscripciÃ³n")).toBe("Fecha Inscripción");
  });

  it("repairs double-encoded º (Â) even without Ã on the same line, via whole-text detection", () => {
    const text = toMojibake("Fecha Inscripción: 27/11/2025\nNº DOC: X0000000T");
    expect(repairMojibake(text)).toBe("Fecha Inscripción: 27/11/2025\nNº DOC: X0000000T");
  });

  it("repairs double-encoded emoji (ð...)", () => {
    expect(repairMojibake(toMojibake("🎓 Cursos de formación"))).toBe("🎓 Cursos de formación");
  });

  it("leaves clean UTF-8 text untouched", () => {
    expect(repairMojibake(CLEAN_FICHA)).toBe(CLEAN_FICHA);
  });

  it("leaves pure ASCII untouched", () => {
    expect(repairMojibake("Nombre: Ana")).toBe("Nombre: Ana");
  });
});

describe("parseFicha", () => {
  const ficha = parseFicha(toMojibake(CLEAN_FICHA));

  it("extracts the title from the # heading", () => {
    expect(ficha.titulo).toBe("Pruebas, Ana");
  });

  it("extracts identity fields with mojibake repaired", () => {
    expect(ficha.nombre).toBe("Ana");
    expect(ficha.apellidos).toBe("PRUEBAS");
    expect(ficha.tipoDoc).toBe("NIE");
    expect(ficha.numeroDoc).toBe("X0000000T");
  });

  it("normalizes keys: mojibake repaired, trimmed, no trailing-space-before-colon leftovers", () => {
    // "Estado Curso Camarero :" (trailing space before colon) must normalize
    expect(ficha.campos["Estado Curso Camarero"]).toBe("Terminado");
    expect(ficha.campos["Fecha Inscripción"]).toBe("27/11/2025");
    expect(ficha.campos["Nº DOC"]).toBe("X0000000T");
    expect(ficha.campos["GRUPO (ESPAÑOL)"]).toBe("Bajo");
  });

  it("collapses inner whitespace in keys", () => {
    const f = parseFicha("# X\n\nEstado  Curso   Español: Admitido\n");
    expect(f.campos["Estado Curso Español"]).toBe("Admitido");
  });

  it("strips emoji prefixes from keys", () => {
    expect(ficha.campos["Cursos de formación"]).toBeDefined();
    expect(ficha.campos["Talleres"]).toBeDefined();
  });

  it("splits curso tokens on commas and strips the (url) suffix", () => {
    expect(ficha.cursoTokens).toEqual([
      "2025/09 ESP",
      "2026/01 ESP L.Espera",
      "2025/04 CAM",
      "Español Satelites",
    ]);
  });

  it("splits taller tokens the same way", () => {
    expect(ficha.tallerTokens).toEqual(["25/04 HHDD", "26/04 Español"]);
  });

  it("does not split on commas inside URLs", () => {
    const f = parseFicha(
      "# Y\n\n🎓 Cursos de formación: 2025/09 ESP (https://www.notion.so/a,b?pvs=21), 2025/04 CAM (https://www.notion.so/c?pvs=21)\n",
    );
    expect(f.cursoTokens).toEqual(["2025/09 ESP", "2025/04 CAM"]);
  });

  it("returns empty tokens and empty identity fields when absent", () => {
    const f = parseFicha("# Solo Titulo\n");
    expect(f.cursoTokens).toEqual([]);
    expect(f.tallerTokens).toEqual([]);
    expect(f.nombre).toBe("");
    expect(f.numeroDoc).toBe("");
  });

  it("ignores lines without a key-value shape", () => {
    const f = parseFicha("# Z\n\nno colon here\n\nNombre: Zoe\n");
    expect(f.nombre).toBe("Zoe");
    expect(Object.keys(f.campos)).toEqual(["Nombre"]);
  });
});
