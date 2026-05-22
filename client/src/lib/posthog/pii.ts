/**
 * Shared PII detection/redaction primitives for the PostHog boundary.
 *
 * These mirror the server-side `redactHighRiskFields` intent on the client:
 * never let a beneficiary's email / phone / DNI / NIE / name reach PostHog,
 * whether as an event property KEY, a free-text VALUE, or a URL path segment.
 *
 * Patterns are deliberately conservative (over-redact rather than leak).
 */

/** Property KEYS that, by name alone, almost certainly carry PII. */
const PII_KEY_RE =
  /(e[-_]?mail|mail|phone|tel|telefono|m[oó]vil|celular|whatsapp|dni|nie|nif|pasaporte|passport|nombre|apellido|name|direccion|address|nacimiento|birth|situacion_legal|recorrido_migratorio)/i;

// Non-global literals: safe to `.test()` repeatedly (no lastIndex state).
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const NIE = /\b[XYZ]\d{7}[A-Z]\b/i;
const DNI = /\b\d{8}[A-Z]\b/i;
// Spanish mobile/landline, optional +34 prefix, optional spacing/dashes.
const PHONE = /(?:\+?34[\s-]?)?[6-9]\d{2}[\s-]?\d{2,3}[\s-]?\d{3}\b/;

/** True when the property name itself denotes PII. */
export function keyIsPii(key: string): boolean {
  return PII_KEY_RE.test(key);
}

/** True when a string value contains an email, phone, DNI or NIE. */
export function valueHasPii(value: string): boolean {
  return EMAIL.test(value) || NIE.test(value) || DNI.test(value) || PHONE.test(value);
}

/** Replace any embedded email/phone/DNI/NIE in free text with a marker. */
export function redactPii(value: string): string {
  return value
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[redacted]")
    .replace(/\b[XYZ]\d{7}[A-Z]\b/gi, "[redacted]")
    .replace(/\b\d{8}[A-Z]\b/gi, "[redacted]")
    .replace(/(?:\+?34[\s-]?)?[6-9]\d{2}[\s-]?\d{2,3}[\s-]?\d{3}\b/g, "[redacted]");
}

/** Property keys whose values are URLs and must be path-sanitised. */
export const URL_KEYS = new Set([
  "$current_url",
  "$pathname",
  "$referrer",
  "$initial_current_url",
  "$initial_pathname",
  "$initial_referrer",
]);

function isIdSegment(seg: string): boolean {
  if (!/\d/.test(seg)) return false;
  return /^\d+$/.test(seg) || seg.includes("-") || /^[0-9a-f]{8,}$/i.test(seg);
}

/**
 * Drop query string + hash and replace id-like path segments (UUIDs, numeric
 * ids, hashes) with `:id` so URLs can't carry a person/family identifier.
 */
export function sanitizeUrl(raw: string): string {
  const base = raw.split(/[?#]/)[0];
  const match = base.match(/^([a-z]+:\/\/[^/]+)(\/.*)?$/i);
  const origin = match ? match[1] : "";
  const path = match ? match[2] ?? "" : base;
  const cleaned = path
    .split("/")
    .map(seg => (isIdSegment(seg) ? ":id" : seg))
    .join("/");
  return origin + cleaned;
}
