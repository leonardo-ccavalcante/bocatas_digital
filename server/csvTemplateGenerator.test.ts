import { describe, it, expect } from 'vitest';
import { generateEntregasCSVTemplate } from './csvTemplateGenerator';

describe('CSV Template Generator', () => {
  it('generates CSV template with required columns', () => {
    const { csvContent, fileName } = generateEntregasCSVTemplate();
    
    expect(csvContent).toBeDefined();
    expect(csvContent.length).toBeGreaterThan(0);
    expect(csvContent).toContain('numero_albaran');
    expect(csvContent).toContain('numero_reparto');
    expect(csvContent).toContain('fecha');
    expect(csvContent).toContain('familia_id');
  });

  it('generates guide content with instructions', () => {
    const { guideContent } = generateEntregasCSVTemplate();
    
    expect(guideContent).toBeDefined();
    expect(guideContent.length).toBeGreaterThan(0);
    expect(guideContent).toContain('Plantilla');
  });

  it('generates filename with current date', () => {
    const { fileName } = generateEntregasCSVTemplate();
    
    expect(fileName).toBeDefined();
    expect(fileName).toMatch(/entregas_template_\d{4}-\d{2}-\d{2}\.csv/);
  });

  it('includes sample data in CSV', () => {
    const { csvContent } = generateEntregasCSVTemplate();
    
    // Should have header row + at least 1 sample row
    const lines = csvContent.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('CSV content is valid format', () => {
    const { csvContent } = generateEntregasCSVTemplate();
    
    const lines = csvContent.trim().split('\n');
    const headerLine = lines[0];
    
    // Header should have multiple columns separated by commas
    const columns = headerLine.split(',');
    expect(columns.length).toBeGreaterThan(5);
  });
});
