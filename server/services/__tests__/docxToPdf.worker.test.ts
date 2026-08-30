/**
 * docxToPdf.worker.test.ts — conversión contra un sidecar HTTP.
 *
 * El runbook contempla dos caminos para el PDF del informe social: LibreOffice
 * instalado en el host, o un sidecar tipo gotenberg. El segundo estaba a medias:
 * `LIBREOFFICE_WORKER_URL` llevaba tiempo en `.env` y ningún código lo leía, así
 * que la descarga en PDF fallaba en hosts sin LibreOffice mientras la
 * configuración sugería lo contrario.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convertDocxToPdf, LibreOfficeUnavailableError } from "../docxToPdf";

const PDF = Buffer.from("%PDF-1.7 fake");
const DOCX = Buffer.from("PK fake docx");

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("LIBREOFFICE_WORKER_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function okResponse() {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => PDF.buffer.slice(PDF.byteOffset, PDF.byteOffset + PDF.byteLength),
  };
}

describe("convertDocxToPdf — sidecar HTTP", () => {
  it("usa el worker cuando está configurado, en vez del binario local", async () => {
    vi.stubEnv("LIBREOFFICE_WORKER_URL", "https://pdf.bocatas.org");
    fetchMock.mockResolvedValue(okResponse());

    const out = await convertDocxToPdf(DOCX);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://pdf.bocatas.org/forms/libreoffice/convert"
    );
    expect(Buffer.from(out).toString()).toBe(PDF.toString());
  });

  it("manda el secreto compartido cuando existe", async () => {
    vi.stubEnv("LIBREOFFICE_WORKER_URL", "https://pdf.bocatas.org");
    vi.stubEnv("LIBREOFFICE_WORKER_TOKEN", "s3cr3t");
    fetchMock.mockResolvedValue(okResponse());

    await convertDocxToPdf(DOCX);

    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe("Bearer s3cr3t");
  });

  it("no manda nada si la URL es texto plano hacia un host remoto", async () => {
    vi.stubEnv("LIBREOFFICE_WORKER_URL", "http://35.231.120.16:7654");

    await expect(convertDocxToPdf(DOCX)).rejects.toThrow(/https/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un error del worker no se confunde con «falta LibreOffice»", async () => {
    vi.stubEnv("LIBREOFFICE_WORKER_URL", "https://pdf.bocatas.org");
    fetchMock.mockResolvedValue({ ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) });

    await expect(convertDocxToPdf(DOCX)).rejects.not.toBeInstanceOf(
      LibreOfficeUnavailableError
    );
  });
});
