/**
 * personMatcher.ts — resolves ficha PersonRefs to existing `persons` rows.
 *
 * READ-ONLY in every mode. Primary key: exact `numero_documento` (trimmed).
 * Fallback: normalized nombre+apellidos (lowercase, accents stripped).
 * Ambiguity or absence NEVER guesses and NEVER creates persons — the ref is
 * reported in `unmatched` for stakeholder review.
 */
import type { EnrollmentSpec, PersonRef } from "./formacionMapper";
import type { DbResult, ImportDb, PersonRow } from "./dbTypes";
import { PERSON_COLUMNS } from "./dbTypes";

export type UnmatchedReason =
  | "documento_ambiguo"
  | "nombre_ambiguo"
  | "persona_no_encontrada";

export interface UnmatchedPerson {
  person: PersonRef;
  reason: UnmatchedReason;
  editionSlugs: string[];
}

export type MatchedEnrollment = EnrollmentSpec & { personId: string };

export interface MatchResult {
  matched: MatchedEnrollment[];
  unmatched: UnmatchedPerson[];
  errors: string[];
}

const PAGE_SIZE = 1000;

/** Fetches all active persons, paging past the Supabase 1000-row limit. */
async function fetchAllPersons(db: ImportDb): Promise<DbResult<PersonRow[]>> {
  const rows: PersonRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .persons()
      .select(PERSON_COLUMNS)
      .is("deleted_at", null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}

/** lowercase + strip accents + collapse whitespace. */
function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function nameKey(nombre: string, apellidos: string): string {
  return `${normalizeName(nombre)}|${normalizeName(apellidos)}`;
}

interface PersonIndex {
  byDoc: Map<string, PersonRow[]>;
  byName: Map<string, PersonRow[]>;
}

function indexPersons(rows: PersonRow[]): PersonIndex {
  const byDoc = new Map<string, PersonRow[]>();
  const byName = new Map<string, PersonRow[]>();
  for (const row of rows) {
    const doc = row.numero_documento?.trim();
    if (doc) byDoc.set(doc, [...(byDoc.get(doc) ?? []), row]);
    const key = nameKey(row.nombre, row.apellidos ?? "");
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  return { byDoc, byName };
}

type Resolution = { personId: string } | { reason: UnmatchedReason };

function resolvePerson(person: PersonRef, index: PersonIndex): Resolution {
  const doc = person.numeroDoc.trim();
  if (doc) {
    const byDoc = index.byDoc.get(doc) ?? [];
    if (byDoc.length === 1) return { personId: byDoc[0].id };
    if (byDoc.length > 1) return { reason: "documento_ambiguo" };
  }
  const byName = index.byName.get(nameKey(person.nombre, person.apellidos)) ?? [];
  if (byName.length === 1) return { personId: byName[0].id };
  if (byName.length > 1) return { reason: "nombre_ambiguo" };
  return { reason: "persona_no_encontrada" };
}

/** Resolves every enrollment's person against the DB. Read-only. */
export async function matchPersons(
  db: ImportDb,
  enrollments: EnrollmentSpec[],
): Promise<MatchResult> {
  const { data: rows, error } = await fetchAllPersons(db);
  if (error || !rows) {
    return { matched: [], unmatched: [], errors: [`persons fetch: ${error?.message ?? "sin datos"}`] };
  }
  const index = indexPersons(rows);
  const matched: MatchedEnrollment[] = [];
  const unmatchedByPerson = new Map<PersonRef, UnmatchedPerson>();
  const cache = new Map<PersonRef, Resolution>();

  for (const enrollment of enrollments) {
    let resolution = cache.get(enrollment.person);
    if (!resolution) {
      resolution = resolvePerson(enrollment.person, index);
      cache.set(enrollment.person, resolution);
    }
    if ("personId" in resolution) {
      matched.push({ ...enrollment, personId: resolution.personId });
      continue;
    }
    const existing = unmatchedByPerson.get(enrollment.person);
    if (existing) {
      existing.editionSlugs.push(enrollment.editionSlug);
    } else {
      unmatchedByPerson.set(enrollment.person, {
        person: enrollment.person,
        reason: resolution.reason,
        editionSlugs: [enrollment.editionSlug],
      });
    }
  }

  return { matched, unmatched: [...unmatchedByPerson.values()], errors: [] };
}
