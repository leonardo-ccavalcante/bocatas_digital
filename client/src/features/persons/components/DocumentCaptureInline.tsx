/**
 * DocumentCaptureInline — inline document capture + OCR component.
 *
 * Unlike DocumentCaptureModal, this renders inline within the Step 2 form
 * (no dialog overlay). The OCR fills the document fields directly.
 *
 * BUG 1 FIX: The capture and OCR confirmation now live in the same step as
 * the document form fields, so the user sees the extracted data immediately
 * and can verify/edit before moving to the next step.
 */
import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X, Loader2, AlertCircle, ScanLine, CheckCircle2 } from "lucide-react";
import { compressImage } from "../utils/imageUtils";
import { useOCRDocument } from "../hooks/useOCRDocument";
import type { OcrExtracted } from "../schemas";

type CaptureState = "idle" | "camera" | "preview" | "processing" | "done";

interface DocumentCaptureInlineProps {
  onExtracted: (data: OcrExtracted) => void;
}

export function DocumentCaptureInline({ onExtracted }: DocumentCaptureInlineProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { mutate: runOCR, isPending: isOCRRunning } = useOCRDocument();

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopCamera();
    setCaptureState("idle");
    setPreviewUrl(null);
    setCapturedBase64(null);
    setErrorMsg(null);
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCaptureState("camera");
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch {
      setErrorMsg("No se pudo acceder a la cámara. Usa el botón de subir archivo.");
    }
  }, []);

  const captureFromCamera = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1] ?? "";
    stopCamera();
    setPreviewUrl(dataUrl);
    setCapturedBase64(base64);
    setCaptureState("preview");
  }, [stopCamera]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const base64 = await compressImage(file);
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      setPreviewUrl(dataUrl);
      setCapturedBase64(base64);
      setCaptureState("preview");
    } catch {
      setErrorMsg("Error al procesar la imagen. Inténtalo de nuevo.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleExtract = useCallback(() => {
    if (!capturedBase64) return;
    setCaptureState("processing");
    runOCR(
      { base64Image: capturedBase64 },
      {
        onSuccess: (result) => {
          if (result.success && Object.keys(result.data).length > 0) {
            onExtracted(result.data);
            setCaptureState("done");
          } else {
            setErrorMsg("No se pudieron extraer datos. Rellena el formulario manualmente.");
            setCaptureState("preview");
          }
        },
        onError: () => {
          setErrorMsg("Error al procesar el documento. Continúa rellenando manualmente.");
          setCaptureState("preview");
        },
      }
    );
  }, [capturedBase64, runOCR, onExtracted]);

  // ── Idle: show capture buttons ──────────────────────────────────────────────
  if (captureState === "idle") {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ScanLine className="h-4 w-4" />
          <span>Escanear documento (opcional)</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Toma una foto o sube una imagen del DNI, NIE o pasaporte para rellenar los campos automáticamente.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={startCamera}
          >
            <Camera className="h-4 w-4" />
            Usar cámara
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Subir imagen
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
        {errorMsg && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    );
  }

  // ── Camera: live viewfinder ─────────────────────────────────────────────────
  if (captureState === "camera") {
    return (
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="w-full" />
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={reset} className="flex-1">
            <X className="mr-1 h-4 w-4" /> Cancelar
          </Button>
          <Button type="button" size="sm" onClick={captureFromCamera} className="flex-1">
            <Camera className="mr-1 h-4 w-4" /> Capturar
          </Button>
        </div>
      </div>
    );
  }

  // ── Preview / Processing: show image + extract button ───────────────────────
  if ((captureState === "preview" || captureState === "processing") && previewUrl) {
    return (
      <div className="space-y-3">
        <img
          src={previewUrl}
          alt="Vista previa del documento"
          className="w-full rounded-lg object-contain max-h-48"
        />
        {errorMsg && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={isOCRRunning}
            className="flex-1"
          >
            <X className="mr-1 h-4 w-4" /> Repetir
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleExtract}
            disabled={isOCRRunning}
            className="flex-1"
          >
            {isOCRRunning ? (
              <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Procesando...</>
            ) : (
              <><ScanLine className="mr-1 h-4 w-4" /> Extraer datos</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Done: success state ─────────────────────────────────────────────────────
  if (captureState === "done") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>Datos extraídos. Revisa y edita los campos si es necesario.</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-2 text-xs text-green-600"
          onClick={reset}
        >
          Volver a escanear
        </Button>
      </div>
    );
  }

  return null;
}
