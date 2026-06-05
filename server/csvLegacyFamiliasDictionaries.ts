// Lookup tables for the legacy FAMILIAS CSV value mappers.
//
// Keys are ALREADY normalized (accent-stripped, lowercased, non-alphanumeric
// collapsed to single spaces — see normalizeHeader in csvLegacyFamiliasParser).
// Built from the 128 distinct PAIS and 104 distinct CABEZA/parentesco values
// observed in the real export on 2026-06-04, so coverage is empirical, not
// guessed. Unknown values still surface a warning for human review.

// ─── Spanish month names (abbreviated + full) → 1-12 ─────────────────────────
export const MONTHS: Record<string, number> = {
  ene: 1, enero: 1,
  feb: 2, febrero: 2,
  mar: 3, marzo: 3,
  abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8,
  sep: 9, sept: 9, septiembre: 9, setiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
};

// ─── Country → ISO-3166-1 alpha-2 ────────────────────────────────────────────
// Includes canonical names, ALL-CAPS/lowercase variants (collapse via
// normalize), adjectival forms (peruana→PE), abbreviations (rep dominicana),
// typos seen in the file (hoduras, venezula, maruecos…), and city-as-country
// entries (tehran iran→IR). Dual-nationality ("Perú/Española") is resolved
// upstream by splitting on "/" and taking the first segment.
export const COUNTRY_LOOKUP: Record<string, string> = {
  // Spain (+ adjectival + typos)
  espana: "ES", espanola: "ES", espanol: "ES", espalola: "ES",
  // Peru
  peru: "PE", peruana: "PE", peruano: "PE",
  // Venezuela
  venezuela: "VE", venezula: "VE", venezolana: "VE",
  // Colombia
  colombia: "CO", colombiana: "CO", colombbia: "CO", colomvbia: "CO",
  // Honduras
  honduras: "HN", hoduras: "HN",
  // Morocco
  marruecos: "MA", maruecos: "MA",
  // Cuba
  cuba: "CU", cubana: "CU",
  // Paraguay
  paraguay: "PY", paraguat: "PY",
  // Ecuador
  ecuador: "EC", ecuatoriana: "EC",
  // Argentina
  argentina: "AR", argentino: "AR",
  // Bolivia
  bolivia: "BO", boliviana: "BO",
  // Chile
  chile: "CL", chileno: "CL",
  // Dominican Republic (many forms)
  "republica dominicana": "DO", "rep dominicana": "DO", dominicana: "DO",
  "dominicana republica": "DO", "santo domingo": "DO", "republica dominican": "DO",
  // Rest of Latin America
  nicaragua: "NI", "el salvador": "SV", guatemala: "GT", "costa rica": "CR",
  mexico: "MX", uruguay: "UY", haiti: "HT", brasil: "BR",
  // Maghreb / Africa
  argelia: "DZ", algeria: "DZ", tunez: "TN", tunes: "TN", egipto: "EG",
  "el cairo egipto": "EG", senegal: "SN", nigeria: "NG", mali: "ML",
  gambia: "GM", gambi: "GM", "guinea ecuatorial": "GQ", "guinea ecuatoral": "GQ",
  "guinea conakry": "GN", guinea: "GN", "costa de marfil": "CI",
  camerun: "CM", "republica de camerun": "CM", somalia: "SO", sahara: "EH",
  // Middle East / Asia
  siria: "SY", iran: "IR", "arak iran": "IR", "khonsar iran": "IR",
  "tehran iran": "IR", jordania: "JO", afganistan: "AF", filipinas: "PH",
  kazakistan: "KZ",
  // Europe
  italia: "IT", portugal: "PT", francia: "FR", frances: "FR", rumania: "RO",
  ucrania: "UA", rusia: "RU", georgia: "GE", polonia: "PL", albania: "AL",
  bulgaria: "BG",
};

// ─── Parentesco → DB relacion enum (only the SPECIFIC mappings) ───────────────
// Everything not listed here (nieto, sobrino, tío, primo, cuñado, yerno, nuera,
// hijastra, padrastro, pareja, amigo, casero, conviviente, acojido…) has no
// dedicated enum value and is intentionally coerced to "other" with a warning,
// preserving the original string in metadata.parentesco_original.
type RelacionMapped =
  | "esposo_a" | "hijo_a" | "madre" | "padre" | "suegro_a" | "hermano_a" | "abuelo_a";

export const PARENTESCO_LOOKUP: Record<string, RelacionMapped> = {
  hijo: "hijo_a", hija: "hijo_a", "hijo a": "hijo_a", hijio: "hijo_a",
  esposo: "esposo_a", esposa: "esposo_a", "esposo a": "esposo_a",
  marido: "esposo_a", mujer: "esposo_a",
  hermano: "hermano_a", hermana: "hermano_a", "hermano a": "hermano_a",
  hemano: "hermano_a", hernamo: "hermano_a",
  madre: "madre", mama: "madre", madee: "madre",
  padre: "padre", papa: "padre",
  abuelo: "abuelo_a", abuela: "abuelo_a", "abuelo a": "abuelo_a",
  suegro: "suegro_a", suegra: "suegro_a", "suegro a": "suegro_a",
};

// ─── Colectivos (Otras Características) → internal tag ─────────────────────────
export const COLECTIVO_LOOKUP: Record<string, string> = {
  "colectivo lgtbi": "LGTBI",
  lgtbi: "LGTBI",
  gitanos: "Gitanos",
  "sin hogar": "Sin_Hogar",
  "reclusos y o exreclusos": "Reclusos",
  reclusos: "Reclusos",
};
