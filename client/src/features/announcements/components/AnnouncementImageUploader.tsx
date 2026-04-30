/**
 * AnnouncementImageUploader.tsx — File picker that compresses an image and
 * uploads it to the public `announcement-images` bucket. Returns the public
 * URL via onChange.
 *
 * Mirrors the compressImage pattern in DocumentPhotoCapture.tsx but does NOT
 * require an announcement_id at upload time — files land in
 * `_drafts/{timestamp}-{rand}.jpg`. Re-uploading replaces the previous URL.
 */
import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "announcement-images";
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DIMENSION = 1920;

interface AnnouncementImageUploaderProps {
  value: string | null;
  onChange: (publicUrl: string | null) => void;
}

async function compressToJpeg(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Image compression failed"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

export function AnnouncementImageUploader({
  value,
  onChange,
}: AnnouncementImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`El archivo supera los ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`);
      return;
    }

    setUploading(true);
    try {
      const compressed = await compressToJpeg(file);
      const fileName = `_drafts/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, compressed, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (error) throw error;

      const { data: publicData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(data.path);

      onChange(publicData.publicUrl);
      toast.success("Imagen subida");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`No se pudo subir la imagen: ${message}`);
    } finally {
      setUploading(false);
      // Allow re-selecting the same file later.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleRemove() {
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">Imagen (opcional)</label>

      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt="Imagen de la novedad"
            className="max-h-40 rounded-lg border border-gray-200"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRemove}
            className="absolute top-1 right-1 h-7 w-7 p-0 bg-white/90 hover:bg-white"
            aria-label="Eliminar imagen"
          >
            <X className="w-3.5 h-3.5 text-red-600" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center justify-center gap-2 w-full h-24 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-[#C41230]/40 hover:text-[#C41230] transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Subiendo…
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" /> Click para subir imagen (máx 5 MB)
            </>
          )}
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <p className="text-xs text-gray-400">
        Las imágenes se comprimen a {MAX_DIMENSION}px y se guardan como JPEG
        público (sin datos personales).
      </p>
    </div>
  );
}
