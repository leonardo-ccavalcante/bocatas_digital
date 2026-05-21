/**
 * paisLabel.ts — Human-readable country name from an ISO-3166-1 alpha-2 code.
 *
 * Real `pais_origen` values from the DB are uppercase ISO-2 codes (ES, MA, SN…).
 * After normalizeCountryKey they become lowercase ("es", "ma", "sn") or
 * "no_indicado" for unknown/null values.
 *
 * The Intl.DisplayNames instance is constructed once at module scope (not per call)
 * to avoid repeated allocation overhead.
 */

const displayNames: Intl.DisplayNames | null = (() => {
  try {
    return new Intl.DisplayNames(["es"], { type: "region" });
  } catch {
    return null;
  }
})();

/**
 * Returns a human-readable Spanish country name for a normalised pais key.
 *
 * - "no_indicado" → "No indicado"
 * - Otherwise: treats `key` as an ISO-2 code and resolves via Intl.DisplayNames.
 *   On error or unknown code falls back to `key.toUpperCase()`.
 */
export function paisLabel(key: string): string {
  if (key === "no_indicado") return "No indicado";
  const code = key.toUpperCase();
  if (displayNames !== null) {
    try {
      const name = displayNames.of(code);
      if (name !== undefined && name !== code) return name;
    } catch {
      // fall through to uppercase fallback
    }
  }
  return code;
}
