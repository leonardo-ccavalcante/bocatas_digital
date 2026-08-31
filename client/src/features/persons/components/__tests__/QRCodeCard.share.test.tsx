/**
 * QRCodeCard — compartir e imprimir en el móvil.
 *
 * Tres fallos silenciosos que dejaban el botón inservible justo en el
 * dispositivo desde el que se pide (feedback: "compartir el QR desde el móvil"):
 *
 *  1. `navigator.share` existir NO implica que acepte ficheros. Varios WebView de
 *     Android rechazan {files} con TypeError, y el `catch {}` se lo tragaba como
 *     "el usuario canceló": ni compartía ni copiaba, y sin ningún aviso.
 *  2. `navigator.clipboard` sólo existe en contexto seguro. Sobre http://<ip> es
 *     undefined y el fallback lanzaba un TypeError no capturado.
 *  3. `window.open` devuelve null en una PWA instalada o con el bloqueador de
 *     pop-ups: "Imprimir" no hacía absolutamente nada.
 *
 * Un botón que no hace nada es peor que uno que dice por qué no puede.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockToast, mockUseQuery } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockUseQuery: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: mockToast }));

vi.mock("qrcode", () => ({
  default: { toCanvas: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: { persons: { getQrPayload: { useQuery: mockUseQuery } } },
}));

import { QRCodeCard } from "../QRCodeCard";

const PERSON = { id: "11111111-1111-1111-1111-111111111111", nombre: "Ana", apellidos: "García" };
const PAYLOAD = "bocatas://person/11111111-1111-1111-1111-111111111111?sig=deadbeef";
const DATA_URL = "data:image/png;base64,AAAA";

/** Sustituye una propiedad de navigator y devuelve cómo restaurarla. */
function stubNavigator(props: Record<string, unknown>) {
  const previos = Object.keys(props).map((k) => [k, (navigator as never)[k]] as const);
  for (const [k, v] of Object.entries(props)) {
    Object.defineProperty(navigator, k, { value: v, configurable: true, writable: true });
  }
  return () => {
    for (const [k, v] of previos) {
      Object.defineProperty(navigator, k, { value: v, configurable: true, writable: true });
    }
  };
}

let restaurar: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQuery.mockReturnValue({ data: { payload: PAYLOAD }, isLoading: false, isError: false });
  // jsdom sin el paquete `canvas` lanza "not implemented" en toDataURL.
  HTMLCanvasElement.prototype.toDataURL = () => DATA_URL;
  global.fetch = vi.fn().mockResolvedValue({ blob: async () => new Blob(["x"]) }) as never;
});

afterEach(() => {
  restaurar?.();
  restaurar = null;
  cleanup();
});

/** Renderiza y espera a que el QR esté listo (los botones nacen deshabilitados). */
async function renderListo() {
  render(<QRCodeCard person={PERSON} />);
  const compartir = screen.getByRole("button", { name: "Compartir QR" });
  await waitFor(() => expect(compartir).not.toBeDisabled());
  return compartir;
}

describe("QRCodeCard — compartir", () => {
  it("si el navegador no puede compartir ficheros, copia la URI y lo dice", async () => {
    const share = vi.fn();
    restaurar = stubNavigator({
      share,
      canShare: () => false,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    const compartir = await renderListo();
    await userEvent.click(compartir);

    expect(share).not.toHaveBeenCalled();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(PAYLOAD);
    expect(mockToast.success).toHaveBeenCalled();
  });

  it("un fallo real del share cae al portapapeles (antes se tragaba como cancelación)", async () => {
    restaurar = stubNavigator({
      share: vi.fn().mockRejectedValue(new TypeError("files no soportado")),
      canShare: () => true,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    await userEvent.click(await renderListo());

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(PAYLOAD);
  });

  it("una cancelación de verdad (AbortError) no copia nada ni avisa", async () => {
    const abort = Object.assign(new Error("cancelado"), { name: "AbortError" });
    restaurar = stubNavigator({
      share: vi.fn().mockRejectedValue(abort),
      canShare: () => true,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    await userEvent.click(await renderListo());

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("sin portapapeles (contexto inseguro) avisa en vez de reventar", async () => {
    restaurar = stubNavigator({ share: undefined, canShare: undefined, clipboard: undefined });

    await userEvent.click(await renderListo());

    expect(mockToast.error).toHaveBeenCalled();
  });
});

describe("QRCodeCard — imprimir", () => {
  it("si el navegador bloquea la ventana, lo dice en vez de callar", async () => {
    restaurar = stubNavigator({ share: undefined, canShare: undefined, clipboard: undefined });
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    render(<QRCodeCard person={PERSON} />);
    const imprimir = screen.getByRole("button", { name: "Imprimir QR" });
    await waitFor(() => expect(imprimir).not.toBeDisabled());
    await userEvent.click(imprimir);

    expect(openSpy).toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
