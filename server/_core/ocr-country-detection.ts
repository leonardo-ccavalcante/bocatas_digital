import { invokeLLM } from "./llm";
// Imported from the pure module, not "./llm": the OCR tests mock "./llm" with a
// factory that exports only invokeLLM, and parsing needs no mocking anyway.
import { parseJsonContent } from "./llm-payload";
import { ocrModel } from "./llm-models";

export interface CountrySuggestion {
  suggested_country_code: string;
  confidence: number;
  reasoning: string;
  alternative_suggestions: string[];
}

/**
 * Suggest country code from international document image
 * Analyzes: document image + extracted OCR text + user context
 * Returns: ISO 3166-1 alpha-2 country code with confidence score
 */
export async function suggestCountryFromDocument(
  documentImage: Buffer | string,
  extractedText: string,
  paisOrigen?: string
): Promise<CountrySuggestion> {
  // Handle empty/missing image
  if (!documentImage || (typeof documentImage === "string" && !documentImage)) {
    return {
      suggested_country_code: "",
      confidence: 0,
      reasoning: "No document image provided",
      alternative_suggestions: [],
    };
  }

  // Convert buffer to base64 if needed
  const imageBase64 =
    typeof documentImage === "string"
      ? documentImage
      : documentImage.toString("base64");

  const systemPrompt = `You are an expert at identifying countries from official documents (passports, national IDs, visas, etc.).

Analyze the provided document image and extracted text to identify the country of origin.

Return a JSON response with:
- suggested_country_code: ISO 3166-1 alpha-2 code (e.g., "FR", "ES", "DE")
- confidence: number 0-1 indicating certainty
- reasoning: brief explanation of how you identified the country
- alternative_suggestions: array of up to 3 other possible country codes

Be conservative with confidence - only high confidence if visual/text evidence is clear.`;

  const userPrompt = `Identify the country from this document.

${extractedText ? `Extracted text from document:\n${extractedText}\n` : ""}

${paisOrigen ? `User's country of origin (context hint): ${paisOrigen}\n` : ""}

Return ONLY valid JSON, no other text.`;

  try {
    const response = await invokeLLM({
      model: ocrModel(),
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: userPrompt,
            },
          ],
        },
      ],
      // Without this the model answers in prose or fenced markdown and the
      // parse below fails, collapsing into a silent "no suggestion".
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "country_suggestion",
          strict: false,
          schema: {
            type: "object",
            properties: {
              suggested_country_code: { type: "string" },
              confidence: { type: "number" },
              reasoning: { type: "string" },
              alternative_suggestions: { type: "array", items: { type: "string" } },
            },
            required: [
              "suggested_country_code",
              "confidence",
              "reasoning",
              "alternative_suggestions",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error("Unexpected response format");
    }

    const parsed = parseJsonContent(content) as Record<string, unknown>;

    // Validate and normalize response
    const alternatives = Array.isArray(parsed.alternative_suggestions)
      ? (parsed.alternative_suggestions as unknown[])
      : [];

    return {
      suggested_country_code: String(parsed.suggested_country_code ?? "").toUpperCase(),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      reasoning: String(parsed.reasoning || "Unable to determine country"),
      alternative_suggestions: alternatives
        .slice(0, 3)
        .map(code => String(code).toUpperCase()),
    };
  } catch (error) {
    console.error("Error suggesting country from document:", error);
    return {
      suggested_country_code: "",
      confidence: 0,
      reasoning: "Error analyzing document",
      alternative_suggestions: [],
    };
  }
}
