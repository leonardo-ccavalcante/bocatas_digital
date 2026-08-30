/**
 * CameraCaptureButton.test.tsx — «no deja usar cámara, te lleva al equipo»
 * (ALTAS-7 en la foto de perfil, ALTAS-9 en el documento firmado).
 *
 * Causa raíz: los dos botones eran un `<input type="file">` oculto al que se le
 * ponía el atributo `capture` y se le hacía click. `capture` es una SUGERENCIA
 * que sólo honran algunos navegadores móviles; en escritorio se ignora en
 * silencio y se abre el explorador de archivos — exactamente lo reportado. El
 * escáner de documentos sí abría cámara porque usa `getUserMedia`.
 *
 * Este test fija la regla: el botón de cámara pide cámara.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CameraCaptureButton } from "../CameraCaptureButton";

const getUserMedia = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
});
afterEach(cleanup);

function fakeStream() {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
}

describe("CameraCaptureButton", () => {
  it("pide la cámara frontal cuando se usa para la foto de perfil", async () => {
    getUserMedia.mockResolvedValue(fakeStream());
    const user = userEvent.setup();
    render(<CameraCaptureButton facingMode="user" label="Usar cámara" onCapture={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Usar cámara/i }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    expect(getUserMedia.mock.calls[0][0].video.facingMode).toBe("user");
  });

  it("pide la cámara trasera para fotografiar un documento", async () => {
    getUserMedia.mockResolvedValue(fakeStream());
    const user = userEvent.setup();
    render(<CameraCaptureButton facingMode="environment" label="Cámara" onCapture={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Cámara/i }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    expect(getUserMedia.mock.calls[0][0].video.facingMode).toBe("environment");
  });

  it("nunca recurre a un input file con atributo capture", async () => {
    getUserMedia.mockResolvedValue(fakeStream());
    const { container } = render(
      <CameraCaptureButton facingMode="user" label="Usar cámara" onCapture={vi.fn()} />
    );
    expect(container.querySelector("input[type=file]")).toBeNull();
    expect(container.querySelector("[capture]")).toBeNull();
  });

  it("avisa de forma accesible cuando se deniega el permiso", async () => {
    getUserMedia.mockRejectedValue(new Error("NotAllowedError"));
    const user = userEvent.setup();
    render(<CameraCaptureButton facingMode="user" label="Usar cámara" onCapture={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Usar cámara/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/no se pudo acceder a la cámara/i);
  });

  it("apaga la cámara al desmontarse", async () => {
    const stop = vi.fn();
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    const user = userEvent.setup();
    const { unmount } = render(
      <CameraCaptureButton facingMode="user" label="Usar cámara" onCapture={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: /Usar cámara/i }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    // Si el voluntario cierra el wizard o cambia de fase con el visor abierto, la
    // pista seguía viva: LED encendido y batería consumiéndose en el Android de
    // gama baja que es el dispositivo primario del proyecto.
    unmount();
    expect(stop).toHaveBeenCalled();
  });

  it("muestra el visor con la vista enmascarada para PostHog", async () => {
    getUserMedia.mockResolvedValue(fakeStream());
    const user = userEvent.setup();
    const { container } = render(
      <CameraCaptureButton facingMode="user" label="Usar cámara" onCapture={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: /Usar cámara/i }));

    const video = await waitFor(() => {
      const v = container.querySelector("video");
      expect(v).not.toBeNull();
      return v as HTMLVideoElement;
    });
    expect(video.className).toContain("ph-no-capture");
    expect(screen.getByRole("button", { name: /Capturar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancelar/i })).toBeInTheDocument();
  });
});
