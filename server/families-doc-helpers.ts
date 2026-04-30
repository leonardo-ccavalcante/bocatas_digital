import type { FamilyDocType } from "../shared/familyDocuments";

/** Is a doc considered "uploaded"? */
export function isDocUploaded(
  row:
    | { documento_url: string | null; deleted_at: string | null; is_current: boolean }
    | undefined
    | null
): boolean {
  if (!row) return false;
  if (row.deleted_at) return false;
  if (!row.is_current) return false;
  return row.documento_url != null;
}

/** Compute the boolean cache value for a family + doc_type given current uploaded rows. */
export function recomputeBooleanCache(
  rows: Array<{
    family_id: string;
    documento_tipo: string;
    documento_url: string | null;
    deleted_at: string | null;
    is_current: boolean;
  }>,
  family_id: string,
  doc_type: FamilyDocType
): boolean {
  return rows.some(
    (r) =>
      r.family_id === family_id &&
      r.documento_tipo === doc_type &&
      isDocUploaded(r)
  );
}

/** Is a member ≥14 (or has unknown DOB → treated as adult)? */
export function isMemberAdult(
  member: { fecha_nacimiento?: string | null },
  today: Date = new Date()
): boolean {
  if (!member.fecha_nacimiento) return true;
  const dob = new Date(member.fecha_nacimiento);
  if (isNaN(dob.getTime())) return true;
  const ageMs = today.getTime() - dob.getTime();
  return ageMs / (365.25 * 24 * 3600 * 1000) >= 14;
}

/** Build composite key for "is doc X uploaded for family Y member Z?" lookups. */
export function buildDocKey(
  family_id: string,
  member_index: number,
  doc_type: string
): string {
  return `${family_id}:${member_index}:${doc_type}`;
}

/** Exact-match dedup heuristic: are these the same person? */
export function isSamePerson(
  a: { nombre: string; apellidos: string; fecha_nacimiento?: string | null },
  b: { nombre: string; apellidos: string; fecha_nacimiento?: string | null }
): boolean {
  return (
    a.nombre === b.nombre &&
    a.apellidos === b.apellidos &&
    !!a.fecha_nacimiento &&
    a.fecha_nacimiento === b.fecha_nacimiento
  );
}

/** Required doc types at the family level (member_index = -1). */
export const REQUIRED_FAMILY_DOC_TYPES: ReadonlyArray<FamilyDocType> = [
  "padron_municipal",
  "informe_social",
];

/** Required doc types per adult member (member_index ≥ 0). */
export const REQUIRED_PER_MEMBER_DOC_TYPES: ReadonlyArray<FamilyDocType> = [
  "documento_identidad",
  "consent_bocatas",
  "consent_banco_alimentos",
];

/** Compute pending items for a family — pure function over inputs. */
export function computePendingForFamily(
  family: { id: string; familia_numero: number; created_at: string },
  titular: { id: string; nombre: string; apellidos: string | null } | null,
  miembros: Array<{
    nombre: string;
    apellidos?: string | null;
    person_id?: string | null;
    fecha_nacimiento?: string | null;
  }>,
  uploadedDocs: Array<{
    family_id: string;
    member_index: number;
    documento_tipo: string;
    documento_url: string | null;
    deleted_at: string | null;
    is_current: boolean;
  }>,
  today: Date = new Date()
): Array<{
  family_id: string;
  familia_numero: number;
  member_index: number;
  member_name: string;
  person_id: string | null;
  doc_type: string;
  days_pending: number;
}> {
  const pending: Array<{
    family_id: string;
    familia_numero: number;
    member_index: number;
    member_name: string;
    person_id: string | null;
    doc_type: string;
    days_pending: number;
  }> = [];

  const familyAge = Math.floor(
    (today.getTime() - new Date(family.created_at).getTime()) /
      (1000 * 60 * 60 * 24)
  );

  const isUploadedFor = (member_index: number, doc_type: string): boolean =>
    uploadedDocs.some(
      (r) =>
        r.family_id === family.id &&
        r.member_index === member_index &&
        r.documento_tipo === doc_type &&
        isDocUploaded(r)
    );

  // Family-level docs (member_index = -1)
  const titularName = titular
    ? `${titular.nombre} ${titular.apellidos ?? ""}`.trim()
    : "";

  for (const dt of REQUIRED_FAMILY_DOC_TYPES) {
    if (!isUploadedFor(-1, dt)) {
      pending.push({
        family_id: family.id,
        familia_numero: family.familia_numero,
        member_index: -1,
        member_name: titularName,
        person_id: titular?.id ?? null,
        doc_type: dt,
        days_pending: familyAge,
      });
    }
  }

  // Build ordered member list: titular at index 0, then additional members
  const allMembers: Array<{
    member_index: number;
    nombre: string;
    apellidos: string | null;
    person_id: string | null;
    fecha_nacimiento: string | null;
  }> = [];

  if (titular) {
    allMembers.push({
      member_index: 0,
      nombre: titular.nombre,
      apellidos: titular.apellidos,
      person_id: titular.id,
      fecha_nacimiento: null,
    });
  }

  miembros.forEach((m, i) =>
    allMembers.push({
      member_index: i + 1,
      nombre: m.nombre,
      apellidos: m.apellidos ?? null,
      person_id: m.person_id ?? null,
      fecha_nacimiento: m.fecha_nacimiento ?? null,
    })
  );

  // Per-member docs — adults only (≥14)
  const adults = allMembers.filter((m) => isMemberAdult(m, today));

  for (const member of adults) {
    for (const dt of REQUIRED_PER_MEMBER_DOC_TYPES) {
      if (!isUploadedFor(member.member_index, dt)) {
        pending.push({
          family_id: family.id,
          familia_numero: family.familia_numero,
          member_index: member.member_index,
          member_name: `${member.nombre} ${member.apellidos ?? ""}`.trim(),
          person_id: member.person_id,
          doc_type: dt,
          days_pending: familyAge,
        });
      }
    }
  }

  return pending;
}
