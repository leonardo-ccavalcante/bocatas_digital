/**
 * nameSearch.ts — shared name-search normalisation (RC-06, QA F027/F065).
 *
 * The SAME normalisation must be applied to the search query (server routers
 * checkin.searchPersons / persons.search, client Personas filter) as the DB
 * applies to `persons.nombre_norm` (f_unaccent(lower(nombre || ' ' ||
 * apellidos)), migration 20260830100001). NFD + combining-mark strip mirrors
 * unaccent for the Latin diacritics in scope (á é í ó ú ü ñ ç …).
 */

/** Lowercase, trim and strip diacritics — JS mirror of the DB's f_unaccent(lower(…)). */
export function normalizeNameSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** Whitespace-token split of the normalised query; [] for blank input. */
export function nameSearchTokens(query: string): string[] {
  return normalizeNameSearch(query).split(/\s+/).filter(Boolean);
}
