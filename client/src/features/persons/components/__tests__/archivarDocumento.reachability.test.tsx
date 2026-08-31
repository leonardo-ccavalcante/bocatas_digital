/**
 * La casilla de "archivar la foto del documento" tiene que seguir en pantalla
 * DESPUÉS de un OCR con éxito.
 *
 * REGRESIÓN QUE ESTE TEST FIJA: la casilla vivía dentro de DocumentCaptureInline,
 * en su estado `done`. Pero al extraer los datos, `onExtracted` marca `ocrUsed`
 * (Step1) o rellena `numero_documento` (Step2), y el paso DESMONTA el componente
 * de captura en ese mismo render. Resultado: el estado `done` nunca llegaba a
 * pintarse y la casilla era inalcanzable justo en el único camino que la
 * necesita — el escaneo con éxito. La foto se seguía tirando, exactamente el
 * fallo que la funcionalidad venía a arreglar.
 *
 * El arreglo separa las dos cosas: la captura entrega la imagen al paso en
 * cuanto existe, y la casilla la pinta el paso, que no se desmonta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DocumentCaptureInline } from "../DocumentCaptureInline";
import { ArchivarDocumentoCheckbox } from "../ArchivarDocumentoCheckbox";
import type { OcrExtracted } from "../../schemas";

const runOCRMock = vi.fn();

vi.mock("../../hooks/useOCRDocument", () => ({
  useOCRDocument: () => ({ mutate: runOCRMock, isPending: false }),
}));

vi.mock("../../utils/imageUtils", () => ({
  compressImage: vi.fn(async () => "BASE64DELDOCUMENTO"),
}));

/**
 * Réplica mínima de lo que hacen Step1Identidad y Step2Documento: montan la
 * captura mientras no haya datos y la DESMONTAN en cuanto el OCR extrae algo.
 * Es esa conmutación la que rompía la casilla.
 */
function PasoConOcr() {
  const [ocrUsed, setOcrUsed] = useState(false);
  const [imagen, setImagen] = useState<string | null>(null);
  const [archivar, setArchivar] = useState(false);

  return (
    <div>
      {!ocrUsed ? (
        <DocumentCaptureInline
          onExtracted={() => setOcrUsed(true)}
          onImagenCapturada={(b) => {
            setImagen(b);
            if (b === null) setArchivar(false);
          }}
        />
      ) : (
        <p>Datos extraídos del documento.</p>
      )}
      <ArchivarDocumentoCheckbox
        hayImagen={imagen !== null}
        archivar={archivar}
        onChange={setArchivar}
      />
      <output data-testid="estado">
        {archivar && imagen ? `ARCHIVA:${imagen}` : "NO-ARCHIVA"}
      </output>
    </div>
  );
}

async function subirDocumento(user: ReturnType<typeof userEvent.setup>) {
  const fichero = new File(["x"], "dni.jpg", { type: "image/jpeg" });
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  await user.upload(input as HTMLInputElement, fichero);
}

// Sin globals de testing-library no hay limpieza automática entre casos y los
// montajes se acumulan en el mismo document.
afterEach(cleanup);

beforeEach(() => {
  runOCRMock.mockReset();
  // OCR con éxito: devuelve un campo con valor, que es lo que dispara onExtracted.
  runOCRMock.mockImplementation((_input, opts) => {
    opts.onSuccess({
      success: true,
      data: { nombre: "Awa", apellidos: null } as unknown as OcrExtracted,
    });
  });
});

describe("archivar la foto del documento", () => {
  it("la casilla NO aparece antes de capturar nada", () => {
    render(<PasoConOcr />);
    expect(screen.queryByLabelText(/Archivar la foto del documento/i)).toBeNull();
  });

  it("la casilla aparece al capturar y SIGUE ahí tras un OCR con éxito", async () => {
    const user = userEvent.setup();
    render(<PasoConOcr />);

    await subirDocumento(user);
    await screen.findByLabelText(/Archivar la foto del documento/i);

    // Extraer los datos desmonta la captura — que es donde vivía la casilla.
    await user.click(screen.getByRole("button", { name: /Extraer datos/i }));
    await screen.findByText(/Datos extraídos del documento/i);

    // La regresión: aquí había CERO casillas.
    expect(screen.getByLabelText(/Archivar la foto del documento/i)).toBeInTheDocument();
  });

  it("por defecto NO se archiva; sólo al marcarla", async () => {
    const user = userEvent.setup();
    render(<PasoConOcr />);

    await subirDocumento(user);
    await user.click(screen.getByRole("button", { name: /Extraer datos/i }));
    await screen.findByText(/Datos extraídos del documento/i);

    expect(screen.getByTestId("estado")).toHaveTextContent("NO-ARCHIVA");

    await user.click(screen.getByLabelText(/Archivar la foto del documento/i));
    await waitFor(() =>
      expect(screen.getByTestId("estado")).toHaveTextContent("ARCHIVA:BASE64DELDOCUMENTO")
    );
  });

  it("repetir la captura retira la imagen y el permiso", async () => {
    const user = userEvent.setup();
    render(<PasoConOcr />);

    await subirDocumento(user);
    await user.click(screen.getByLabelText(/Archivar la foto del documento/i));
    await waitFor(() =>
      expect(screen.getByTestId("estado")).toHaveTextContent("ARCHIVA:")
    );

    await user.click(screen.getByRole("button", { name: /Repetir/i }));

    // Sin imagen no hay casilla, y no se archiva nada: no se guarda una foto
    // vieja junto a los datos de una captura nueva.
    await waitFor(() =>
      expect(screen.queryByLabelText(/Archivar la foto del documento/i)).toBeNull()
    );
    expect(screen.getByTestId("estado")).toHaveTextContent("NO-ARCHIVA");
  });
});
