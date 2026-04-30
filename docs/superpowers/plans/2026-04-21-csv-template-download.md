# CSV Template Download Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CSV template download feature to the "Subir Documento de Entregas" modal so users understand the required structure, columns, and format for delivery document uploads.

**Architecture:** Create a utility function that generates a CSV template with sample data + a guide file, add a download button to the DeliveryDocumentUpload modal, and integrate file download functionality.

**Tech Stack:** TypeScript, React, CSV generation (native), file download (browser API)

---

## File Structure

**Files to create:**
- `server/csvTemplateGenerator.ts` - Utility function to generate CSV template + guide
- `client/src/utils/downloadFile.ts` - Browser file download helper
- `docs/superpowers/guides/entregas-csv-guide.md` - Template guide documentation

**Files to modify:**
- `client/src/components/DeliveryDocumentUpload.tsx` - Add download button + instructions

---

## Task 1: Create CSV Template Generator Function

**Files:**
- Create: `server/csvTemplateGenerator.ts`
- Modify: `server/routers/entregas.ts` (add tRPC procedure)

**Context:** The template must include all columns needed for the backend to process without errors. Based on `ExtractedDeliveryRow` interface, required columns are:
- `familia_id` (UUID format)
- `fecha` (YYYY-MM-DD)
- `persona_recibio` (name)
- `frutas_hortalizas_cantidad` (number)
- `frutas_hortalizas_unidad` (unit: kg, l, etc.)
- `carne_cantidad` (number)
- `carne_unidad` (unit: kg, etc.)
- `notas` (optional text)

Header columns (for batch metadata):
- `numero_albaran`
- `numero_reparto`
- `numero_factura_carne` (optional)
- `total_personas_asistidas`
- `fecha_reparto` (YYYY-MM-DD)

- [ ] **Step 1: Create `server/csvTemplateGenerator.ts` with template generation function**

```typescript
import { format } from 'date-fns';

export interface CSVTemplateData {
  csvContent: string;
  guideContent: string;
  fileName: string;
}

/**
 * Generate CSV template with sample data and guide
 * Returns both CSV content and guide content for download
 */
export function generateEntregasCSVTemplate(): CSVTemplateData {
  const today = format(new Date(), 'yyyy-MM-dd');
  const fileName = `entregas_template_${today}.csv`;

  // CSV Header row with all required columns
  const headers = [
    'numero_albaran',
    'numero_reparto',
    'numero_factura_carne',
    'total_personas_asistidas',
    'fecha_reparto',
    'familia_id',
    'fecha',
    'persona_recibio',
    'frutas_hortalizas_cantidad',
    'frutas_hortalizas_unidad',
    'carne_cantidad',
    'carne_unidad',
    'notas',
  ];

  // Sample data row 1 - complete example
  const sampleRow1 = [
    'ALB-2026-001',           // numero_albaran
    'REP-001',                // numero_reparto
    'FAC-CARNE-001',          // numero_factura_carne
    '15',                     // total_personas_asistidas
    today,                    // fecha_reparto
    '550e8400-e29b-41d4-a716-446655440000', // familia_id (UUID)
    today,                    // fecha
    'Maria Garcia Lopez',     // persona_recibio
    '3.5',                    // frutas_hortalizas_cantidad
    'kg',                     // frutas_hortalizas_unidad
    '2.0',                    // carne_cantidad
    'kg',                     // carne_unidad
    'Entrega completada sin incidencias', // notas
  ];

  // Sample data row 2 - minimal example
  const sampleRow2 = [
    'ALB-2026-001',
    'REP-001',
    'FAC-CARNE-001',
    '15',
    today,
    '550e8400-e29b-41d4-a716-446655440001',
    today,
    'Juan Martinez Perez',
    '2.0',
    'kg',
    '1.5',
    'kg',
    '',
  ];

  // Escape CSV values (handle commas and quotes)
  const escapeCSVValue = (value: string | number): string => {
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  // Build CSV content
  const headerRow = headers.map(escapeCSVValue).join(',');
  const row1 = sampleRow1.map(escapeCSVValue).join(',');
  const row2 = sampleRow2.map(escapeCSVValue).join(',');

  const csvContent = [headerRow, row1, row2].join('\n');

  // Generate guide content
  const guideContent = generateGuideContent();

  return {
    csvContent,
    guideContent,
    fileName,
  };
}

/**
 * Generate guide documentation for CSV template
 */
function generateGuideContent(): string {
  return `# Guía: Plantilla de Entregas CSV

