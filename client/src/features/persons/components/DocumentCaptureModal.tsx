import { useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Upload, X, Loader2, AlertCircle } from "lucide-react";
import { compressImage } from "../utils/imageUtils";
import { useOCRDocument } from "../hooks/useOCRDocument";
import type { OcrExtracted } from "../schemas";

interface DocumentCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onExtracted: (data: OcrExtracted) => void;
}

type CaptureState = "idle" | "camera" | "preview" | "processing";

export function DocumentCaptureModal({ open, onClose, onExtracted }: DocumentCaptureModalProps) {
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

  const handleClose = useCallback(() => {
    stopCamera();
    setCaptureState("idle");
    setPreviewUrl(null);
    setCapturedBase64(null);
    setErrorMsg(null);
    onClose();
  }, [stopCamera, onClose]);

  const startCamera = useCallback(async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCaptureState("camera");
      // Wait for next tick so videoRef is mounted
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
    // Reset input
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
            handleClose();
          } else {
            setErrorMsg("No se pudieron extraer datos del documento. Rellena el formulario manualmente.");
            setCaptureState("preview");
          }
        },
        onError: () => {
          setErrorMsg("Error al procesar el documento. Puedes continuar manualmente.");
          setCaptureState("preview");
        },
      }
    );
  }, [capturedBase64, runOCR, onExtracted, handleClose]);

  const handleRetry = useCallback(() => {
    setPreviewUrl(null);
    setCapturedBase64(null);
    setErrorMsg(null);
    setCaptureState("idle");
  }, []);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Capturar documento de identidad</DialogTitle>
          <DialogDescription>
            Toma una foto o sube una imagen del DNI, NIE o pasaporte para rellenar el formulario automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error message */}
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Idle state */}
          {captureState === "idle" && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-24 flex-col gap-2"
                onClick={startCamera}
              >
                <Camera className="h-6 w-6" />
                <span className="text-xs">Usar cámara</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 flex-col gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-6 w-6" />
                <span className="text-xs">Subir imagen</span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          )}

          {/* Camera state */}
          {captureState === "camera" && (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-lg bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full"
                />
                <canvas ref={canvasRef} className="hidden" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleRetry} className="flex-1">
                  <X className="mr-1 h-4 w-4" /> Cancelar
                </Button>
                <Button size="sm" onClick={captureFromCamera} className="flex-1">
                  <Camera className="mr-1 h-4 w-4" /> Capturar
                </Button>
              </div>
            </div>
          )}

          {/* Preview state */}
          {(captureState === "preview" || captureState === "processing") && previewUrl && (
            <div className="space-y-3">
              <img
                src={previewUrl}
                alt="Vista previa del documento"
                className="w-full rounded-lg object-contain"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  disabled={isOCRRunning}
                  className="flex-1"
                >
                  <X className="mr-1 h-4 w-4" /> Repetir
                </Button>
                <Button
                  size="sm"
                  onClick={handleExtract}
                  disabled={isOCRRunning}
                  className="flex-1"
                >
                  {isOCRRunning ? (
                    <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Procesando...</>
                  ) : (
                    "Extraer datos"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Skip button */}
          <Button variant="ghost" size="sm" className="w-full" onClick={handleClose}>
            Continuar sin escanear
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
