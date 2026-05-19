/**
 * Madrid's 21 administrative distritos.
 *
 * Source: Ayuntamiento de Madrid open data
 * (datos.madrid.es — "Distritos administrativos").
 *
 * Slugs are kebab-case ASCII (no tildes) for use in URLs, RLS policy filters,
 * and the SQL `madrid_distrito_for(text)` function's return values. The
 * `label` field is the canonical Spanish name (with tildes) for UI display.
 *
 * NOTE: any change to this list MUST be mirrored in the SQL CASE list inside
 * the M1 migration's `madrid_distrito_for(text)` function. The drift-guard
 * test at `server/__tests__/madrid-distrito-drift.test.ts` enforces parity.
 */

export const DISTRITO_SLUGS = [
  "centro",
  "arganzuela",
  "retiro",
  "salamanca",
  "chamartin",
  "tetuan",
  "chamberi",
  "fuencarral-el-pardo",
  "moncloa-aravaca",
  "latina",
  "carabanchel",
  "usera",
  "puente-de-vallecas",
  "moratalaz",
  "ciudad-lineal",
  "hortaleza",
  "villaverde",
  "villa-de-vallecas",
  "vicalvaro",
  "san-blas-canillejas",
  "barajas",
] as const;

export type DistritoSlug = (typeof DISTRITO_SLUGS)[number];

export const DISTRITO_LABELS: Record<DistritoSlug, string> = {
  centro: "Centro",
  arganzuela: "Arganzuela",
  retiro: "Retiro",
  salamanca: "Salamanca",
  chamartin: "Chamartín",
  tetuan: "Tetuán",
  chamberi: "Chamberí",
  "fuencarral-el-pardo": "Fuencarral-El Pardo",
  "moncloa-aravaca": "Moncloa-Aravaca",
  latina: "Latina",
  carabanchel: "Carabanchel",
  usera: "Usera",
  "puente-de-vallecas": "Puente de Vallecas",
  moratalaz: "Moratalaz",
  "ciudad-lineal": "Ciudad Lineal",
  hortaleza: "Hortaleza",
  villaverde: "Villaverde",
  "villa-de-vallecas": "Villa de Vallecas",
  vicalvaro: "Vicálvaro",
  "san-blas-canillejas": "San Blas-Canillejas",
  barajas: "Barajas",
};

export function isDistritoSlug(value: string): value is DistritoSlug {
  return (DISTRITO_SLUGS as readonly string[]).includes(value);
}
