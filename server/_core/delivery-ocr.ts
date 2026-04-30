import { invokeLLM } from './llm';

export interface ExtractedDelivery {
  beneficiaryName: string;
  nameConfidence: number;
  deliveries: {
    date: string;
    quantity: number;
    quantityConfidence: number;
  }[];
}

export interface OCRExtractionResult {
  success: boolean;
  extractionConfidence: number;
  documentDate?: string;
  beneficiaries: ExtractedDelivery[];
  warnings: string[];
  errors?: string[];
}

/**
 * Extract delivery data from a physical delivery document photo using LLM-based table extraction.
 * 
 * @param imageUrl - S3 URL of the delivery document photo
 * @param programaId - ID of the programa for context
 * @returns Extraction result with beneficiaries, deliveries, and confidence scores
 */
export async function extractDeliveryDataFromImage(
  imageUrl: string,
  programaId: string
): Promise<OCRExtractionResult> {
  // Validate input
  if (!imageUrl || imageUrl.trim() === '') {
    return {
      success: false,
      extractionConfidence: 0,
      beneficiaries: [],
      warnings: [],
      errors: ['Image URL is required and cannot be empty'],
    };
  }

  try {
    // Construct LLM prompt for table extraction
    const prompt = constructExtractionPrompt(imageUrl, programaId);

    // Call LLM to extract data
    const response = await invokeLLM({
      messages: [
        {
          role: 'system',
          content: `You are an expert at extracting structured data from delivery tracking documents. 
Your task is to analyze a photo of a physical delivery document (a table with beneficiary names, delivery dates, and quantities) 
and extract the data in a structured JSON format. 

Be precise and include confidence scores for each extracted field (0-1, where 1 is highest confidence).
If you cannot extract certain data due to image quality or clarity issues, note it in the warnings.
Return ONLY valid JSON, no additional text.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'delivery_extraction',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              extraction_confidence: {
                type: 'number',
                description: 'Overall confidence in the extraction (0-1)',
              },
              document_date: {
                type: 'string',
                description: 'Date of the document if visible (YYYY-MM-DD format)',
              },
              beneficiaries: {
                type: 'array',
                description: 'List of extracted beneficiaries and their deliveries',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'Beneficiary name',
                    },
                    name_confidence: {
                      type: 'number',
                      description: 'Confidence in name extraction (0-1)',
                    },
                    deliveries: {
                      type: 'array',
                      description: 'List of delivery records for this beneficiary',
                      items: {
                        type: 'object',
                        properties: {
                          date: {
                            type: 'string',
                            description: 'Delivery date (YYYY-MM-DD format)',
                          },
                          quantity: {
                            type: 'integer',
                            description: 'Quantity delivered',
                          },
                          quantity_confidence: {
                            type: 'number',
                            description: 'Confidence in quantity extraction (0-1)',
                          },
                        },
                        required: ['date', 'quantity', 'quantity_confidence'],
                      },
                    },
                  },
                  required: ['name', 'name_confidence', 'deliveries'],
                },
              },
              warnings: {
                type: 'array',
                description: 'List of warnings about extraction quality or issues',
                items: {
                  type: 'string',
                },
              },
            },
            required: ['extraction_confidence', 'beneficiaries', 'warnings'],
            additionalProperties: false,
          },
        },
      },
    });

    // Parse LLM response
    const content = response.choices[0].message.content;
    if (!content || typeof content !== 'string') {
      return {
        success: false,
        extractionConfidence: 0,
        beneficiaries: [],
        warnings: [],
        errors: ['LLM returned empty response'],
      };
    }

    const extractedData = JSON.parse(content);

    // Transform LLM response to our format
    const result: OCRExtractionResult = {
      success: true,
      extractionConfidence: extractedData.extraction_confidence || 0,
      documentDate: extractedData.document_date,
      beneficiaries: (extractedData.beneficiaries || []).map((b: any) => ({
        beneficiaryName: b.name,
        nameConfidence: b.name_confidence,
        deliveries: (b.deliveries || []).map((d: any) => ({
          date: d.date,
          quantity: d.quantity,
          quantityConfidence: d.quantity_confidence,
        })),
      })),
      warnings: extractedData.warnings || [],
    };

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      extractionConfidence: 0,
      beneficiaries: [],
      warnings: [],
      errors: [`Failed to extract data: ${errorMessage}`],
    };
  }
}

/**
 * Construct the LLM prompt for delivery document extraction.
 */
function constructExtractionPrompt(imageUrl: string, programaId: string): string {
  return `Extract delivery data from the provided document image.

The document is a delivery tracking table with:
- Rows: Beneficiary names (leftmost column)
- Columns: Delivery dates (across the top)
- Cells: Quantities delivered (numbers in cells)
- Summary section: Usually in green, showing totals
- Signatures: At the bottom for verification

Instructions:
1. Extract all beneficiary names from the leftmost column
2. Extract all delivery dates from the column headers
3. Extract quantities from each cell (beneficiary × date intersection)
4. For each beneficiary, create a list of deliveries with date and quantity
5. Include confidence scores for each extraction (0-1):
   - 1.0 = clearly printed/legible
   - 0.7-0.9 = somewhat legible, minor uncertainty
   - 0.4-0.7 = handwritten, moderate uncertainty
   - 0.0-0.4 = very unclear, high uncertainty
6. List any warnings about image quality, unclear entries, or ambiguous data
7. If a cell is empty or unclear, skip that delivery record for that beneficiary

Return the extracted data as valid JSON matching the schema provided.`;
}