## Descripción General
Esta plantilla CSV se utiliza para cargar registros de entregas de alimentos a familias beneficiarias.

## Estructura del Archivo

### Columnas Requeridas

#### Metadatos del Documento (Encabezado)
- **numero_albaran** (Requerido): Número único del albarán. Ejemplo: ALB-2026-001
- **numero_reparto** (Requerido): Número de reparto/distribución. Ejemplo: REP-001
- **numero_factura_carne** (Opcional): Número de factura de carne si aplica. Ejemplo: FAC-CARNE-001
- **total_personas_asistidas** (Requerido): Total de personas que recibieron entrega. Ejemplo: 15
- **fecha_reparto** (Requerido): Fecha del reparto en formato YYYY-MM-DD. Ejemplo: 2026-04-21

#### Datos de Entrega (Por Fila)
- **familia_id** (Requerido): UUID único de la familia. Debe existir en el sistema.
  - Formato: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  - Ejemplo: 550e8400-e29b-41d4-a716-446655440000
- **fecha** (Requerido): Fecha de la entrega en formato YYYY-MM-DD. Ejemplo: 2026-04-21
- **persona_recibio** (Requerido): Nombre completo de quien recibió la entrega. Ejemplo: Maria Garcia Lopez
- **frutas_hortalizas_cantidad** (Requerido): Cantidad de frutas/hortalizas. Ejemplo: 3.5
- **frutas_hortalizas_unidad** (Requerido): Unidad de medida (kg, l, etc.). Ejemplo: kg
- **carne_cantidad** (Requerido): Cantidad de carne. Ejemplo: 2.0
- **carne_unidad** (Requerido): Unidad de medida de carne (kg, etc.). Ejemplo: kg
- **notas** (Opcional): Observaciones adicionales. Ejemplo: Entrega completada sin incidencias

## Reglas de Validación

1. **Familia ID**: Debe ser un UUID válido que exista en el sistema
2. **Fechas**: Formato obligatorio YYYY-MM-DD (año-mes-día)
3. **Cantidades**: Números positivos (pueden incluir decimales con punto)
4. **Unidades**: Texto libre (kg, l, unidades, etc.)
5. **No duplicados**: No puede haber dos entregas iguales para la misma familia en la misma fecha
6. **Valores requeridos**: Todos los campos marcados como "Requerido" deben tener valor

## Ejemplos

### Ejemplo 1: Entrega Completa
\`\`\`
numero_albaran,numero_reparto,numero_factura_carne,total_personas_asistidas,fecha_reparto,familia_id,fecha,persona_recibio,frutas_hortalizas_cantidad,frutas_hortalizas_unidad,carne_cantidad,carne_unidad,notas
ALB-2026-001,REP-001,FAC-CARNE-001,15,2026-04-21,550e8400-e29b-41d4-a716-446655440000,2026-04-21,Maria Garcia Lopez,3.5,kg,2.0,kg,Entrega completada sin incidencias
\`\`\`

### Ejemplo 2: Entrega Mínima
\`\`\`
numero_albaran,numero_reparto,,15,2026-04-21,550e8400-e29b-41d4-a716-446655440001,2026-04-21,Juan Martinez Perez,2.0,kg,1.5,kg,
\`\`\`

## Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| "familia_id inválido" | UUID mal formado | Verificar formato: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx |
| "Familia no encontrada" | UUID no existe en sistema | Verificar que la familia esté registrada |
| "Fecha inválida" | Formato no es YYYY-MM-DD | Usar formato: 2026-04-21 |
| "Cantidad inválida" | Valor negativo o no numérico | Usar números positivos (ej: 3.5, no -3.5) |
| "Entrega duplicada" | Misma familia, misma fecha, mismos datos | Cambiar fecha o familia_id |

## Consejos

1. **Descarga plantilla actualizada**: Descarga una nueva plantilla cada vez que vayas a cargar datos (incluye fecha actual)
2. **Valida antes de subir**: Revisa que todos los datos sean correctos antes de cargar
3. **Usa UUIDs correctos**: Copia los UUIDs de familia directamente del sistema si es posible
4. **Formato de fecha**: Siempre usa YYYY-MM-DD (2026-04-21, no 21/04/2026)
5. **Unidades consistentes**: Usa las mismas unidades para cantidades similares (kg para peso, l para líquidos)

## Soporte

Si encuentras errores al cargar la plantilla:
1. Revisa la sección "Errores Comunes" arriba
2. Verifica que todos los campos requeridos tengan valor
3. Asegúrate de que los UUIDs de familia sean válidos
4. Contacta al administrador si el problema persiste
`;
}
```

- [ ] **Step 2: Add tRPC procedure to `server/routers/entregas.ts`**

```typescript
// Add to the entregas router (after existing procedures)

