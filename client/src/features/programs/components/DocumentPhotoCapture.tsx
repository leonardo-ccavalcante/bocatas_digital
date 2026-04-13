/**
 * DocumentPhotoCapture.tsx — D-F3: Camera/upload → Storage → AI extraction → field suggestions.
 * Reusable building block for Task 6 (Familia intake) and identity document capture.
 *
 * Flow: camera/gallery → compressImage() → upload to Supabase Storage
 *       → call extract-document Edge Function with extractionType
 *       → receive JSON fields → call onExtract
 *
 * NOTE: extraction is non-blocking. If it fails, show toast but do NOT block the form.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Camera, Upload, Loader2, CheckCircle, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export type ExtractionType = "identity_doc" | "delivery_sheet";

export interface DocumentPhotoCaptureProps {
  /** Type of document to extract fields from */
  extractionType: ExtractionType;
  /** Supabase storage bucket name */
  storageBucket: string;
  /** Storage path (e.g., `${familyId}/${date}.jpg`) */
  storagePath: string;
  /** Called with AI-extracted fields after successful extraction */
  onExtract?: (fields: Record<string, unknown>) => void;
  /** Called with the Storage URL after successful upload */
  onUpload?: (url: string) => void;
  /** Button label */
  label?: string;
  /** Max file size in bytes (default 16MB) */
  maxSizeBytes?: number;
  className?: string;
}

type UploadState = "idle" | "uploading" | "extracting" | "done" | "error";

/**
 * Compress an image file to reduce upload size.
 * Returns a Blob with JPEG compression at 0.8 quality.
 */
async function compressImage(file: File, maxDimension = 1920): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas context unavailable"));
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Compression failed"));
          resolve(blob);
        },
        "image/jpeg",
        0.8
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}

export function DocumentPhotoCapture({
  extractionType,
  storageBucket,
  storagePath,
  onExtract,
  onUpload,
  label = "Capturar documento",
  maxSizeBytes = 16 * 1024 * 1024,
  className,
}: DocumentPhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Size validation
    if (file.size > maxSizeBytes) {
      toast.error(`El archivo supera el límite de ${Math.round(maxSizeBytes / 1024 / 1024)} MB`);
      return;
    }

    // Show preview
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setState("uploading");

    try {
      // Compress image
      const compressed = await compressImage(file);

      // Upload to Supabase Storage
      const supabase = createClient();
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(storageBucket)
        .upload(storagePath, compressed, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(storageBucket)
        .getPublicUrl(uploadData.path);

      const publicUrl = urlData.publicUrl;
      setUploadedUrl(publicUrl);
      onUpload?.(publicUrl);

      // Non-blocking AI extraction
      setState("extracting");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        const extractRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-document`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              imageUrl: publicUrl,
              extractionType,
            }),
          }
        );

        if (extractRes.ok) {
          const extracted = await extractRes.json();
          onExtract?.(extracted.fields ?? extracted);
        }
        // If extraction fails, we still mark as done (non-blocking)
      } catch {
        // Extraction failure is non-blocking — just show toast
        toast.warning("Extracción automática no disponible. Completa los campos manualmente.");
      }

      setState("done");
    } catch (err: any) {
      setState("error");
      toast.error(err?.message ?? "Error al subir el documento");
    } finally {
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setUploadedUrl(null);
    setState("idle");
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Preview */}
      {previewUrl && (
        <div className="relative rounded-lg overflow-hidden border bg-muted/30">
          <img
            src={previewUrl}
            alt="Vista previa del documento"
            className="w-full max-h-48 object-contain"
          />
          {state !== "uploading" && state !== "extracting" && (
            <button
              type="button"
              onClick={handleReset}
              className="absolute top-2 right-2 rounded-full bg-background/80 p-1 hover:bg-background transition-colors"
              aria-label="Eliminar imagen"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {/* State overlay */}
          {(state === "uploading" || state === "extracting") && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-sm">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-muted-foreground">
                  {state === "uploading" ? "Subiendo..." : "Extrayendo datos..."}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status badge */}
      {state === "done" && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Documento guardado</span>
        </div>
      )}
      {state === "error" && (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Error al subir. Inténtalo de nuevo.</span>
        </div>
      )}

      {/* Upload button */}
      {state === "idle" || state === "error" ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
            id={`doc-capture-${storagePath.replace(/\//g, "-")}`}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 flex-1"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute("capture");
                  fileInputRef.current.click();
                }
              }}
            >
              <Upload className="w-4 h-4" />
              Subir archivo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 flex-1"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.setAttribute("capture", "environment");
                  fileInputRef.current.click();
                }
              }}
            >
              <Camera className="w-4 h-4" />
              {label}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
