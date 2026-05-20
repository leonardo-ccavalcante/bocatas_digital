/**
 * utils/exportCsv.ts — Generic CSV export with BOM, CRLF, and PII redaction.
 *
 * Compliance (CLAUDE.md §3): callers that touch persons data MUST pass
 *   redactFields: ['situacion_legal', 'foto_documento_url', 'recorrido_migratorio']
 * The redaction happens BEFORE any bytes hit the Blob — defense in depth.
 *
 * Format:
 *   - UTF-8 BOM prefix (U+FEFF) — Excel recognises ñ/á correctly
 *   - CRLF line endings — Windows-compatible
 *   - RFC 4180 cell escaping: wrap in " if contains , " or \n; double internal "
 */

export interface ExportCsvOptions {
  filename: string;
  /**
   * Fields to strip from each row BEFORE serialisation.
   * For any report that includes persons data, always pass:
   *   ['situacion_legal', 'foto_documento_url', 'recorrido_migratorio']
   */
  redactFields?: string[];
}

// Leading characters that trigger formula evaluation in Excel/Sheets/LibreOffice.
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

/**
 * Escape a single CSV cell per RFC 4180, with CSV/formula-injection defense.
 * - C-03: a STRING value starting with a formula trigger (`= + - @` / tab / CR)
 *   is prefixed with `'` so spreadsheets treat it as text, not a formula.
 *   Non-string values (numbers, booleans) are never prefixed — so legitimate
 *   negative numbers like -5 are preserved.
 * - RFC 4180: if the (possibly prefixed) value contains a comma, double-quote,
 *   or newline, wrap in double-quotes; internal double-quotes are doubled.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && FORMULA_TRIGGERS.test(s)) {
    s = `'${s}`;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Flatten a row's nested plain objects into dotted keys
 * (`{persons:{nombre}}` → `{"persons.nombre"}`). C-04: without this, nested
 * objects serialize to "[object Object]" in CSV AND escape PII redaction
 * (which keys off field names). Arrays, Dates, null, and primitives stay as
 * leaf values.
 */
export function flattenRow(
  row: Record<string, unknown>,
  prefix = "",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !(v instanceof Date)
    ) {
      Object.assign(out, flattenRow(v as Record<string, unknown>, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

/**
 * Redact PII field names from a (possibly flattened) row. Matches on either the
 * full key OR its leaf segment after the last dot, so a high-risk field is
 * redacted at any nesting depth (`persons.situacion_legal` ≡ `situacion_legal`).
 * Returns a new object; the original is not mutated.
 */
export function redactRow(
  row: Record<string, unknown>,
  redactFields: string[],
): Record<string, unknown> {
  if (redactFields.length === 0) return row;
  const banned = new Set(redactFields);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const leaf = k.includes(".") ? k.slice(k.lastIndexOf(".") + 1) : k;
    out[k] = banned.has(k) || banned.has(leaf) ? "[REDACTED]" : v;
  }
  return out;
}

/**
 * Build a CSV string from an array of plain objects. Nested objects are
 * flattened first; columns are the union of all flattened keys (so ragged
 * rows don't silently drop columns). Redaction is applied to the flattened
 * leaf keys.
 */
export function buildCsvString(
  rows: Record<string, unknown>[],
  redactFields: string[] = [],
): string {
  if (rows.length === 0) return "";

  const processed = rows.map((r) => redactRow(flattenRow(r), redactFields));
  const headers = [...new Set(processed.flatMap((r) => Object.keys(r)))];

  const headerLine = headers.map(escapeCsvCell).join(",");
  const dataLines = processed.map((row) =>
    headers.map((h) => escapeCsvCell(row[h])).join(","),
  );

  // CRLF per RFC 4180 + Windows compat
  return [headerLine, ...dataLines].join("\r\n");
}

/**
 * Trigger a browser CSV download.
 *
 * @param rows   Array of plain objects — keys become column headers.
 * @param opts   filename (without .csv extension is fine; we do not append it),
 *               and optional redactFields for PII stripping.
 */
export function exportRowsAsCsv(
  rows: Record<string, unknown>[],
  opts: ExportCsvOptions,
): void {
  const csv = buildCsvString(rows, opts.redactFields ?? []);
  // UTF-8 BOM — makes Excel open the file with the correct encoding
  const bom = "﻿";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
