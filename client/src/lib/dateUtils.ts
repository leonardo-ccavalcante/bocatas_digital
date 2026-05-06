/**
 * dateUtils.ts — Date formatting utilities for Bocatas Digital.
 *
 * PostgreSQL stores dates as ISO 8601 (YYYY-MM-DD).
 * The UI displays dates in Spanish format (DD/MM/YYYY).
 *
 * Rules:
 * - DB ↔ API: always YYYY-MM-DD (ISO 8601)
 * - Display: always DD/MM/YYYY (Spanish locale)
 * - HTML input[type=date]: always YYYY-MM-DD (browser standard)
 *
 * NEVER send DD/MM/YYYY to the database — PostgreSQL will reject it.
 */

/**
 * Format an ISO date string (YYYY-MM-DD) for display as DD/MM/YYYY.
 * Returns undefined if the input is null, undefined, or empty.
 *
 * @example
 * formatDateDisplay("1985-03-15") // → "15/03/1985"
 * formatDateDisplay(null)         // → undefined
 */
export function formatDateDisplay(isoDate: string | null | undefined): string | undefined {
  if (!isoDate) return undefined;
  // Handle both "YYYY-MM-DD" and ISO datetime strings "YYYY-MM-DDTHH:mm:ssZ"
  const datePart = isoDate.split("T")[0];
  if (!datePart) return undefined;
  const parts = datePart.split("-");
  if (parts.length !== 3) return isoDate; // fallback: return as-is
  const [year, month, day] = parts;
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

/**
 * Calculate age from an ISO date string (YYYY-MM-DD).
 * Returns undefined if the date is invalid.
 *
 * @example
 * calculateAge("1985-03-15") // → 40 (in 2025)
 */
export function calculateAge(isoDate: string | null | undefined): number | undefined {
  if (!isoDate) return undefined;
  const birth = new Date(isoDate);
  if (isNaN(birth.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