downloadTemplate: publicProcedure.query(async () => {
  const { csvContent, guideContent, fileName } = generateEntregasCSVTemplate();
  
  return {
    csvContent,
    guideContent,
    fileName,
  };
}),
```

- [ ] **Step 3: Run TypeScript check to verify no errors**

```bash
cd /home/ubuntu/bocatas-digital && pnpm tsc --noEmit
```

Expected: No errors

---

## Task 2: Create File Download Utility

**Files:**
- Create: `client/src/utils/downloadFile.ts`

- [ ] **Step 1: Create download utility function**

```typescript
/**
 * Download file to user's computer
 * @param content - File content (string or Blob)
 * @param fileName - Name of file to download
 * @param mimeType - MIME type of file (default: text/plain)
 */
export function downloadFile(
  content: string | Blob,
  fileName: string,
  mimeType: string = 'text/plain'
): void {
  // Create blob if content is string
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });

  // Create temporary URL
  const url = URL.createObjectURL(blob);

  // Create temporary link element
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;

  // Append to body, click, and remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up URL
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Verify file is created**

```bash
ls -la /home/ubuntu/bocatas-digital/client/src/utils/downloadFile.ts
```

Expected: File exists

---

## Task 3: Add Download Button to DeliveryDocumentUpload Modal

**Files:**
- Modify: `client/src/components/DeliveryDocumentUpload.tsx`

**Context:** The modal currently has:
1. File upload zone
2. OCR text input
3. Preview table

We need to add:
1. Download template button (before upload)
2. Instructions text
3. Loading state for template download

- [ ] **Step 1: Add imports to DeliveryDocumentUpload.tsx**

Add these imports at the top of the file:

```typescript
import { downloadFile } from '@/utils/downloadFile';
import { trpc } from '@/lib/trpc';
```

- [ ] **Step 2: Add download handler function inside component**

Inside the component (after state declarations), add:

```typescript
// Download CSV template
const handleDownloadTemplate = async () => {
  try {
    const { csvContent, guideContent, fileName } = await trpc.entregas.downloadTemplate.query();
    
    // Download CSV file
    downloadFile(csvContent, fileName, 'text/csv');
    
    // Download guide file (with .md extension)
    const guideFileName = fileName.replace('.csv', '_GUIA.md');
    downloadFile(guideContent, guideFileName, 'text/markdown');
    
    // Show success toast
    toast.success('Plantilla descargada exitosamente');
  } catch (error) {
    console.error('Error downloading template:', error);
    toast.error('Error al descargar la plantilla');
  }
};
```

- [ ] **Step 3: Add download button and instructions to modal JSX**

Find the section with "Haz clic para cargar o arrastra un archivo" and add BEFORE it:

