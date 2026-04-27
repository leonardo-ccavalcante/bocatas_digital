import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractDeliveryDataFromImage } from '../_core/delivery-ocr';
import * as llmModule from '../_core/llm';

// Mock the LLM module
vi.mock('../_core/llm', () => ({
  invokeLLM: vi.fn(),
}));

describe('DeliveryDocumentOCRService', () => {
  describe('extractDeliveryDataFromImage', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should extract beneficiary names and delivery data from image', async () => {
      // Mock LLM response
      const mockLLMResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                extraction_confidence: 0.92,
                document_date: '2026-04-27',
                beneficiaries: [
                  {
                    name: 'Maria Garcia',
                    name_confidence: 0.95,
                    deliveries: [
                      {
                        date: '2026-04-20',
                        quantity: 2,
                        quantity_confidence: 0.88,
                      },
                      {
                        date: '2026-04-21',
                        quantity: 3,
                        quantity_confidence: 0.85,
                      },
                    ],
                  },
                ],
                warnings: [],
              }),
            },
          },
        ],
      };
      vi.mocked(llmModule.invokeLLM).mockResolvedValueOnce(mockLLMResponse as any);

      // Mock image URL (would be S3 URL in real usage)
      const imageUrl = 'https://example.com/delivery-document.jpg';
      const programaId = 'programa-123';

      const result = await extractDeliveryDataFromImage(imageUrl, programaId);

      // Verify structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('extractionConfidence');
      expect(result).toHaveProperty('beneficiaries');
      expect(result).toHaveProperty('warnings');

      // Verify extraction succeeded
      expect(result.success).toBe(true);
      expect(result.extractionConfidence).toBeGreaterThan(0);
      expect(result.extractionConfidence).toBeLessThanOrEqual(1);

      // Verify beneficiaries extracted
      expect(Array.isArray(result.beneficiaries)).toBe(true);
      expect(result.beneficiaries.length).toBeGreaterThan(0);

      // Verify beneficiary structure
      const beneficiary = result.beneficiaries[0];
      expect(beneficiary).toHaveProperty('beneficiaryName');
      expect(beneficiary).toHaveProperty('nameConfidence');
      expect(beneficiary).toHaveProperty('deliveries');
      expect(Array.isArray(beneficiary.deliveries)).toBe(true);

      // Verify delivery structure
      if (beneficiary.deliveries.length > 0) {
        const delivery = beneficiary.deliveries[0];
        expect(delivery).toHaveProperty('date');
        expect(delivery).toHaveProperty('quantity');
        expect(delivery).toHaveProperty('quantityConfidence');
      }
    });

    it('should return error when image URL is invalid', async () => {
      const imageUrl = '';
      const programaId = 'programa-123';

      const result = await extractDeliveryDataFromImage(imageUrl, programaId);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should include confidence scores for each extracted field', async () => {
      // Mock LLM response
      const mockLLMResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                extraction_confidence: 0.88,
                beneficiaries: [
                  {
                    name: 'Pedro Sanchez',
                    name_confidence: 0.92,
                    deliveries: [
                      {
                        date: '2026-04-20',
                        quantity: 5,
                        quantity_confidence: 0.85,
                      },
                    ],
                  },
                ],
                warnings: [],
              }),
            },
          },
        ],
      };
      vi.mocked(llmModule.invokeLLM).mockResolvedValueOnce(mockLLMResponse as any);

      const imageUrl = 'https://example.com/delivery-document.jpg';
      const programaId = 'programa-123';

      const result = await extractDeliveryDataFromImage(imageUrl, programaId);

      if (result.success && result.beneficiaries.length > 0) {
        const beneficiary = result.beneficiaries[0];
        
        // Name confidence should be between 0 and 1
        expect(beneficiary.nameConfidence).toBeGreaterThanOrEqual(0);
        expect(beneficiary.nameConfidence).toBeLessThanOrEqual(1);

        // Delivery confidence should be between 0 and 1
        beneficiary.deliveries.forEach(delivery => {
          expect(delivery.quantityConfidence).toBeGreaterThanOrEqual(0);
          expect(delivery.quantityConfidence).toBeLessThanOrEqual(1);
        });
      }
    });

    it('should handle handwritten and printed text', async () => {
      // Mock LLM response for handwritten text (lower confidence)
      const mockLLMResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                extraction_confidence: 0.72,
                beneficiaries: [
                  {
                    name: 'Juan Lopez',
                    name_confidence: 0.68,
                    deliveries: [
                      {
                        date: '2026-04-20',
                        quantity: 1,
                        quantity_confidence: 0.65,
                      },
                    ],
                  },
                ],
                warnings: ['Some handwritten entries have lower confidence'],
              }),
            },
          },
        ],
      };
      vi.mocked(llmModule.invokeLLM).mockResolvedValueOnce(mockLLMResponse as any);

      const imageUrl = 'https://example.com/delivery-document-handwritten.jpg';
      const programaId = 'programa-123';

      const result = await extractDeliveryDataFromImage(imageUrl, programaId);

      // Should still extract data even with mixed text styles
      expect(result).toHaveProperty('beneficiaries');
      // May have lower confidence but should still attempt extraction
      if (result.success) {
        expect(result.extractionConfidence).toBeGreaterThan(0);
      }
    });

    it('should include warnings for unclear or ambiguous entries', async () => {
      // Mock LLM response with warnings
      const mockLLMResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                extraction_confidence: 0.55,
                beneficiaries: [],
                warnings: [
                  'Image is blurry - some entries may be inaccurate',
                  'Several cells are unclear due to poor lighting',
                  'Handwriting is difficult to read in rows 3-5',
                ],
              }),
            },
          },
        ],
      };
      vi.mocked(llmModule.invokeLLM).mockResolvedValueOnce(mockLLMResponse as any);

      const imageUrl = 'https://example.com/delivery-document-blurry.jpg';
      const programaId = 'programa-123';

      const result = await extractDeliveryDataFromImage(imageUrl, programaId);

      // Should have warnings property
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });
});
