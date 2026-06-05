// Structure/ingestion layer for the legacy FAMILIAS CSV importer.
//
// These functions turn the *raw CSV text* into a LegacyRow keyed by column
// NAME (not position), which is what makes the importer robust against the
// real GUF export: that file has 54 columns (vs the 19-column template), with
// extra columns (`ACTIVA/BAJA BOCATAS`, `DOCUMENTACIÓN EN REGLA`, …) inserted
// *between* the canonical fields — so a positional map reads país from the
// status column. We resolve each header cell to a canonical key by alias.
//
// Pure functions, no DB access → ≥95% unit-testable. Field-VALUE coercion
// (dates, country, parentesco, …) lives in csvLegacyFamiliasMapper.ts.

import type { LegacyRow } from "../shared/legacyFamiliasTypes";

// ─── repairMojibake (G4 — idempotent safety net) ─────────────────────────────
//
// The real export analyzed on 2026-06-04 is clean UTF-8 (0 mojibake), so this
// is a NO-OP on it. It exists only to defend a future double-encoded GUF export
// (UTF-8 bytes mis-read as Latin-1/CP1252, e.g. "EspaÃ±a"). Guarded by the
// classic signature so it never touches already-correct text, and verified not
// to introduce U+FFFD — making it safe and idempotent either way.
export function repairMojibake(input: string): string {
  if (!input) return input;
  // Spanish accented letters (ñ á é í ó ú …) encode in UTF-8 as 0xC3 0xNN;
  // mis-read as Latin-1 they surface as 'Ã'/'Â' (U+00C2–U+00C3) followed by a
  // continuation byte (U+0080–U+00BF). That two-char sequence is the signature.
  if (!/[\u00C2\u00C3][\u0080-\u00BF]/.test(input)) return input;
  try {
    const repaired = Buffer.from(input, "latin1").toString("utf8");
    // If the round-trip produced a replacement char, the input wasn't actually
    // double-encoded — keep the original rather than corrupt it.
    if (repaired.includes("\uFFFD")) return input;
    // Only accept the round-trip when it actually REDUCES the mojibake
    // signature (a genuine fix), so a rare valid string containing a
    // Latin-1 continuation char after C2/C3 is never silently altered.
    const sigG = /[\u00C2\u00C3][\u0080-\u00BF]/g;
    const before = (input.match(sigG) ?? []).length;
    const after = (repaired.match(sigG) ?? []).length;
    return after < before ? repaired : input;
  } catch {
    return input;
  }
}

