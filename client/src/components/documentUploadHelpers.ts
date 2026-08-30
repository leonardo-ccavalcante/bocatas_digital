// Helpers puros del modal de subida de documentos de familia.
//
// Extraídos de DocumentUploadModal.tsx para respetar el tope de 300 líneas por
// fichero. Sin estado ni React: son funciones testeables por separado.

import { FAMILIA_DOCS_CONFIG } from "@/features/families/constants";
import { esPdfPorContenido } from "@shared/documentFormat";
import type { FamilyDocType } from "@shared/familyDocuments";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function labelFor(tipo: FamilyDocType): string {
  return FAMILIA_DOCS_CONFIG.find((d) => d.key === tipo)?.label ?? tipo;
}

export function extFromFile(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName) return fromName.toLowerCase();
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return file.type.split("/")[1] ?? "jpg";
  return "bin";
}

/**
 * Compress an image file to reduce upload size.
 * Returns a Blob with JPEG compression at 0.8 quality.
 * Inlined from DocumentPhotoCapture.tsx (not exported from that module).
 */
export async function compressImage(file: File, maxDimension = 1920): Promise<Blob> {
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

/** Lee solo la cabecera del archivo: basta para saber si es un PDF de verdad. */
export async function archivoEsPdf(file: File): Promise<boolean> {
  return esPdfPorContenido(new Uint8Array(await file.slice(0, 5).arrayBuffer()));
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const STORAGE_BUCKET = "family-documents";
