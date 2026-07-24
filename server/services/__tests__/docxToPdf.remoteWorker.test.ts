/**
 * TDD tests for docxToPdf.ts — remote worker mode (LIBREOFFICE_WORKER_URL).
 *
 * These tests verify the HTTP delegation path without requiring a real
 * LibreOffice installation or a running Cloud Computer worker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convertDocxToPdf, LibreOfficeUnavailableError } from "../docxToPdf";

const FAKE_DOCX = Buffer.from("PK\x03\x04fake-docx-content");
// Use a real ArrayBuffer so Buffer.from(arrayBuffer) round-trips correctly
const FAKE_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const FAKE_PDF_BUFFER = Buffer.from(FAKE_PDF_BYTES);

describe("docxToPdf — remote worker mode (LIBREOFFICE_WORKER_URL)", () => {
  const originalEnv = process.env.LIBREOFFICE_WORKER_URL;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.LIBREOFFICE_WORKER_URL;
    } else {
      process.env.LIBREOFFICE_WORKER_URL = originalEnv;
    }
    vi.unstubAllGlobals();
  });

  it("calls the worker URL /convert endpoint with POST + multipart when LIBREOFFICE_WORKER_URL is set", async () => {
    process.env.LIBREOFFICE_WORKER_URL = "http://localhost:7654";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => FAKE_PDF_BYTES.buffer,
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await convertDocxToPdf(FAKE_DOCX);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:7654/convert");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    // Result should be a Buffer containing the PDF bytes
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.slice(0, 4).toString()).toBe("%PDF");
  });

  it("strips trailing slash from LIBREOFFICE_WORKER_URL before appending /convert", async () => {
    process.env.LIBREOFFICE_WORKER_URL = "http://localhost:7654/";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => FAKE_PDF_BYTES.buffer,
    });
    vi.stubGlobal("fetch", mockFetch);

    await convertDocxToPdf(FAKE_DOCX);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:7654/convert");
  });

  it("throws LibreOfficeUnavailableError when the worker is unreachable (fetch throws)", async () => {
    process.env.LIBREOFFICE_WORKER_URL = "http://localhost:7654";

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(convertDocxToPdf(FAKE_DOCX)).rejects.toBeInstanceOf(
      LibreOfficeUnavailableError
    );
  });

  it("throws an error when the worker returns a non-OK HTTP status", async () => {
    process.env.LIBREOFFICE_WORKER_URL = "http://localhost:7654";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }));

    await expect(convertDocxToPdf(FAKE_DOCX)).rejects.toThrow("docxToPdf worker error 500");
  });

  it("does NOT call fetch when LIBREOFFICE_WORKER_URL is unset (falls through to local mode)", async () => {
    delete process.env.LIBREOFFICE_WORKER_URL;

    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    // Local mode will fail (no soffice in test env) — we just verify fetch is not called.
    // Use a short timeout to avoid waiting for the full 90s soffice timeout.
    await expect(
      Promise.race([
        convertDocxToPdf(FAKE_DOCX),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("local-mode-timeout")), 500)
        ),
      ])
    ).rejects.toThrow();

    expect(mockFetch).not.toHaveBeenCalled();
  }, 10_000);
});
