/**
 * Converts a program name to a URL-safe slug.
 * Rules: lowercase, spaces → underscores, remove accents, remove non-alphanumeric.
 * Example: "Atención Jurídica" → "atencion_juridica"
 */
export function slugFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")           // spaces → underscores
    .replace(/[^a-z0-9_]/g, "")     // remove non-alphanumeric
    .replace(/_+/g, "_")            // collapse multiple underscores
    .replace(/^_|_$/g, "");         // trim leading/trailing underscores
}
