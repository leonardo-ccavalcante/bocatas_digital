// Weekday helpers for the reparto month picker. Spanish convention: the week
// starts on Monday. Pure and dependency-free (hardcoded labels, no Intl) so the
// calendar renders identically everywhere. Dates are `YYYY-MM-DD` strings built
// into a LOCAL Date from parts — never `new Date("YYYY-MM-DD")` — so there is no
// UTC midnight shift (the same class of bug the assignment engine warns about).

/** Monday-first short labels for the weekday header row. */
export const WEEKDAY_SHORT = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;
/** Monday-first long labels (lowercase; capitalize at the call site if needed). */
export const WEEKDAY_LONG = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
] as const;

/** 0 = Monday … 6 = Sunday for a `YYYY-MM-DD` date. */
export function weekdayIndexOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat, local time
  return (dow + 6) % 7; // shift so Monday = 0
}

/** Capitalized long weekday name, e.g. "Lunes". */
export function weekdayLongOf(dateStr: string): string {
  const name = WEEKDAY_LONG[weekdayIndexOf(dateStr)];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** All `YYYY-MM-DD` dates of a `YYYY-MM` month, in order. Empty for a blank input. */
export function daysInMonth(yearMonth: string): string[] {
  if (!yearMonth) return [];
  const [y, m] = yearMonth.split("-").map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => {
    const dd = String(i + 1).padStart(2, "0");
    return `${y}-${String(m).padStart(2, "0")}-${dd}`;
  });
}
