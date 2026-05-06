export type CompressFormat = "image/jpeg" | "image/webp";

/**
 * Client-side image compression before any upload.
 * Handles low-quality phones (Moto G, Samsung A-series) gracefully.
 * Canvas resize to maxPx + format quality keeps payload under 100KB.
 *
 * format defaults to JPEG for backwards compatibility with existing
 * callers and Supabase Storage MIME assumptions. Pass "image/webp" for
 * ~25-35% smaller payloads on supported browsers (Safari 14+, all evergreen).
 */
export async function compressImage(
  file: File | Blob,
  maxPx = 800,
  quality = 0.8,
  format: CompressFormat = "image/jpeg"
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas context not available"));
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const dataUrl = canvas.toDataURL(format, quality);
      resolve(dataUrl.split(",")[1] ?? "");
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Strip optional data URL prefix from a base64 string.
 * Handles both raw base64 and data:image/...;base64,... format.
 */
function stripDataUrlPrefix(base64: string): string {
  const commaIdx = base64.indexOf(",");
  return commaIdx !== -1 ? base64.slice(commaIdx + 1) : base64;
}

/**
 * Convert base64 string to a Blob for Supabase Storage upload.
 * Accepts both raw base64 and data URL format.
 * Works in both browser (atob) and Node/Vitest (Buffer) environments.
 */
export function base64ToBlob(base64: string, mimeType = "image/jpeg"): Blob {
  const raw = stripDataUrlPrefix(base64);

  let blobPart: ArrayBuffer;

  if (typeof Buffer !== "undefined") {
    // Node.js / Vitest environment — copy into a plain ArrayBuffer
    const buf = Buffer.from(raw, "base64");
    const ab = new ArrayBuffer(buf.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buf.length; i++) view[i] = buf[i] ?? 0;
    blobPart = ab;
  } else {
    // Browser environment
    const byteCharacters = atob(raw);
    const ab = new ArrayBuffer(byteCharacters.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < byteCharacters.length; i++) {
      view[i] = byteCharacters.charCodeAt(i);
    }
    blobPart = ab;
  }

  return new Blob([blobPart], { type: mimeType });
}

/**
 * Convert base64 to a File object with a given filename.
 * Accepts both raw base64 and data URL format.
 */
export function base64ToFile(base64: string, filename: string, mimeType = "image/jpeg"): File {
  const blob = base64ToBlob(base64, mimeType);
  return new File([blob], filename, { type: mimeType });
}
