import { ilikeForOr } from "../../_core/postgrestFilter";

/**
 * How families.getAll interprets its `search` input, and which titular embed
 * that interpretation requires.
 *
 * A titular-NAME search must filter PARENT rows through the embedded resource,
 * which PostgREST only does with an `!inner` embed. The plain list and the
 * numeric search keep left-join semantics so families whose `titular_id` is
 * NULL still appear. Separately, a top-level `.or()` over embedded dotted
 * paths is a PGRST100 parse error (a 500 on every text search), so the `.or()`
 * has to be scoped with `{ referencedTable: "persons" }` — which in turn means
 * the filter string carries bare column names, not `persons.`-prefixed ones.
 */
// Written out literally, not composed from a shared column constant: supabase-js
// parses the select string at the TYPE level, so anything but a string literal
// collapses the row type to ParserError and breaks every consumer of getAll.
export const TITULAR_EMBED_INNER =
  "persons!titular_id!inner(id, nombre, apellidos, telefono)" as const;
export const TITULAR_EMBED_LEFT =
  "persons!titular_id(id, nombre, apellidos, telefono)" as const;

export type FamilySearch =
  | { kind: "none" }
  | { kind: "numero"; numero: number }
  | { kind: "nombre"; orFilter: string };

export function parseFamilySearch(search: string | undefined): FamilySearch {
  if (!search) return { kind: "none" };
  const numero = parseInt(search);
  if (!isNaN(numero)) return { kind: "numero", numero };
  const token = ilikeForOr(search);
  return { kind: "nombre", orFilter: `nombre.ilike.${token},apellidos.ilike.${token}` };
}

/** Return type is the literal union on purpose — see the constants above. */
export function titularEmbedFor(
  search: FamilySearch
): typeof TITULAR_EMBED_INNER | typeof TITULAR_EMBED_LEFT {
  return search.kind === "nombre" ? TITULAR_EMBED_INNER : TITULAR_EMBED_LEFT;
}
