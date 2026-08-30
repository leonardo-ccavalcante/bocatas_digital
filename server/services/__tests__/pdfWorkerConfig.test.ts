/**
 * pdfWorkerConfig.test.ts — a dónde se puede mandar un informe social a convertir.
 *
 * `.env` traía `LIBREOFFICE_WORKER_URL=http://35.231.120.16:7654` y ningún
 * código lo leía. Cablearlo tal cual habría sido peor que dejarlo muerto: el
 * cuerpo de esa petición es el informe de valoración social — nombre, domicilio,
 * situación familiar de una persona beneficiaria — y `http://` lo manda en claro
 * por Internet abierto hacia una IP sin certificado ni identidad verificable.
 *
 * Regla: texto plano sólo contra loopback (un sidecar en la propia máquina).
 * Cualquier otro host tiene que ser HTTPS. Falla cerrado y nombrando el motivo,
 * porque un fallo silencioso aquí es una fuga de PII.
 */
import { describe, it, expect } from "vitest";
import { resolvePdfWorker, PdfWorkerConfigError } from "../pdfWorkerConfig";

describe("resolvePdfWorker", () => {
  it("sin variable no hay worker: se convierte en local", () => {
    expect(resolvePdfWorker({})).toBeNull();
    expect(resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "   " })).toBeNull();
  });

  it("acepta HTTPS", () => {
    expect(
      resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "https://pdf.bocatas.org" })
    ).toEqual({ baseUrl: "https://pdf.bocatas.org", token: null });
  });

  it("normaliza la barra final para no generar // al unir la ruta", () => {
    expect(
      resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "https://pdf.bocatas.org/" })?.baseUrl
    ).toBe("https://pdf.bocatas.org");
  });

  it("acepta texto plano SOLO en loopback", () => {
    for (const host of ["http://localhost:7654", "http://127.0.0.1:7654"]) {
      expect(resolvePdfWorker({ LIBREOFFICE_WORKER_URL: host })?.baseUrl).toBe(host);
    }
  });

  it("rechaza texto plano hacia una IP remota, que es lo que había en .env", () => {
    expect(() =>
      resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "http://35.231.120.16:7654" })
    ).toThrow(PdfWorkerConfigError);
  });

  it("el error explica que el cuerpo lleva datos de la persona", () => {
    try {
      resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "http://35.231.120.16:7654" });
      expect.fail("debería haber lanzado");
    } catch (err) {
      expect((err as Error).message).toMatch(/https/i);
      expect((err as Error).message).toMatch(/informe social|datos personales|PII/i);
    }
  });

  it("rechaza un esquema que no sea http(s)", () => {
    expect(() =>
      resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "file:///etc/passwd" })
    ).toThrow(PdfWorkerConfigError);
  });

  it("rechaza una URL que no se puede interpretar", () => {
    expect(() => resolvePdfWorker({ LIBREOFFICE_WORKER_URL: "no-es-una-url" })).toThrow(
      PdfWorkerConfigError
    );
  });

  it("recoge el token compartido cuando está definido", () => {
    expect(
      resolvePdfWorker({
        LIBREOFFICE_WORKER_URL: "https://pdf.bocatas.org",
        LIBREOFFICE_WORKER_TOKEN: "s3cr3t",
      })?.token
    ).toBe("s3cr3t");
  });
});
