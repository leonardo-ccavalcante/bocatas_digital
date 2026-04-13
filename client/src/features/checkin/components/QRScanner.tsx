/**
 * QRScanner.tsx — Camera-based QR scanner using native getUserMedia + jsQR.
 *
 * Root cause of previous bug: html5-qrcode reads element.clientWidth at mount time
 * and falls back to 300px if the container hasn't laid out yet. This caused the
 * video to render at 300px in a full-width container, leaving the rest empty.
 *
 * Fix: Use native getUserMedia with a <video> element we fully control.
 * The video is styled width:100% / height:100% / object-fit:cover so it always
 * fills the container regardless of when the stream starts. jsQR scans frames
 * via a hidden canvas at 10fps.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import { Camera, X, Loader2, AlertCircle } from "lucide-react";

interface QRScannerProps {
  onDecoded: (value: string) => void;
  onCancel: () => void;
  isDemoMode?: boolean;
}

export function QRScanner({ onDecoded, onCancel, isDemoMode = false }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const hasDecodedRef = useRef(false);

  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Scan loop ──────────────────────────────────────────────────────────────
  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "dontInvert",
    });

    if (code && !hasDecodedRef.current) {
      hasDecodedRef.current = true;
      stopCamera();
      onDecoded(code.data);
      return;
    }

    // Schedule next frame (~10fps)
    rafRef.current = setTimeout(() => {
      rafRef.current = requestAnimationFrame(scanFrame);
    }, 100) as unknown as number;
  }, [onDecoded]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current as number);
      clearTimeout(rafRef.current as unknown as number);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── Start camera ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isDemoMode) {
      setStatus("scanning");
      const timer = setTimeout(() => {
        if (!hasDecodedRef.current) {
          hasDecodedRef.current = true;
          onDecoded("bocatas://person/b0000000-0000-0000-0000-000000000002");
        }
      }, 1500);
      return () => clearTimeout(timer);
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.play().then(() => {
            setStatus("scanning");
            rafRef.current = requestAnimationFrame(scanFrame);
          });
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        const isPermission =
          err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
        setErrorMsg(
          isPermission
            ? "Permiso de cámara denegado. Activa el acceso a la cámara en la configuración del navegador."
            : "No se pudo iniciar la cámara. Comprueba que ninguna otra app la esté usando."
        );
        setStatus("error");
      });

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isDemoMode, scanFrame, stopCamera, onDecoded]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* ── Viewfinder ── */}
      <div
        className="relative w-full rounded-xl overflow-hidden border-2 border-primary/30 bg-black"
        style={{ minHeight: "60vh" }}
      >
        {/* Demo mode overlay */}
        {isDemoMode ? (
          <div className="absolute inset-0 flex items-center justify-center bg-amber-950/20">
            <div className="text-center p-6">
              <Camera className="w-12 h-12 text-amber-400 mx-auto mb-3 animate-pulse" />
              <p className="text-amber-300 font-medium">Modo Demo</p>
              <p className="text-amber-400/70 text-sm mt-1">Simulando escaneo de QR...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Native video — fills container via CSS */}
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />

            {/* Hidden canvas for jsQR frame capture */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Starting overlay */}
            {status === "starting" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="flex flex-col items-center gap-2 text-white">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">Iniciando cámara…</p>
                </div>
              </div>
            )}

            {/* Error overlay */}
            {status === "error" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
                <div className="flex flex-col items-center gap-3 text-center">
                  <AlertCircle className="h-10 w-10 text-destructive" />
                  <p className="text-sm text-white">{errorMsg}</p>
                </div>
              </div>
            )}

            {/* Scanning crosshair */}
            {status === "scanning" && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-white/70 rounded-lg shadow-lg" />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Hint ── */}
      {status !== "error" && (
        <p className="text-sm text-muted-foreground text-center">
          Apunta la cámara al código QR de la tarjeta del beneficiario
        </p>
      )}

      {/* ── Cancel ── */}
      <Button variant="outline" onClick={onCancel} className="gap-2">
        <X className="w-4 h-4" />
        Cancelar
      </Button>
    </div>
  );
}
