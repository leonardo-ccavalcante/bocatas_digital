/**
 * Age computation for family-member doc requirements.
 *
 * Calendar-aware: a member with DOB exactly N years ago today returns N
 * (not N-1, which the naive ageMs / (365.25 days) approach gave us).
 *
 * Returns null when DOB is unknown or unparseable. Callers treat null
 * as "adult" (inclusive — better to show the doc requirement than hide it).
 */
export function ageInYears(
  fecha_nacimiento?: string | null,
  today: Date = new Date(),
): number | null {
  if (!fecha_nacimiento) return null;
  const dob = new Date(fecha_nacimiento);
  if (isNaN(dob.getTime())) return null;
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/** Adult-or-unknown: ≥14 years old, OR DOB missing/unparseable. */
export function isAdultOrUnknown(
  fecha_nacimiento?: string | null,
  today: Date = new Date(),
): boolean {
  const age = ageInYears(fecha_nacimiento, today);
  return age === null || age >= 14;
}
