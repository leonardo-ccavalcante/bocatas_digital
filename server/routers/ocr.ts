/**
 * ocr.ts — tRPC router for OCR document extraction.
 *
 * Moves OCR processing from Supabase Edge Function to tRPC server-side procedure.
 * This works with Manus OAuth (no Supabase JWT required) and uses the platform's
 * built-in LLM via invokeLLM helper.
 *
 * Enhanced to support international documents:
 * - Detects Spanish documents (DNI, NIE) vs international national IDs
 * - Extracts document country of origin via visual feature analysis
 * - Maps to Documento_Extranjero for non-Spanish documents
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
   *
   * Enhanced to detect:
   * - Spanish documents (DNI, NIE, Pasaporte)
   * - International national IDs (Documento_Extranjero)
   * - Document country of origin (pais_documento)
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
              content: `You are a document extraction assistant specialized in identity documents from any country.
Extract key information from the document and return ONLY valid JSON with these fields (use null for missing):
{
  "tipo_documento": "DNI|NIE|Pasaporte|Documento_Extranjero|Sin_Documentacion" (uppercase),
  "numero_documento": "string or null",
  "nombre": "string or null",
  "apellidos": "string or null",
  "fecha_nacimiento": "YYYY-MM-DD or null",
  "pais_origen": "ISO 3166-1 alpha-2 code (e.g., 'IT', 'ES', 'FR', 'DE') or null",
  "pais_documento": "ISO 3166-1 alpha-2 code of document origin or null",
  "genero": "masculino|femenino|no_binario|prefiere_no_decir or null"
}

DETECTION RULES:
1. Spanish DNI: tipo_documento="DNI", pais_documento="ES"
2. Spanish NIE: tipo_documento="NIE", pais_documento="ES"
3. Any Passport: tipo_documento="Pasaporte", pais_documento=passport country
4. International National ID (French, German, Italian, etc.): tipo_documento="Documento_Extranjero", pais_documento=country code
5. Unknown/No document: tipo_documento="Sin_Documentacion", pais_documento=null

COUNTRY DETECTION:
- Analyze visual features: language, security features, layout, official seals, colors
- Look for country name or flag
- Identify document type from design patterns
- Common countries: ES (Spain), FR (France), DE (Germany), IT (Italy), PT (Portugal), RO (Romania), MA (Morocco), etc.

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
                  text: "Extract all visible information from this document. Identify the document type and country of origin.",
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
                    enum: ["DNI", "NIE", "Pasaporte", "Documento_Extranjero", "Sin_Documentacion"],
                  },
                  numero_documento: { type: ["string", "null"] },
                  nombre: { type: ["string", "null"] },
                  apellidos: { type: ["string", "null"] },
                  fecha_nacimiento: { type: ["string", "null"] },
                  pais_origen: { type: ["string", "null"] },
                  pais_documento: { type: ["string", "null"] },
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
                  "pais_documento",
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
            // Map to valid enum values: ["dni", "nie", "pasaporte", "documento_extranjero", "otro"]
            if (normalized === "dni") data.tipo_documento = "dni";
            else if (normalized === "nie") data.tipo_documento = "nie";
            else if (normalized === "pasaporte") data.tipo_documento = "pasaporte";
            else if (normalized === "documento_extranjero") data.tipo_documento = "documento_extranjero";
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
