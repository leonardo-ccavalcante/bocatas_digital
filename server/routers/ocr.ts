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
import { voluntarioProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
// Pure module: imported directly so tests mocking "../_core/llm" need not stub it.
import { parseJsonContent, isNotConfiguredError } from "../_core/llm-payload";
import { ocrModel } from "../_core/llm-models";
import { OCRResultSchema } from "../../client/src/features/persons/schemas";
import type { OCRResult } from "../../client/src/features/persons/schemas";
import type { LLMFailureReason } from "../_core/llm-payload";

/**
 * `reason` is present only on failure and tells the caller WHY nothing came
 * back — an unset gateway key used to be indistinguishable from an
 * unreadable photo. Declared explicitly so `data` keeps its field shape on
 * both branches instead of collapsing to `{}`.
 */
type OcrResponse = OCRResult & { reason?: LLMFailureReason };

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
  extractDocument: voluntarioProcedure
    .input(
      z.object({
        base64Image: z.string().min(1, "Image required"),
        mimeType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input }): Promise<OcrResponse> => {
      try {
        // Call LLM with vision capability to extract document fields
        const response = await invokeLLM({
          model: ocrModel(),
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

        // A reasoning model that exhausts max_tokens returns partial content.
        // Surfaced separately: the fix is raising the ceiling or changing
        // OCR_MODEL, not retaking the photo.
        if (response.choices?.[0]?.finish_reason === "length") {
          console.warn("OCR: output truncated (finish_reason=length) — raise max_tokens or use a lighter OCR_MODEL");
          return { success: false, data: {}, reason: "truncated" };
        }

        // Parse LLM response
        const content = response.choices?.[0]?.message?.content;
        if (!content || (typeof content === "string" && content.trim() === "")) {
          console.warn("OCR: LLM returned empty content");
          return { success: false, data: {}, reason: "unreadable" };
        }

        let extractedData: unknown;
        try {
          // Tolerates markdown fences / surrounding prose, which the model
          // emits despite the prompt. A bare JSON.parse dropped every such
          // reply into the generic failure branch.
          extractedData =
            typeof content === "string" ? parseJsonContent(content) : content;
        } catch {
          // The message can quote the model output (= document PII) — never log it.
          console.warn("OCR: LLM response was not parseable JSON");
          return { success: false, data: {}, reason: "unreadable" };
        }

        // PII redaction: do NOT log extractedData — it contains NIE / names /
        // document numbers from beneficiary documents. CLAUDE.md §Compliance
        // prohibits PII in logs.

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
            // El prompt pide `Sin_Documentacion` para "no reconozco nada": es la
            // marca de fallo del modelo, no un dato. Convertirla en "otro" la
            // disfrazaba de extracción válida.
            else if (normalized === "sin_documentacion") data.tipo_documento = null;
            else data.tipo_documento = "otro"; // Default to "otro" for unknown types
          }
        }

        // Validate with OCRResultSchema
        const parsed = OCRResultSchema.safeParse({
          success: true,
          data: extractedData,
        });

        if (!parsed.success) {
          // Log only the failing field paths — `parsed.error` embeds the
          // rejected VALUES (names, NIE) and must never reach the log.
          console.warn(
            "OCR: Validation failed on fields:",
            parsed.error.issues.map(i => i.path.join(".")).join(", ")
          );
          return { success: false, data: {}, reason: "unreadable" };
        }

        // Una foto ilegible devuelve las ocho claves a null, y como todos los
        // campos son `.nullish()` eso valida sin problema. Sin esta guarda salía
        // con success:true y el voluntario veía «Datos extraídos» sobre un
        // formulario vacío, sin poder reintentar. Un `tipo_documento` suelto no
        // es una extracción: hacen falta datos de identidad.
        const d = parsed.data.data;
        if (!d.nombre && !d.apellidos && !d.numero_documento && !d.fecha_nacimiento) {
          return { success: false, data: {}, reason: "unreadable" };
        }

        return parsed.data;
      } catch (error) {
        // Distinguish "OCR is switched off in this environment" from "the
        // gateway rejected/failed the call". Both used to return the same
        // opaque `{ success:false }`, which is why an unset API key looked
        // identical to an unreadable document.
        if (isNotConfiguredError(error)) {
          console.error(
            "OCR: disabled —",
            error instanceof Error ? error.message : String(error)
          );
          return { success: false, data: {}, reason: "not_configured" };
        }
        console.error(
          "OCR: extraction failed —",
          error instanceof Error ? error.message : String(error)
        );
        // Graceful degradation: the registration form continues either way.
        return { success: false, data: {}, reason: "llm_error" };
      }
    }),
});
