/**
 * csvSafe.ts — Single source of truth for safe CSV cell escaping.
 *
 * Two concerns, in order:
 *
 * 1. CSV formula / DDE injection (CAS-01 / THE-02). Attacker-controllable
 *    free-text (family / member names, persona_recoge, GUF-imported fields)
 *    flows into export cells. A cell whose STRING value begins with a formula
 *    trigger (`= + - @` / TAB / CR) is interpreted by Excel / Google Sheets /
 *    LibreOffice as a formula or DDE command. We neutralize it by prefixing a
 *    single quote (`'`) so the spreadsheet renders it as literal text.
 *
 *    The `typeof value === "string"` guard is load-bearing: a numeric `-5`
 *    must serialize as `-5`, never `'-5`. Only strings are formula-risky.
 *
 * 2. RFC 4180 quoting. If the (possibly prefixed) value contains a comma,
 *    double-quote, LF, or CR, wrap it in double-quotes and double any internal
 *    double-quotes. A formula-prefixed cell is always quoted (the leading `'`
 *    plus a force-quote keeps the apostrophe inside the cell, matching the
 *    client's behavior).
 */

// Leading characters that trigger formula / DDE evaluation in spreadsheets.
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

/**
 * Escape a single CSV cell. Neutralizes formula injection on strings, then
 * applies RFC 4180 quoting. Non-string values pass through the formula guard
 * untouched (so `-5` stays `-5`). `null` / `undefined` become an empty string.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  let str = String(value);
  let forceQuote = false;

  if (typeof value === "string" && FORMULA_TRIGGERS.test(str)) {
    str = `'${str}`;
    forceQuote = true;
  }

  const needsQuotes =
    forceQuote ||
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r");

  if (needsQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Inverse of escapeCsvField's formula-injection guard. Strips a single leading
 * `'` sentinel ONLY when it directly precedes a formula trigger — i.e. the exact
 * marker escapeCsvField prepended — so a value this module exported (e.g. a phone
 * `'+34-600-...`) re-imports losslessly. A `'` not followed by a trigger is never
 * a sentinel we wrote, so genuine data like `'hola` is left untouched. RFC-4180
 * quotes are already stripped by the CSV row parser before this runs.
 */
export function unescapeCsvField(value: string): string {
  return value.replace(/^'(?=[=+\-@\t\r])/, "");
}
