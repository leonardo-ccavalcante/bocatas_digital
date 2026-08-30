/**
 * FAMILIAS-3 — «En los informes sociales añadir el logo del IRPF».
 *
 * ESTADO: BLOQUEADO por falta del activo gráfico. No hay ningún logo del IRPF en
 * el repositorio y NO se puede inventar: es un logotipo institucional y usar una
 * versión incorrecta o caducada invalida la justificación de la subvención.
 *
 * Este test fija el CONTRATO ACTUAL del membrete para que el trabajo esté
 * preparado y cualquier cambio en la plantilla sea visible:
 *
 *   · El membrete vive en `word/header1.xml` de la plantilla .docx (NO en
 *     `word/document.xml`), y hoy lleva UNA sola imagen: el sello «Tribu Los
 *     Bocatas» (`word/media/image3.png`, 505x516 px, ~2,94 x 2,98 cm).
 *   · Las otras dos imágenes (image1: sello azul con CIF, image2: firma) están
 *     en el cuerpo del documento, no en el membrete.
 *
 * QUÉ HACE FALTA CUANDO LLEGUE EL ACTIVO (ver el informe de la tarea):
 *   1. PNG con fondo transparente, ~500 px de lado como mínimo (para imprimir
 *      nítido a ~3 cm, igual que el sello actual).
 *   2. Insertarlo en `word/header1.xml` + su relación en
 *      `word/_rels/header1.xml.rels` + los bytes en `word/media/`.
 *      OJO: `server/_core/docxRender.ts` (injectLogos) ya sabe hacer esto por
 *      código con un marcador `{%tag}`, pero SOLO parchea `word/document.xml`;
 *      para el membrete habría que aplicar lo mismo sobre `header1.xml`.
 *   3. Republicar la plantilla con `scripts/publish-informe-template.mjs` — la
 *      plantilla viva sale del bucket `document-templates`, no de este fixture.
 *   4. Actualizar la expectativa de imágenes del membrete en este test.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "../__fixtures__/informe-valoracion-social.docx");

function zip(): PizZip {
  return new PizZip(fs.readFileSync(FIXTURE));
}

function fileText(z: PizZip, name: string): string {
  const f = z.file(name);
  if (!f) throw new Error(`La plantilla no contiene ${name}`);
  return f.asText();
}

describe("plantilla del informe social — contrato del membrete (FAMILIAS-3)", () => {
  it("el membrete es word/header1.xml y está referenciado desde el documento", () => {
    const z = zip();
    expect(z.file("word/header1.xml")).not.toBeNull();
    expect(fileText(z, "word/_rels/document.xml.rels")).toContain("header1.xml");
  });

  it("hoy el membrete lleva UNA sola imagen: el sello Tribu Los Bocatas", () => {
    const z = zip();
    const rels = fileText(z, "word/_rels/header1.xml.rels");
    const imagenes = [...rels.matchAll(/Target="(media\/[^"]+)"/g)].map((m) => m[1]);

    // Cuando entre el logo del IRPF esta expectativa pasa a DOS imágenes.
    expect(imagenes).toEqual(["media/image3.png"]);
  });

  it("no hay ningún activo del IRPF embebido todavía (bloqueo documentado)", () => {
    const z = zip();
    const nombres = Object.keys(z.files).filter((n) => n.startsWith("word/media/"));
    expect(nombres.sort()).toEqual([
      "word/media/image1.png",
      "word/media/image2.png",
      "word/media/image3.png",
    ]);
  });

  it("el sello del membrete se dibuja a ~3 cm — la misma medida que debe usar el logo del IRPF", () => {
    const header = fileText(zip(), "word/header1.xml");
    const extent = header.match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
    expect(extent).not.toBeNull();
    const cmPorEmu = 1 / 360_000;
    const anchoCm = Number(extent?.[1]) * cmPorEmu;
    const altoCm = Number(extent?.[2]) * cmPorEmu;
    expect(anchoCm).toBeCloseTo(2.94, 1);
    expect(altoCm).toBeCloseTo(2.98, 1);
  });
});