```typescript
{/* Template Download Section */}
<div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
  <h3 className="font-semibold text-blue-900 mb-2">¿Necesitas ayuda con el formato?</h3>
  <p className="text-sm text-blue-800 mb-3">
    Descarga la plantilla CSV con ejemplos y una guía completa para entender qué información necesitas incluir.
  </p>
  <button
    onClick={handleDownloadTemplate}
    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
  >
    <Download className="w-4 h-4" />
    Descargar Plantilla CSV + Guía
  </button>
</div>
```

- [ ] **Step 4: Add Download icon import**

Add to the imports section:

```typescript
import { Download } from 'lucide-react';
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd /home/ubuntu/bocatas-digital && pnpm tsc --noEmit
```

Expected: No errors

---

## Task 4: Test Template Download Functionality

**Files:**
- Test: Manual browser testing

- [ ] **Step 1: Start dev server and navigate to modal**

```bash
cd /home/ubuntu/bocatas-digital && pnpm dev
```

Then navigate to: Familia Detail → Entregas tab → "Subir Documento de Entregas" button

- [ ] **Step 2: Click "Descargar Plantilla CSV + Guía" button**

Expected:
- Two files download: `entregas_template_YYYY-MM-DD.csv` and `entregas_template_YYYY-MM-DD_GUIA.md`
- Success toast appears: "Plantilla descargada exitosamente"

- [ ] **Step 3: Verify CSV file contents**

Open downloaded CSV file and verify:
- Headers are correct (all 13 columns)
- Sample row 1 has complete data
- Sample row 2 has minimal data
- No formatting errors

Expected CSV structure:
```
numero_albaran,numero_reparto,numero_factura_carne,total_personas_asistidas,fecha_reparto,familia_id,fecha,persona_recibio,frutas_hortalizas_cantidad,frutas_hortalizas_unidad,carne_cantidad,carne_unidad,notas
ALB-2026-001,REP-001,FAC-CARNE-001,15,2026-04-21,550e8400-e29b-41d4-a716-446655440000,2026-04-21,Maria Garcia Lopez,3.5,kg,2.0,kg,Entrega completada sin incidencias
ALB-2026-001,REP-001,FAC-CARNE-001,15,2026-04-21,550e8400-e29b-41d4-a716-446655440001,2026-04-21,Juan Martinez Perez,2.0,kg,1.5,kg,
```

- [ ] **Step 4: Verify guide file contents**

Open downloaded guide file and verify:
- Title: "Guía: Plantilla de Entregas CSV"
- Sections: Descripción General, Estructura del Archivo, Reglas de Validación, Ejemplos, Errores Comunes, Consejos, Soporte
- All column descriptions present
- Examples are readable

- [ ] **Step 5: Test error handling**

Simulate error by temporarily breaking the tRPC query, then click button:

Expected:
- Error toast appears: "Error al descargar la plantilla"
- No crash or broken UI

---

## Task 5: Update Todo and Save Checkpoint

**Files:**
- Modify: `/home/ubuntu/bocatas-digital/todo.md`

- [ ] **Step 1: Add new feature to todo.md**

Add to the "## Entregas (OCR Delivery Document Upload)" section:

```markdown
- [x] CSV-TEMPLATE-GENERATOR: Create template generation function with sample data
- [x] CSV-TEMPLATE-DOWNLOAD: Add download button to DeliveryDocumentUpload modal
- [x] CSV-TEMPLATE-GUIDE: Generate comprehensive guide documentation
- [x] CSV-TEMPLATE-TESTING: Verify template download and file contents
```

- [ ] **Step 2: Save checkpoint**

```bash
cd /home/ubuntu/bocatas-digital && webdev_save_checkpoint --description "Add CSV template download feature to Entregas upload modal"
```

---

## Success Criteria

✅ CSV template downloads with correct filename (entregas_template_YYYY-MM-DD.csv)
✅ Guide file downloads with correct filename (entregas_template_YYYY-MM-DD_GUIA.md)
✅ Template includes all 13 required columns
✅ Template includes 2 sample rows (complete + minimal)
✅ Guide includes all sections (description, structure, validation, examples, errors, tips)
✅ Download button appears in modal with clear instructions
✅ Success/error toasts display appropriately
✅ No TypeScript errors
✅ Files download to user's computer correctly
