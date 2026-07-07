import { madridDistritoFor } from "./postalCodeToDistrito";

/**
 * True when a family lives OUTSIDE the municipality of Madrid, derived from its
 * postal code: a valid 5-digit code that maps to no Madrid-city distrito
 * (`madridDistritoFor` returns null). An empty or malformed code is treated as
 * "unknown" → false; those families are handled by the operator's manual
 * fuera-de-Madrid count (the hybrid). Pure — mirrors the SQL `madrid_distrito_for`.
 */
export function esFueraDeMadrid(codigoPostal: string | null | undefined): boolean {
  if (!codigoPostal || !/^\d{5}$/.test(codigoPostal)) return false;
  return madridDistritoFor(codigoPostal) === null;
}
