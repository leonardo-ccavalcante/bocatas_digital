// Vision extraction for the SIGNED Hoja de Firmas (T-Doc-3 OCR-assisted close-out).
//
// Reads a photo of OUR generated acta and returns, per row, the printed
// expediente + whether the firma column carries a signature + a confidence.
// We only need expediente + signed (kg/names are already in the DB), which keeps
// the extraction narrow and the matching exact (on expediente, not fuzzy names).
//
// The invokeLLM call is not unit-tested here (needs a provider + real image);
// the response PARSER is pure and fully tested.

import { invokeLLM } from "./llm";

export interface ActaOcrRow {
  expediente: string;
  signed: boolean;
  confidence: number; // 0..1
}

export interface ActaOcrResult {
  success: boolean;
  rows: ActaOcrRow[];
  extractionConfidence: number;
  warnings: string[];
  errors?: string[];
}

/** Pure parser for the LLM JSON payload → ActaOcrResult. Tolerant of nulls. */
export function parseActaOcrResponse(content: string): ActaOcrResult {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return { success: false, rows: [], extractionConfidence: 0, warnings: [], errors: ["Respuesta OCR no es JSON válido"] };
  }
  const obj = (data ?? {}) as Record<string, unknown>;
  const rawRows = Array.isArray(obj.rows) ? obj.rows : [];
  const rows: ActaOcrRow[] = rawRows
    .map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      const expediente = row.expediente != null ? String(row.expediente).trim() : "";
      return {
        expediente,
        signed: row.signed === true,
        confidence: typeof row.confidence === "number" ? Math.max(0, Math.min(1, row.confidence)) : 0,
      };
    })
    .filter((r) => r.expediente !== "");
  return {
    success: true,
    rows,
    extractionConfidence: typeof obj.extraction_confidence === "number" ? obj.extraction_confidence : 0,
    warnings: Array.isArray(obj.warnings) ? (obj.warnings as string[]) : [],
  };
}

const SYSTEM_PROMPT = `Eres un experto en leer hojas de firmas de reparto de alimentos.
La imagen es una tabla impresa con una columna "Nº Exp." (número de expediente) y una columna "Firma".
Para CADA fila devuelve: el número de expediente, si la casilla de firma tiene una firma manuscrita (signed: true/false), y tu confianza (0-1).
NO inventes expedientes. Si una fila es ilegible, baja la confianza. Devuelve SOLO JSON válido.`;

export async function extractActaSignatures(imageUrl: string): Promise<ActaOcrResult> {
  if (!imageUrl || imageUrl.trim() === "") {
    return { success: false, rows: [], extractionConfidence: 0, warnings: [], errors: ["imageUrl vacío"] };
  }
  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            { type: "text", text: "Extrae expediente + firma (signed) + confianza por fila." },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "acta_signatures",
          strict: true,
          schema: {
            type: "object",
            properties: {
              extraction_confidence: { type: "number" },
              rows: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    expediente: { type: "string" },
                    signed: { type: "boolean" },
                    confidence: { type: "number" },
                  },
                  required: ["expediente", "signed", "confidence"],
                  additionalProperties: false,
                },
              },
              warnings: { type: "array", items: { type: "string" } },
            },
            required: ["extraction_confidence", "rows", "warnings"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      return { success: false, rows: [], extractionConfidence: 0, warnings: [], errors: ["OCR devolvió respuesta vacía"] };
    }
    return parseActaOcrResponse(content);
  } catch (err) {
    return { success: false, rows: [], extractionConfidence: 0, warnings: [], errors: [err instanceof Error ? err.message : String(err)] };
  }
}
