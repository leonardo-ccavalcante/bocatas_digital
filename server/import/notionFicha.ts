/**
 * notionFicha.ts — pure parser for Notion person-ficha exports (.md).
 *
 * The real export is UTF-8 double-encoded (UTF-8 bytes re-read as latin1),
 * producing mojibake like "Ã³" for "ó" and "ð..." for emoji. Keys may carry
 * emoji prefixes and trailing spaces before the colon. This module repairs
 * the encoding and normalizes keys; it performs NO mapping and NO I/O.
 */

export interface Ficha {
  /** Page title from the leading `# ` heading (usually "Apellidos, Nombre"). */
  titulo: string;
  nombre: string;
  apellidos: string;
  tipoDoc: string;
  numeroDoc: string;
  /** All key/value lines: keys normalized (encoding repaired, emoji stripped,
   * trimmed, inner spaces collapsed), values repaired + trimmed. */
  campos: Record<string, string>;
  /** Tokens from "Cursos de formación" (URL suffixes stripped). */
  cursoTokens: string[];
  /** Tokens from "Talleres" (URL suffixes stripped). */
  tallerTokens: string[];
}

/** Signature of double-encoded UTF-8: "Ã" + continuation, or a mangled emoji lead byte. */
const MOJIBAKE_SIGNATURE = /Ã.|ð/;

/**
 * Repairs UTF-8 text that was double-encoded through latin1.
 * Detection runs on the WHOLE text: double-encoding is uniform per file, and
 * some corrupted lines (e.g. "NÂº DOC") carry no "Ã"/"ð" marker themselves.
 * If the round-trip produces replacement characters the input was not actually
 * double-encoded, so the original is returned untouched.
 */
export function repairMojibake(text: string): string {
  if (!MOJIBAKE_SIGNATURE.test(text)) return text;
  const repaired = Buffer.from(text, "latin1").toString("utf8");
  if (repaired.includes("�") && !text.includes("�")) return text;
  return repaired;
}

/** Strip emoji/symbol prefixes, trim, collapse inner whitespace runs. */
function normalizeKey(rawKey: string): string {
  return rawKey
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Splits a "Token (url), Token (url)" field value into bare tokens.
 * Commas inside parentheses (Notion URLs) do not split.
 */
function splitTokens(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(/,(?![^(]*\))/)
    .map((part) => part.replace(/\s*\(https?:\/\/[^)]*\)\s*$/, "").trim())
    .filter((token) => token.length > 0);
}

/** Parses one repaired line into a [key, value] pair, or null if not a field line. */
function parseFieldLine(line: string): [string, string] | null {
  if (line.startsWith("#") || !line.includes(":")) return null;
  const match = /^([^:]+):\s*(.*)$/.exec(line);
  if (!match) return null;
  const key = normalizeKey(match[1]);
  if (!key || /https?/.test(key)) return null;
  return [key, match[2].trim()];
}

const CURSOS_KEY = "Cursos de formación";
const TALLERES_KEY = "Talleres";

/**
 * Parses one Notion ficha markdown export into a structured Ficha.
 * Pure function: no filesystem, no network, no guessing — unknown lines are
 * simply ignored, unknown keys are preserved verbatim in `campos`.
 */
export function parseFicha(markdown: string): Ficha {
  const text = repairMojibake(markdown);
  const campos: Record<string, string> = {};
  let titulo = "";

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!titulo && line.startsWith("# ")) {
      titulo = line.slice(2).trim();
      continue;
    }
    const field = parseFieldLine(line);
    if (field) campos[field[0]] = field[1];
  }

  return {
    titulo,
    nombre: campos["Nombre"] ?? "",
    apellidos: campos["Apellidos"] ?? "",
    tipoDoc: campos["Tipo DOC"] ?? "",
    numeroDoc: campos["Nº DOC"] ?? "",
    campos,
    cursoTokens: splitTokens(campos[CURSOS_KEY] ?? ""),
    tallerTokens: splitTokens(campos[TALLERES_KEY] ?? ""),
  };
}
