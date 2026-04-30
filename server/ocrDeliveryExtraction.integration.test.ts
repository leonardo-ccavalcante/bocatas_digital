import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from './db';
import {
  extractDeliveriesFromOCR,
  saveDeliveryBatch,
  validateBatchHeaderWithDB,
  validateDeliveryRowWithDB,
  ExtractedBatchHeader,
  ExtractedDeliveryRow,
} from './ocrDeliveryExtraction';
import { v4 as uuidv4 } from 'uuid';

describe('OCR Delivery Extraction - Integration Tests', () => {
  let db: any;
  let testFamiliaId: string;

  beforeAll(async () => {
    db = await getDb();
    if (!db) {
      console.warn('Database not available for integration tests');
    }
    // TODO: Create test familia for integration tests
    testFamiliaId = uuidv4();
  });

  afterAll(async () => {
    // TODO: Clean up test data
  });

  describe('End-to-End OCR Flow', () => {
    it.skip('should extract and save a complete delivery batch', async () => {
      if (!db) {
        console.warn('Skipping integration test - database unavailable');
        return;
      }

      const ocrText = `
        Número de Albarán: ALB-2026-04-20-INTEGRATION-001
        Número de Reparto: REP-2026-04-001
        Número de Factura de Carne: FAC-CARNE-2026-04-001
        Fecha: 2026-04-20
        Total de Personas Asistidas: 2

        familia_id | fecha | persona_recibio | frutas_hortalizas_cantidad | frutas_hortalizas_unidad | carne_cantidad | carne_unidad | notas
        ${testFamiliaId} | 2026-04-20 | Maria Garcia | 3.5 | kg | 2 | kg | Entrega sin problemas
        ${testFamiliaId} | 2026-04-20 | Juan Rodriguez | 2 | kg | 1 | kg | 
      `;

      // Step 1: Extract
      const extracted = await extractDeliveriesFromOCR('test.jpg', ocrText);
      expect(extracted.header).toBeDefined();
      expect(extracted.rows).toHaveLength(2);

      // Step 2: Save
      const result = await saveDeliveryBatch(
        extracted.header,
        extracted.rows,
        'https://example.com/image.jpg'
      );

      expect(result.errors.length === 0).toBe(true);
      if (result.batchId) {
        expect(result.savedCount).toBeGreaterThan(0);
      }
    });

    it.skip('should reject duplicate albarán numbers', async () => {
      if (!db) {
        console.warn('Skipping integration test - database unavailable');
        return;
      }

      const header: ExtractedBatchHeader = {
        numero_albaran: 'ALB-2026-04-20-DUP-001',
        numero_reparto: 'REP-2026-04-001',
        numero_factura_carne: 'FAC-CARNE-2026-04-001',
        total_personas_asistidas: 1,
        fecha_reparto: '2026-04-20',
        confidence: 95,
        warnings: [],
      };

      // First insert should succeed
      const result1 = await validateBatchHeaderWithDB(header);
      expect(result1.isValid).toBe(true);

      // Second insert should fail
      const result2 = await validateBatchHeaderWithDB(header);
      expect(result2.isValid).toBe(false);
      expect(result2.errors.some(e => e.includes('duplicado'))).toBe(true);
    });

    it.skip('should validate familia existence', async () => {
      if (!db) {
        console.warn('Skipping integration test - database unavailable');
        return;
      }

      const row: ExtractedDeliveryRow = {
        familia_id: uuidv4(), // Non-existent familia
        fecha: '2026-04-20',
        persona_recibio: 'Test Person',
        frutas_hortalizas_cantidad: 1,
        frutas_hortalizas_unidad: 'kg',
        carne_cantidad: 1,
        carne_unidad: 'kg',
        notas: 'Test',
        confidence: 90,
        warnings: [],
      };

      const result = await validateDeliveryRowWithDB(row);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('no encontrada'))).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed OCR text gracefully', async () => {
      const malformedOCR = 'This is not valid OCR text at all';

      const result = await extractDeliveriesFromOCR('test.jpg', malformedOCR);

      // Should extract with warnings, not crash
      expect(result.header).toBeDefined();
      expect(result.header.warnings.length).toBeGreaterThan(0);
    });

    it('should handle empty row data', async () => {
      const ocrText = `
        Número de Albarán: ALB-2026-04-20-EMPTY
        Número de Reparto: REP-2026-04-001
        Fecha: 2026-04-20
        Total de Personas Asistidas: 0
      `;

      const result = await extractDeliveriesFromOCR('test.jpg', ocrText);

      expect(result.header).toBeDefined();
      expect(result.rows).toHaveLength(0);
      expect(result.header.warnings.length).toBeGreaterThan(0);
    });

    it('should reject negative quantities', async () => {
      const row: ExtractedDeliveryRow = {
        familia_id: uuidv4(),
        fecha: '2026-04-20',
        persona_recibio: 'Test',
        frutas_hortalizas_cantidad: -5, // Invalid
        frutas_hortalizas_unidad: 'kg',
        carne_cantidad: 1,
        carne_unidad: 'kg',
        notas: '',
        confidence: 90,
        warnings: [],
      };

      const result = await validateDeliveryRowWithDB(row);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('negativa'))).toBe(true);
    });

    it('should reject future dates', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const header: ExtractedBatchHeader = {
        numero_albaran: 'ALB-2026-04-20-FUTURE',
        numero_reparto: 'REP-2026-04-001',
        numero_factura_carne: null,
        total_personas_asistidas: 1,
        fecha_reparto: futureDate.toISOString().split('T')[0],
        confidence: 95,
        warnings: [],
      };

      const result = await validateBatchHeaderWithDB(header);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('futura'))).toBe(true);
    });
  });

  describe('Data Integrity', () => {
    it('should preserve all extracted fields', async () => {
      const ocrText = `
        Número de Albarán: ALB-2026-04-20-INTEGRITY
        Número de Reparto: REP-2026-04-001
        Número de Factura de Carne: FAC-CARNE-2026-04-001
        Fecha: 2026-04-20
        Total de Personas Asistidas: 1

        familia_id | fecha | persona_recibio | frutas_hortalizas_cantidad | frutas_hortalizas_unidad | carne_cantidad | carne_unidad | notas
        ${testFamiliaId} | 2026-04-20 | Maria Garcia | 3.5 | kg | 2 | kg | Notas especiales
      `;

      const result = await extractDeliveriesFromOCR('test.jpg', ocrText);

      // Verify header fields
      expect(result.header.numero_albaran).toBe('ALB-2026-04-20-INTEGRITY');
      expect(result.header.numero_reparto).toBe('REP-2026-04-001');
      expect(result.header.numero_factura_carne).toBe('FAC-CARNE-2026-04-001');
      expect(result.header.total_personas_asistidas).toBe(1);
      expect(result.header.fecha_reparto).toBe('2026-04-20');

      // Verify row fields
      expect(result.rows[0].persona_recibio).toBe('Maria Garcia');
      expect(result.rows[0].frutas_hortalizas_cantidad).toBe(3.5);
      expect(result.rows[0].frutas_hortalizas_unidad).toBe('kg');
      expect(result.rows[0].carne_cantidad).toBe(2);
      expect(result.rows[0].carne_unidad).toBe('kg');
      expect(result.rows[0].notas).toBe('Notas especiales');
    });

    it('should maintain confidence scores', async () => {
      const ocrText = `
        Número de Albarán: ALB-2026-04-20-CONFIDENCE
        Número de Reparto: REP-2026-04-001
        Fecha: 2026-04-20
        Total de Personas Asistidas: 1

        familia_id | fecha | persona_recibio | frutas_hortalizas_cantidad | frutas_hortalizas_unidad | carne_cantidad | carne_unidad | notas
        ${testFamiliaId} | 2026-04-20 | Test | 1 | kg | 1 | kg | 
      `;

      const result = await extractDeliveriesFromOCR('test.jpg', ocrText);

      expect(result.header.confidence).toBeGreaterThanOrEqual(0);
      expect(result.header.confidence).toBeLessThanOrEqual(100);
      expect(result.rows[0].confidence).toBeGreaterThanOrEqual(0);
      expect(result.rows[0].confidence).toBeLessThanOrEqual(100);
    });
  });
});
