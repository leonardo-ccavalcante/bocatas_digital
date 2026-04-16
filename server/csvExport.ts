export type ExportMode = 'update' | 'audit' | 'verify';

interface Family {
  id: string;
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
const EXPORT_FIELDS = {
  update: [
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
 * Generate CSV content for families export
 * @param families Array of family records
 * @param mode Export mode: 'update' (all fields), 'audit' (key fields), 'verify' (minimal fields)
 * @returns CSV string with header and data rows
 */
export function generateFamiliesCSV(families: Family[], mode: ExportMode): string {
  const fields = EXPORT_FIELDS[mode];

  // Generate header row
  const header = fields.join(',');

  // Generate data rows
  const rows = families.map((family) => {
    return fields
      .map((field) => {
        const value = (family as unknown as Record<string, unknown>)[field];
        return escapeCSVField(value);
      })
      .join(',');
  });

  // Combine header and rows with newlines
  return [header, ...rows].join('\n') + '\n';
}
