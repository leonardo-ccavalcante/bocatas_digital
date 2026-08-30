/**
 * FAMILIAS-4a — la conversión .docx → PDF depende de un binario de LibreOffice
 * (`soffice`) que NO está instalado ni documentado como requisito de despliegue.
 *
 * Antes, `resolveSoffice()` caía en un último recurso `"soffice"` a secas y el
 * fallo solo se descubría al hacer spawn: 0 pistas en el log sobre qué falta y
 * cómo arreglarlo. Estos tests fijan el contrato: si no hay binario resoluble,
 * se falla RÁPIDO, con el error tipado, y dejando en el log qué instalar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { existsSyncMock, spawnMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock("node:fs", () => ({ existsSync: existsSyncMock }));
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { convertDocxToPdf, LibreOfficeUnavailableError } from "../docxToPdf";

const DOCX = Buffer.from("PKfake-docx");

beforeEach(() => {
  existsSyncMock.mockReset();
  spawnMock.mockReset();
  delete process.env.LIBREOFFICE_BIN;
  // Estos casos prueban el camino LOCAL. Si hay un sidecar configurado en el
  // entorno (`.env` trae LIBREOFFICE_WORKER_URL), la conversión ni siquiera
  // llega a buscar el binario, así que se fija a "sin worker" a propósito.
  delete process.env.LIBREOFFICE_WORKER_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("convertDocxToPdf — LibreOffice ausente", () => {
  it("sin ningún binario resoluble lanza LibreOfficeUnavailableError sin hacer spawn", async () => {
    existsSyncMock.mockReturnValue(false);

    await expect(convertDocxToPdf(DOCX)).rejects.toBeInstanceOf(LibreOfficeUnavailableError);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("deja en el log QUÉ falta y cómo configurarlo (diagnóstico accionable)", async () => {
    existsSyncMock.mockReturnValue(false);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(convertDocxToPdf(DOCX)).rejects.toBeInstanceOf(LibreOfficeUnavailableError);

    const logged = err.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toMatch(/LIBREOFFICE_BIN/);
    expect(logged).toMatch(/libreoffice/i);
  });

  it("el mensaje del error nombra la dependencia que falta", async () => {
    existsSyncMock.mockReturnValue(false);
    await expect(convertDocxToPdf(DOCX)).rejects.toThrow(/LibreOffice/i);
  });

  it("LIBREOFFICE_BIN apuntando a una ruta inexistente no se usa a ciegas", async () => {
    process.env.LIBREOFFICE_BIN = "/ruta/que/no/existe/soffice";
    existsSyncMock.mockReturnValue(false);

    await expect(convertDocxToPdf(DOCX)).rejects.toBeInstanceOf(LibreOfficeUnavailableError);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
