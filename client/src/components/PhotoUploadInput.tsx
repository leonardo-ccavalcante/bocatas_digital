import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RotateCw, X } from 'lucide-react';

interface PhotoUploadInputProps {
  onPhotoSelected: (photoData: {
    base64: string;
    file: File;
    rotation: number;
  }) => void;
  onError?: (error: string) => void;
}

/**
 * PhotoUploadInput Component
 * Allows users to capture or select a photo of a delivery document
 * Features:
 * - Camera capture (mobile) or file picker (desktop)
 * - Photo preview with rotation controls
 * - File size validation (<10MB)
 * - Image dimension validation (min 640x480)
 * - Base64 encoding for upload
 */
export const PhotoUploadInput: React.FC<PhotoUploadInputProps> = ({
  onPhotoSelected,
  onError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const MIN_WIDTH = 640;
  const MIN_HEIGHT = 480;

  const validateFile = async (file: File): Promise<boolean> => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      const errorMsg = `Archivo muy grande. Máximo ${MAX_FILE_SIZE / 1024 / 1024}MB`;
      setError(errorMsg);
      onError?.(errorMsg);
      return false;
    }

    // Check file type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      const errorMsg = 'Formato no válido. Use JPG, PNG o WebP';
      setError(errorMsg);
      onError?.(errorMsg);
      return false;
    }

    // Check image dimensions
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          if (img.width < MIN_WIDTH || img.height < MIN_HEIGHT) {
            const errorMsg = `Imagen muy pequeña. Mínimo ${MIN_WIDTH}x${MIN_HEIGHT}px`;
            setError(errorMsg);
            onError?.(errorMsg);
            resolve(false);
          } else {
            resolve(true);
          }
        };
        img.onerror = () => {
          const errorMsg = 'No se pudo leer la imagen';
          setError(errorMsg);
          onError?.(errorMsg);
          resolve(false);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (file: File) => {
    setIsLoading(true);
    setError(null);

    const isValid = await validateFile(file);
    if (!isValid) {
      setIsLoading(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setPreview(base64);
      setSelectedFile(file);
      setRotation(0);
      setIsLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRotate = (degrees: number) => {
    const newRotation = (rotation + degrees) % 360;
    setRotation(newRotation);
  };

  const handleConfirm = () => {
    if (selectedFile && preview) {
      onPhotoSelected({
        base64: preview,
        file: selectedFile,
        rotation,
      });
      // Reset
      setPreview(null);
      setSelectedFile(null);
      setRotation(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleReset = () => {
    setPreview(null);
    setSelectedFile(null);
    setRotation(0);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  return (
    <div className="w-full space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!preview ? (
        <div className="space-y-3">
          {/* File picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* Camera input (mobile) */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={() => cameraInputRef.current?.click()}
              variant="outline"
              className="flex-1"
              disabled={isLoading}
            >
              <Camera className="mr-2 h-4 w-4" />
              Capturar Foto
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="flex-1"
              disabled={isLoading}
            >
              Seleccionar Archivo
            </Button>
          </div>

          {isLoading && (
            <div className="text-center text-sm text-gray-500">
              Procesando imagen...
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Preview */}
          <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            <img
              src={preview}
              alt="preview"
              className="w-full"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: 'transform 0.2s ease-in-out',
              }}
            />
          </div>

          {/* Rotation controls */}
          <div className="flex gap-2">
            <Button
              onClick={() => handleRotate(90)}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              <RotateCw className="mr-2 h-4 w-4" />
              Rotar 90°
            </Button>
            <Button
              onClick={() => handleRotate(180)}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              <RotateCw className="mr-2 h-4 w-4" />
              Rotar 180°
            </Button>
            <Button
              onClick={() => handleRotate(270)}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              <RotateCw className="mr-2 h-4 w-4" />
              Rotar 270°
            </Button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleConfirm}
              className="flex-1"
            >
              Confirmar Foto
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              size="icon"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
