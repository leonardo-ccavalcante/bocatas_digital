import { useState, useRef } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AnnouncementImageUploaderProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
}

export function AnnouncementImageUploader({
  value,
  onChange,
  disabled = false,
}: AnnouncementImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor selecciona una imagen válida");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no debe superar 5MB");
      return;
    }

    setUploading(true);
    try {
      // In a real implementation, this would upload to S3 via the server
      // For now, we'll use a data URL (not recommended for production)
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        onChange(dataUrl);
        toast.success("Imagen cargada");
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast.error("Error al cargar la imagen");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleUpload(files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files[0]) {
      handleUpload(files[0]);
    }
  };

  return (
    <div className="w-full">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
          dragActive
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:border-gray-400"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleChange}
          disabled={disabled || uploading}
          className="hidden"
        />

        {value ? (
          <div className="space-y-3">
            <img
              src={value}
              alt="Imagen de novedad"
              className="w-full h-40 object-cover rounded"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || uploading}
              >
                Cambiar imagen
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(null)}
                disabled={disabled}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="text-center space-y-2"
            onClick={() => !disabled && inputRef.current?.click()}
          >
            <Upload className="w-8 h-8 text-gray-400 mx-auto" />
            <div>
              <p className="text-sm font-medium text-gray-700">
                Arrastra una imagen aquí
              </p>
              <p className="text-xs text-gray-500">o haz clic para seleccionar</p>
            </div>
            <p className="text-xs text-gray-400">PNG, JPG, GIF (máx. 5MB)</p>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-white/50 rounded-lg flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
          </div>
        )}
      </div>
    </div>
  );
}