// ─── parseCSVDocument (G2 — whole-document, quote-aware) ──────────────────────
//
// State machine over the ENTIRE text so a newline inside a quoted field (the
// real NOTAS cells contain them — 4107 physical lines collapse to 4015 records)
// is treated as content, not a row break. Modeled on parseCSVRows() in
// server/csvImport.ts but kept in this module to respect feature ownership and
// to preserve raw (untrimmed) values — trimming happens in the value mappers.
export function parseCSVDocument(text: string, maxRecords = 100_000): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false; // current row has begun (guards trailing-newline phantom row)

  // Strip a leading BOM if present.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++; // consume the escaped quote
      } else {
        inQuotes = !inQuotes;
      }
      started = true;
    } else if (c === "," && !inQuotes) {
      row.push(field);
      field = "";
      started = true;
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      row.push(field);
      rows.push(row);
      if (rows.length > maxRecords) {
        throw new RangeError(`CSV excede el máximo de ${maxRecords} registros.`);
      }
      row = [];
      field = "";
      started = false;
      if (c === "\r" && next === "\n") i++; // CRLF → one break
    } else {
      field += c;
      started = true;
    }
  }
  // Flush a final row only if the document didn't end on a clean row break.
  if (started || field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ─── Header-name resolution (G1 / R1) ─────────────────────────────────────────

// Normalize a header cell for matching: repair mojibake → strip accents →
// lowercase → collapse every non-alphanumeric run (newline, slash, º, …) to a
// single space. This turns the real multi-line cell
//   'CABEZA DE FAMILIA\n(MARCAR CON UNA X DONDE PROCEDA)'
// into 'cabeza de familia marcar con una x donde proceda', which still matches
// the 'cabeza de familia' alias by startswith — R1's empirically-required path.
export function normalizeHeader(input: string): string {
  return repairMojibake(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Normalized aliases per canonical LegacyRow key. Order within a list is
// irrelevant; matching tries every alias and keeps the strongest tier.
const ALIAS_TABLE: Record<keyof LegacyRow, string[]> = {
  numero_orden: ["numero de orden", "n de orden", "orden"],
  numero_familia: ["numero familia bocatas", "numero familia", "n familia bocatas", "familia bocatas"],
  fecha_alta: ["fecha alta", "fecha de alta"],
  nombre: ["nombre"],
  apellidos: ["apellidos"],
  sexo: ["sexo"],
  telefono: ["telefono", "tlf", "movil"],
  documento: ["dni nie pasaporte", "dni nie", "dni"],
  cabeza_familia: ["cabeza de familia"],
  estado: ["activa baja bocatas", "activa baja", "estado"],
  pais: ["pais"],
  fecha_nacimiento: ["fecha nacimiento", "fecha de nacimiento"],
  email: ["email", "correo", "correo electronico"],
  direccion: ["direccion"],
  codigo_postal: ["codigo postal"],
  localidad: ["localidad", "municipio"],
  notas_informe_social: ["notas para informe social", "notas informe social"],
  nivel_estudios: ["nivel de estudios finalizados", "nivel de estudios", "nivel estudios"],
  situacion_laboral: ["situacion laboral"],
  otras_caracteristicas: ["otras caracteristicas"],
};

// Dice coefficient on character bigrams — the fuzzy tier's similarity score.
function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const A = grams(a);
  const B = grams(b);
  let overlap = 0;
  let total = 0;
  for (const [g, c] of A) {
    total += c;
    const d = B.get(g);
    if (d) overlap += Math.min(c, d);
  }
  for (const [, c] of B) total += c;
  return total === 0 ? 0 : (2 * overlap) / total;
}

// Lower tier = stronger match. 0 exact, 1 startswith, 2 token-subset, 3 fuzzy.
const FUZZY_THRESHOLD = 0.84;
const NO_MATCH = 99;

function matchTier(norm: string, aliases: string[]): { tier: number; score: number } {
  const tokens = new Set(norm.split(" "));
  let best = { tier: NO_MATCH, score: 0 };
  for (const alias of aliases) {
    let tier = NO_MATCH;
    if (norm === alias) tier = 0;
    else if (norm.startsWith(alias)) tier = 1;
    else if (alias.split(" ").every((t) => tokens.has(t))) tier = 2;
    else if (dice(norm, alias) >= FUZZY_THRESHOLD) tier = 3;
    if (tier === NO_MATCH) continue;
    const score = dice(norm, alias);
    if (tier < best.tier || (tier === best.tier && score > best.score)) {
      best = { tier, score };
    }
  }
  return best;
}

export type ColumnMap = Map<keyof LegacyRow, number>;

// Resolve each canonical key to its column index in this header. Position-
// agnostic: works on both the 19-column template and the 54-column real export.
// A column is assigned to at most one key (first/strongest wins) so the extra
// columns can never shadow a canonical field.
export function resolveColumnMap(headerFields: ReadonlyArray<string>): ColumnMap {
  const norm = headerFields.map((h, i) => ({ i, n: normalizeHeader(h) }));
  const used = new Set<number>();
  const map: ColumnMap = new Map();
  for (const key of Object.keys(ALIAS_TABLE) as (keyof LegacyRow)[]) {
    const aliases = ALIAS_TABLE[key];
    let bestIdx = -1;
    let bestTier = NO_MATCH;
    let bestScore = -1;
    for (const { i, n } of norm) {
      if (used.has(i) || !n) continue;
      const { tier, score } = matchTier(n, aliases);
      if (tier < bestTier || (tier === bestTier && score > bestScore)) {
        bestTier = tier;
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestTier <= 3) {
      map.set(key, bestIdx);
      used.add(bestIdx);
    }
  }
  return map;
}

// Keys whose absence means the file structure is unusable (cannot identify
// families or detect titulares). The router turns this into a clear 400.
export const REQUIRED_KEYS: ReadonlyArray<keyof LegacyRow> = [
  "numero_familia",
  "nombre",
  "apellidos",
  "cabeza_familia",
];

// Build a LegacyRow from one data record using the resolved column map.
// Values are mojibake-repaired (no-op on clean text) and kept only when
// non-blank; the value mappers in csvLegacyFamiliasMapper.ts trim + coerce.
export function fieldsToLegacyRow(
  fields: ReadonlyArray<string>,
  columnMap: ColumnMap
): LegacyRow {
  const row: LegacyRow = {};
  for (const [key, idx] of columnMap) {
    const raw = fields[idx];
    if (raw === undefined) continue;
    const repaired = repairMojibake(raw);
    if (repaired.trim() !== "") row[key] = repaired;
  }
  return row;
}
