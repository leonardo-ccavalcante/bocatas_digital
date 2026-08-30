/**
 * CameraCaptureButton — botón de cámara que abre cámara de verdad.
 *
 * El atributo `capture` de `<input type="file">` es sólo una sugerencia: la
 * honran algunos navegadores móviles y el resto la ignora en silencio y abre el
 * explorador de archivos. Por eso "Usar cámara" llevaba al equipo (ALTAS-7,
 * ALTAS-9) mientras el escáner de documentos, que usa `getUserMedia`, sí
 * funcionaba.
 *
 * Devuelve un File para que el llamante reutilice su ruta de compresión y no
 * tenga que aprender un formato nuevo.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, SwitchCamera, X } from "lucide-react";

type Facing = "user" | "environment";

interface CameraCaptureButtonProps {
  /**
   * Cámara con la que se ABRE el visor: "user" = frontal (autofoto),
   * "environment" = trasera (documentos). No la fija: dentro del visor se
   * puede girar. La foto de perfil abría en frontal y no había forma de
   * cambiarla, así que fotografiar el documento de alguien que ya no está
   * delante era imposible sin darle el móvil a la persona.
   */
  facingMode: Facing;
  label: string;
  onCapture: (file: File) => void;
  className?: string;
}

export function CameraCaptureButton({
  facingMode,
  label,
  onCapture,
  className,
}: CameraCaptureButtonProps) {
  const [facing, setFacing] = useState<Facing>(facingMode);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // `getUserMedia` no resuelve hasta que la persona toca "Permitir", y para
  // entonces el componente puede llevar rato desmontado. Sin esta marca, la
  // limpieza corría con streamRef todavía a null y la pista quedaba viva:
  // LED encendido y batería hasta recargar la página.
  const montado = useRef(true);
  const [open, setOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOpen(false);
  }, []);

  // Cerrar el wizard o cambiar de fase con el visor abierto dejaba la pista de
  // vídeo viva: LED encendido y batería consumiéndose en el Android de gama baja
  // que es el dispositivo primario. La ref no cambia, así que basta al desmontar.
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const start = useCallback(async (modo: Facing) => {
    setErrorMsg(null);
    try {
      if (streamRef.current !== null) return; // doble toque: ya hay una cámara abierta
      const stream = await navigator.mediaDevices.getUserMedia({
        // El llamante comprime después (800 px la foto de perfil, 1200 px el
        // documento), así que se pide al sensor lo máximo razonable: un
        // consentimiento firmado fotografiado a 720p pierde legibilidad.
        video: { facingMode: modo, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (!montado.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setFacing(modo);
      setOpen(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 50);
    } catch {
      setErrorMsg("No se pudo acceder a la cámara. Usa el botón de subir imagen.");
    }
  }, []);

  /**
   * Girar = soltar la pista actual y pedir la contraria. Hay que parar antes:
   * muchos Android sólo sirven una cámara a la vez y devuelven la misma pista
   * si se pide la segunda con la primera todavía viva.
   */
  const girar = useCallback(async () => {
    const siguiente: Facing = facing === "user" ? "environment" : "user";
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    await start(siguiente);
  }, [facing, start]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    stop();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    if (!blob) {
      setErrorMsg("Error al capturar la foto. Inténtalo de nuevo.");
      return;
    }
    onCapture(new File([blob], "camara.jpg", { type: "image/jpeg" }));
  }, [onCapture, stop]);

  if (open) {
    return (
      <div className="space-y-2">
        {/* ph-no-capture: la sesión de PostHog nunca debe grabar un documento
            ni la cara de una persona beneficiaria. */}
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            aria-label="Vista previa de la cámara"
            className="ph-no-capture w-full"
          />
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={stop} className="flex-1">
            <X className="mr-1 h-4 w-4" /> Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void girar()}
            aria-label={
              facing === "user"
                ? "Cambiar a la cámara trasera"
                : "Cambiar a la cámara frontal"
            }
            className="flex-1"
          >
            <SwitchCamera className="mr-1 h-4 w-4" aria-hidden="true" /> Girar
          </Button>
          <Button type="button" size="sm" onClick={() => void capture()} className="flex-1">
            <Camera className="mr-1 h-4 w-4" /> Capturar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => void start(facingMode)}
      >
        <Camera className="mr-1 h-4 w-4" /> {label}
      </Button>
      {errorMsg && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
