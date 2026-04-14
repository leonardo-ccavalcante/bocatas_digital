/**
 * ocr.ts — tRPC router for OCR document extraction.
 *
 * Moves OCR processing from Supabase Edge Function to tRPC server-side procedure.
 * This works with Manus OAuth (no Supabase JWT required) and uses the platform's
 * built-in LLM via invokeLLM helper.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { OCRResultSchema } from "../../client/src/features/persons/schemas";

export const ocrRouter = router({
  /**
   * Extract document fields from a base64-encoded image.
   * Accepts: { base64Image: string, mimeType?: string }
   * Returns: OCRResult with extracted fields or empty success=false on failure
   */
  extractDocument: protectedProcedure
    .input(
      z.object({
        base64Image: z.string().min(1, "Image required"),
        mimeType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Call LLM with vision capability to extract document fields
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a document extraction assistant. Extract key information from identity documents (passports, ID cards, driver's licenses, etc.) and return ONLY valid JSON with these fields (use null for missing):
{
  "tipo_documento": "DNI|NIE|Pasaporte|Sin_Documentacion" (uppercase),
  "numero_documento": "string or null",
  "nombre": "string or null",
  "apellidos": "string or null",
  "fecha_nacimiento": "YYYY-MM-DD or null",
  "pais_origen": "ISO 3166-1 alpha-2 code (e.g., 'IT', 'ES') or null",
  "genero": "masculino|femenino|no_binario|prefiere_no_decir or null"
}

IMPORTANT: Return ONLY the JSON object, no markdown, no explanation.`,
            },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${input.mimeType};base64,${input.base64Image}`,
                    detail: "high",
                  },
                },
                {
                  type: "text",
                  text: "Extract all visible information from this document.",
                },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "document_extraction",
              strict: false,
              schema: {
                type: "object",
                properties: {
                  tipo_documento: {
                    type: "string",
                    enum: ["DNI", "NIE", "Pasaporte", "Sin_Documentacion"],
                  },
                  numero_documento: { type: ["string", "null"] },
                  nombre: { type: ["string", "null"] },
                  apellidos: { type: ["string", "null"] },
                  fecha_nacimiento: { type: ["string", "null"] },
                  pais_origen: { type: ["string", "null"] },
                  genero: {
                    type: ["string", "null"],
                    enum: ["masculino", "femenino", "no_binario", "prefiere_no_decir", null],
                  },
                },
                required: [
                  "tipo_documento",
                  "numero_documento",
                  "nombre",
                  "apellidos",
                  "fecha_nacimiento",
                  "pais_origen",
                  "genero",
                ],
                additionalProperties: false,
              },
            },
          },
        });

        // Parse LLM response
        const content = response.choices?.[0]?.message?.content;
        if (!content) {
          console.warn("OCR: LLM returned empty content");
          return { success: false, data: {} };
        }

        let extractedData: unknown;
        try {
          extractedData = typeof content === "string" ? JSON.parse(content) : content;
        } catch (parseError) {
          console.warn("OCR: Failed to parse LLM response as JSON", parseError);
          return { success: false, data: {} };
        }

        // Log the actual LLM response for debugging
        console.log("OCR: LLM response:", JSON.stringify(extractedData, null, 2));

        // Normalize extracted data: map to lowercase enum values matching OcrTipoDocumentoSchema
        if (extractedData && typeof extractedData === "object" && "tipo_documento" in extractedData) {
          const data = extractedData as Record<string, unknown>;
          if (typeof data.tipo_documento === "string") {
            // Normalize to lowercase for schema matching
            const normalized = data.tipo_documento.toLowerCase().trim();
            // Map to valid enum values: ["dni", "nie", "pasaporte", "otro"]
            if (normalized === "dni") data.tipo_documento = "dni";
            else if (normalized === "nie") data.tipo_documento = "nie";
            else if (normalized === "pasaporte") data.tipo_documento = "pasaporte";
            else data.tipo_documento = "otro"; // Default to "otro" for unknown types
          }
        }

        // Validate with OCRResultSchema
        const parsed = OCRResultSchema.safeParse({
          success: true,
          data: extractedData,
        });

        if (!parsed.success) {
          console.warn("OCR: Validation failed", parsed.error);
          return { success: false, data: {} };
        }

        return parsed.data;
      } catch (error) {
        console.error("OCR: Extraction failed", error);
        // Graceful degradation: return empty success so form continues
        return { success: false, data: {} };
      }
    }),
});
