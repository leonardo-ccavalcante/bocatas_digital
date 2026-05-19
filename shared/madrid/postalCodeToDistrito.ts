import type { DistritoSlug } from "./distritos";

/**
 * Mapping of 5-digit Spanish postal codes within Madrid (28xxx) to the
 * administrative distrito that the *majority* of that postal-code area falls
 * within. Postal-code boundaries and distrito boundaries are not identical —
 * some codes span multiple distritos. We resolve ambiguity by majority
 * assignment.
 *
 * Source: Ayuntamiento de Madrid open data
 * (datos.madrid.es — "Códigos postales por distrito").
 * Cross-checked against Correos España boundary data.
 *
 * INVARIANT (enforced by `server/__tests__/madrid-distrito-drift.test.ts`):
 *   • Every value MUST be a valid `DistritoSlug` from `./distritos`.
 *   • The set of keys MUST be byte-identical to the SQL CASE list inside the
 *     M1 migration's `madrid_distrito_for(text)` function.
 *   • Total entries ≥ 60 (Madrid municipal codes 28001-28055 + select outliers).
 *
 * NOT included: codes that fall outside the Madrid municipal boundary
 * (e.g. 28100 Alcobendas, 28200 San Lorenzo). For those, `madridDistritoFor`
 * returns `null` (caller decides whether to render "fuera de Madrid" or hide).
 */
export const POSTAL_CODE_TO_DISTRITO: Readonly<Record<string, DistritoSlug>> = {
  // Centro
  "28004": "centro",
  "28012": "centro",
  "28013": "centro",
  "28014": "centro",

  // Arganzuela
  "28005": "arganzuela",
  "28045": "arganzuela",

  // Retiro
  "28007": "retiro",
  "28009": "retiro",

  // Salamanca
  "28001": "salamanca",
  "28006": "salamanca",
  "28028": "salamanca",

  // Chamartín
  "28002": "chamartin",
  "28036": "chamartin",
  "28046": "chamartin",

  // Tetuán
  "28020": "tetuan",
  "28039": "tetuan",

  // Chamberí
  "28003": "chamberi",
  "28010": "chamberi",
  "28015": "chamberi",

  // Fuencarral-El Pardo
  "28029": "fuencarral-el-pardo",
  "28034": "fuencarral-el-pardo",
  "28035": "fuencarral-el-pardo",
  "28048": "fuencarral-el-pardo",
  "28049": "fuencarral-el-pardo",

  // Moncloa-Aravaca
  "28008": "moncloa-aravaca",
  "28023": "moncloa-aravaca",
  "28040": "moncloa-aravaca",

  // Latina
  "28011": "latina",
  "28024": "latina",
  "28047": "latina",

  // Carabanchel
  "28019": "carabanchel",
  "28025": "carabanchel",
  "28044": "carabanchel",

  // Usera
  "28026": "usera",

  // Puente de Vallecas
  "28018": "puente-de-vallecas",
  "28038": "puente-de-vallecas",

  // Moratalaz
  "28030": "moratalaz",

  // Ciudad Lineal
  "28017": "ciudad-lineal",
  "28027": "ciudad-lineal",
  "28037": "ciudad-lineal",

  // Hortaleza
  "28033": "hortaleza",
  "28043": "hortaleza",
  "28050": "hortaleza",

  // Villaverde
  "28021": "villaverde",
  "28041": "villaverde",

  // Villa de Vallecas
  "28031": "villa-de-vallecas",
  "28051": "villa-de-vallecas",

  // Vicálvaro
  "28032": "vicalvaro",
  "28052": "vicalvaro",

  // San Blas-Canillejas
  "28022": "san-blas-canillejas",
  "28053": "san-blas-canillejas",

  // Barajas
  "28042": "barajas",
  "28055": "barajas",
};

/**
 * Return the distrito for a given 5-digit Spanish postal code, or `null` if
 * the code is outside Madrid municipality (or unknown). Caller decides UI.
 */
export function madridDistritoFor(postalCode: string | null | undefined): DistritoSlug | null {
  if (!postalCode) return null;
  return POSTAL_CODE_TO_DISTRITO[postalCode] ?? null;
}
