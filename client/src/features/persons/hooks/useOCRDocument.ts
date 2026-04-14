import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { type OCRResult } from "../schemas";

export function useOCRDocument() {
  // Use tRPC mutation for server-side OCR extraction
  // This works with Manus OAuth and doesn't require Supabase JWT
  return trpc.ocr.extractDocument.useMutation();
}
