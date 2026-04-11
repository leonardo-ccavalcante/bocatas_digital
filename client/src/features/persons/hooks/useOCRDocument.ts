import { useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { OCRResultSchema, type OCRResult } from "../schemas";

export function useOCRDocument() {
  const supabase = createClient();

  return useMutation<OCRResult, Error, { base64Image: string; mimeType?: string }>({
    mutationFn: async ({ base64Image, mimeType = "image/jpeg" }) => {
      // Call the Supabase Edge Function
      const { data, error } = await supabase.functions.invoke("extract-document", {
        body: { image: base64Image, mimeType },
      });

      if (error) {
        throw new Error(`OCR Edge Function error: ${error.message}`);
      }

      // Validate response with Zod to prevent XSS from AI output
      const parsed = OCRResultSchema.safeParse(data);
      if (!parsed.success) {
        // Graceful degradation: return empty success so form continues
        return { success: false, data: {} };
      }

      return parsed.data;
    },
  });
}
