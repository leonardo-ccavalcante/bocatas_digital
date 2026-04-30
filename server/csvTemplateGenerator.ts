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
