export type ExportMode = 'update' | 'audit' | 'verify';

interface Family {
  id: string; // familia_id (UUID) - CRITICAL for import matching
  familia_numero: string;
  nombre_familia: string;
  contacto_principal: string;
  telefono: string;
  direccion: string;
  estado: string;
  fecha_creacion: string;
  miembros_count: number;
  docs_identidad: boolean;
  padron_recibido: boolean;
  justificante_recibido: boolean;
  consent_bocatas: boolean;
  consent_banco_alimentos: boolean;
  informe_social: boolean;
  informe_social_fecha: string | null;
  alta_en_guf: boolean;
  fecha_alta_guf: string | null;
  guf_verified_at: string | null;
}

// Field definitions for each export mode
// NOTE: 'id' (familia_id UUID) is ALWAYS included first for reliable data matching during import
const EXPORT_FIELDS = {
  update: [
    'id', // familia_id (UUID) - CRITICAL for import matching
    'familia_numero',
    'nombre_familia',
    'contacto_principal',
    'telefono',
    'direccion',
    'estado',
    'fecha_creacion',
    'miembros_count',
    'docs_identidad',
    'padron_recibido',
    'justificante_recibido',
    'consent_bocatas',
    'consent_banco_alimentos',
    'informe_social',
    'informe_social_fecha',
    'alta_en_guf',
    'fecha_alta_guf',
    'guf_verified_at',
  ],
  audit: [
    'id', // familia_id (UUID) - CRITICAL for import matching
    'familia_numero',
    'nombre_familia',
    'contacto_principal',
    'telefono',
    'estado',
    'fecha_creacion',
    'miembros_count',
    'consent_bocatas',
    'consent_banco_alimentos',
    'informe_social',
    'alta_en_guf',
  ],
  verify: [
    'id', // familia_id (UUID) - CRITICAL for import matching
    'familia_numero',
    'nombre_familia',
    'contacto_principal',
    'estado',
  ],
};

/**
 * Escape CSV field value according to RFC 4180
 * - Wrap in quotes if contains comma, quote, or newline
 * - Double any quotes inside the value
 */
function escapeCSVField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  const needsQuotes = str.includes(',') || str.includes('"') || str.includes('\n');

  if (needsQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Generate CSV content for families export with UUID support
 * @param families Array of family records
 * @param mode Export mode: 'update' (all fields), 'audit' (key fields), 'verify' (minimal fields)
 * @returns CSV string with header and data rows
 *
 * IMPORTANT: The first column is always familia_id (UUID) to enable reliable matching during import.
 * This prevents data mismatches when families have similar names.
 */
export function generateFamiliesCSV(families: Family[], mode: ExportMode): string {
  const fields = EXPORT_FIELDS[mode];

  // Generate header row with familia_id label for clarity
  const headerFields = fields.map(field => field === 'id' ? 'familia_id' : field);
  const header = headerFields.join(',');

  // Generate data rows
  const rows = families.map((family) => {
    return fields
      .map((field) => {
        // Map 'id' field to familia_id for clarity in CSV
        const fieldKey = field === 'id' ? 'id' : field;
        const value = (family as unknown as Record<string, unknown>)[fieldKey];
        return escapeCSVField(value);
      })
      .join(',');
  });

  // Combine header and rows with newlines
  // Note: familia_id (UUID) is in first column for reliable import matching
  return [header, ...rows].join('\n') + '\n';
}
