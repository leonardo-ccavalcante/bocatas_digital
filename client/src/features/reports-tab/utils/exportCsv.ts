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

/**
 * Escape a single CSV cell per RFC 4180.
 * - If the value contains a comma, double-quote, or newline: wrap in double-quotes.
 * - Internal double-quotes are doubled.
 */
export function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Redact high-risk PII field names from a row object.
 * Returns a new object; the original is not mutated.
 */
export function redactRow(
  row: Record<string, unknown>,
  redactFields: string[],
): Record<string, unknown> {
  if (redactFields.length === 0) return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = redactFields.includes(k) ? "[REDACTED]" : v;
  }
  return out;
}

/**
 * Build a CSV string from an array of plain objects.
 * Column order is determined by the keys of the first row.
 */
export function buildCsvString(
  rows: Record<string, unknown>[],
  redactFields: string[] = [],
): string {
  if (rows.length === 0) return "";

  const redacted = rows.map((r) => redactRow(r, redactFields));
  const headers = Object.keys(redacted[0]);

  const headerLine = headers.map(escapeCsvCell).join(",");
  const dataLines = redacted.map((row) =>
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
