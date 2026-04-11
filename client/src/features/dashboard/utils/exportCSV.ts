/**
 * exportCSV.ts — Zero-PII CSV export utility.
 * Uses native Blob + URL.createObjectURL — no external library.
 *
 * Columns: fecha, hora, persona_uuid, punto_servicio, programa, metodo
 * Anonymous rows: persona_uuid = "anonimo"
 * Filename: bocatas_asistencias_YYYY-MM.csv
 */
import type { CSVRow } from "../schemas";

const CSV_HEADERS = ["fecha", "hora", "persona_uuid", "punto_servicio", "programa", "metodo"];

/**
 * Escape a CSV cell value — wraps in quotes if contains comma, newline, or quote.
 */
function escapeCell(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Build CSV string from rows array.
 */
export function buildCSVString(rows: CSVRow[]): string {
  const header = CSV_HEADERS.join(",");
  const lines = rows.map((row) =>
    [
      escapeCell(row.fecha),
      escapeCell(row.hora),
      escapeCell(row.persona_uuid),
      escapeCell(row.punto_servicio),
      escapeCell(row.programa),
      escapeCell(row.metodo),
    ].join(",")
  );
  return [header, ...lines].join("\n");
}

/**
 * Trigger browser download of CSV file.
 * Filename: bocatas_asistencias_YYYY-MM.csv (based on dateFrom)
 */
export function downloadCSV(rows: CSVRow[], dateFrom: string): void {
  const csvString = buildCSVString(rows);
  const blob = new Blob(["\uFEFF" + csvString], { type: "text/csv;charset=utf-8;" }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  // Filename: bocatas_asistencias_YYYY-MM.csv
  const monthPrefix = dateFrom.slice(0, 7); // "YYYY-MM"
  link.setAttribute("href", url);
  link.setAttribute("download", `bocatas_asistencias_${monthPrefix}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
