export type ExportMode = 'update' | 'audit' | 'verify';

interface Family {
  id: string; // familia_id (UUID)
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

interface FamilyMember {
  id: string; // miembro_id (UUID)
  familia_id: string;
  nombre: string;
  rol: string;
  relacion: string | null;
  fecha_nacimiento: string | null;
  estado: string;
}

interface FamilyWithMembers {
  family: Family;
  members: FamilyMember[];
}

// Field definitions for each export mode
// NOTE: familia_id and miembro_id are ALWAYS included for reliable matching
const EXPORT_FIELDS = {
  update: {
    family: [
      'id', // familia_id (UUID)
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
    member: [
      'id', // miembro_id (UUID)
      'familia_id',
      'nombre',
      'rol',
      'relacion',
      'fecha_nacimiento',
      'estado',
    ],
  },
  audit: {
    family: [
      'id', // familia_id (UUID)
      'familia_numero',
      'nombre_familia',
      'contacto_principal',
      'estado',
      'fecha_creacion',
      'miembros_count',
    ],
    member: [
      'id', // miembro_id (UUID)
      'familia_id',
      'nombre', // maps to miembro_nombre in header
      'rol', // maps to miembro_rol in header
      'relacion', // maps to miembro_relacion in header
      'estado', // maps to miembro_estado in header
    ],
  },
  verify: {
    family: [
      'id', // familia_id (UUID)
      'familia_numero',
      'nombre_familia',
      'contacto_principal',
      'estado',
    ],
    member: [
      'id', // miembro_id (UUID)
      'familia_id',
      'nombre', // maps to miembro_nombre in header
      'rol', // maps to miembro_rol in header
      'estado', // maps to miembro_estado in header
    ],
  },
};

/**
 * Escape CSV field value according to RFC 4180
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
 * Generate CSV header row with both family and member fields
 */
function generateHeader(mode: ExportMode): string {
  const familyFields = EXPORT_FIELDS[mode].family;
  const memberFields = EXPORT_FIELDS[mode].member;

  // Map 'id' fields to clear names and add 'miembro_' prefix to member fields
  const familyHeaders = familyFields.map(f => f === 'id' ? 'familia_id' : f);
  const memberHeaders = memberFields.map(f => {
    if (f === 'id') return 'miembro_id';
    if (f === 'familia_id') return 'familia_id'; // Keep familia_id without prefix
    return `miembro_${f}`; // Add miembro_ prefix to other member fields
  });

  return [...familyHeaders, ...memberHeaders].join(',');
}

/**
 * Generate CSV row for a family (without members)
 */
function generateFamilyRow(family: Family, mode: ExportMode): string {
  const familyFields = EXPORT_FIELDS[mode].family;
  const memberFields = EXPORT_FIELDS[mode].member;

  // Family data
  const familyValues = familyFields.map(field => {
    const value = (family as unknown as Record<string, unknown>)[field];
    return escapeCSVField(value);
  });

  // Empty member data (same number of columns as member fields)
  const memberValues = memberFields.map(() => '');

  return [...familyValues, ...memberValues].join(',');
}

/**
 * Generate CSV row for a family member
 */
function generateMemberRow(family: Family, member: FamilyMember, mode: ExportMode): string {
  const familyFields = EXPORT_FIELDS[mode].family;
  const memberFields = EXPORT_FIELDS[mode].member;

  // Family data (repeated for each member)
  const familyValues = familyFields.map(field => {
    const value = (family as unknown as Record<string, unknown>)[field];
    return escapeCSVField(value);
  });

  // Member data
  const memberValues = memberFields.map(field => {
    const value = (member as unknown as Record<string, unknown>)[field];
    return escapeCSVField(value);
  });

  return [...familyValues, ...memberValues].join(',');
}

/**
 * Generate CSV content for families + members export with UUID support
 * @param familiesWithMembers Array of families with their members
 * @param mode Export mode: 'update' (all fields), 'audit' (key fields), 'verify' (minimal fields)
 * @returns CSV string with header and data rows
 *
 * IMPORTANT: 
 * - familia_id (UUID) is first column for reliable family matching during import
 * - miembro_id (UUID) is included for reliable member matching during import
 * - Each member row repeats family data for context
 * - Prevents data mismatches when families/members have similar names
 */
export function generateFamiliesCSVWithMembers(
  familiesWithMembers: FamilyWithMembers[],
  mode: ExportMode
): string {
  const header = generateHeader(mode);
  const rows: string[] = [];

  // Generate rows for each family and its members
  for (const { family, members } of familiesWithMembers) {
    if (members.length === 0) {
      // Family with no members: generate single row with empty member fields
      rows.push(generateFamilyRow(family, mode));
    } else {
      // Family with members: generate one row per member
      for (const member of members) {
        rows.push(generateMemberRow(family, member, mode));
      }
    }
  }

  // Combine header and rows
  return [header, ...rows].join('\n') + '\n';
}
