/**
 * BuscarPorQrButton — leer el QR de una persona abre su ficha.
 *
 * El QR canónico (`shared/qr/payload.ts`) lleva el `persons.id`, así que el
 * escaneo resuelve la identidad sin pasar por el servidor. Aquí se prueba el
 * contrato de la UI: QR válido → navegación a la ficha; QR ajeno → aviso y
 * ninguna navegación.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// vi.mock se iza al tope del fichero: las referencias del factory deben
// crearse con vi.hoisted o llegan antes de su inicialización.
const { navigate, toastError } = vi.hoisted(() => ({
  navigate: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/personas", navigate],
}));

vi.mock("sonner", () => ({ toast: { error: toastError } }));

// La cámara real usa getUserMedia, no disponible en jsdom: se sustituye por un
// botón que emite el valor decodificado (mismo patrón que
// client/src/features/programs/__tests__/sesiones.test.tsx:87-89).
vi.mock("@/features/checkin/components/QRScanner", () => ({
  QRScanner: ({ onDecoded }: { onDecoded: (v: string) => void; onCancel: () => void }) => (
    <button onClick={() => onDecoded((globalThis as { __qr?: string }).__qr ?? "")}>
      simular-escaneo
    </button>
  ),
}));

import { BuscarPorQrButton } from "../components/BuscarPorQrButton";

const UUID = "3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607";

async function escanear(valor: string) {
  (globalThis as { __qr?: string }).__qr = valor;
  const user = userEvent.setup();
  render(<BuscarPorQrButton />);
  await user.click(screen.getByRole("button", { name: /escanear qr/i }));
  await user.click(await screen.findByRole("button", { name: "simular-escaneo" }));
}

describe("BuscarPorQrButton", () => {
  beforeEach(() => {
    navigate.mockClear();
    toastError.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("un QR de Bocatas abre la ficha de esa persona", async () => {
    await escanear(`bocatas://person/${UUID}?sig=a1b2c3d4`);
    expect(navigate).toHaveBeenCalledWith(`/personas/${UUID}`);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("un QR ajeno avisa y no navega", async () => {
    await escanear("https://example.com/algo");
    expect(navigate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("QR no válido — no es un código de Bocatas.");
  });

  it("cierra el diálogo también tras un QR inválido — el escáner es one-shot y quedaría muerto", async () => {
    await escanear("https://example.com/algo");
    expect(screen.queryByRole("button", { name: "simular-escaneo" })).toBeNull();
  });

  it("un UUID pelado sin firma no cuenta como QR de Bocatas", async () => {
    await escanear(UUID);
    expect(navigate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("cierra el diálogo tras un escaneo válido (la cámara no queda abierta)", async () => {
    await escanear(`bocatas://person/${UUID}?sig=a1b2c3d4`);
    expect(screen.queryByRole("button", { name: "simular-escaneo" })).toBeNull();
  });
});
