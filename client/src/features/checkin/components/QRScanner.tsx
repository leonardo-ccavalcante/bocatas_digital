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
  // Phase 6 QA-2 (F-202): split into two refs — raf IDs are number, setTimeout
  // returns number in browser DOM but `NodeJS.Timeout` in Node typings. Conflating
  // them via `as unknown as number` masked a real type-safety hole. Each ref now
  // holds the platform-correct shape and is cleared via the matching API.
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDecodedRef = useRef(false);
  // Use ref for callbacks to avoid stale closures and prevent scan loop restarts on parent re-renders
  const onDecodedRef = useRef(onDecoded);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onDecodedRef.current = onDecoded; }, [onDecoded]);
  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

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
        onDecodedRef.current(code.data);
        return;
      }

    // Schedule next frame (~10fps) — store timeout in timeoutRef, schedule
    // raf inside the callback and store its handle in rafRef.
    timeoutRef.current = setTimeout(() => {
      rafRef.current = requestAnimationFrame(scanFrame);
    }, 100);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally empty: refs are mutable cells, no closure issues

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
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
          onDecodedRef.current("bocatas://person/b0000000-0000-0000-0000-000000000002");
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
      {/*
        Prototype reference: checkin.jsx ScannerView (lines 150–179).
        Square dark viewport with brand-red L-shaped corner brackets and an
        animated scan-line. The @keyframes scanline lives in index.css.
        Camera <video>/canvas/stream logic below is entirely unchanged.
      */}
      <div
        className="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden bg-[#1A1A1A]"
        style={{ boxShadow: "0 20px 50px -12px rgba(0,0,0,0.4)" }}
        aria-label="Visor de escaneo QR"
        role="img"
      >
        {/* Demo mode overlay */}
        {isDemoMode ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="absolute inset-0"
              style={{ background: "radial-gradient(circle at 30% 30%, #2a2a2a, #0a0a0a)" }}
            />
            <div className="relative text-center p-6">
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
              className="ph-no-capture absolute inset-0 w-full h-full object-cover"
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
          </>
        )}

        {/* ── Corner brackets (prototype L-shape, brand red) ── */}
        {/* top-left */}
        <div
          className="absolute pointer-events-none"
          style={{ top: 24, left: 24, width: 36, height: 36,
            borderTop: "3px solid var(--primary)", borderLeft: "3px solid var(--primary)",
            borderRadius: 8 }}
          aria-hidden="true"
        />
        {/* top-right */}
        <div
          className="absolute pointer-events-none"
          style={{ top: 24, right: 24, width: 36, height: 36,
            borderTop: "3px solid var(--primary)", borderRight: "3px solid var(--primary)",
            borderRadius: 8 }}
          aria-hidden="true"
        />
        {/* bottom-left */}
        <div
          className="absolute pointer-events-none"
          style={{ bottom: 24, left: 24, width: 36, height: 36,
            borderBottom: "3px solid var(--primary)", borderLeft: "3px solid var(--primary)",
            borderRadius: 8 }}
          aria-hidden="true"
        />
        {/* bottom-right */}
        <div
          className="absolute pointer-events-none"
          style={{ bottom: 24, right: 24, width: 36, height: 36,
            borderBottom: "3px solid var(--primary)", borderRight: "3px solid var(--primary)",
            borderRadius: 8 }}
          aria-hidden="true"
        />

        {/* ── Animated scan-line ── */}
        <div
          className="absolute left-8 right-8 h-[2px] pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent, var(--primary), transparent)",
            animation: "scanline 1.6s ease-in-out infinite alternate",
            top: "50%",
          }}
          aria-hidden="true"
        />

        {/* Hint label at bottom of viewport */}
        <p className="absolute bottom-3 left-0 right-0 text-center text-white/60 text-xs pointer-events-none">
          Apunta al QR
        </p>
      </div>

      {/* ── Hint (below viewport) ── */}
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
