import type { CaptureResult } from "posthog-js";
import { URL_KEYS, keyIsPii, redactPii, sanitizeUrl } from "./pii";

/**
 * PostHog `before_send` hook. Runs on EVERY outgoing event (autocapture is off,
 * but pageviews + our explicit events still flow through). Last line of defence:
 * - drops properties whose key names PII,
 * - redacts email/phone/DNI/NIE embedded in free-text string values,
 * - strips query strings and id path segments from URL properties.
 *
 * Returning `null` drops the event entirely (PostHog's documented contract).
 */
export function beforeSend(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null;
  const props = event.properties as Record<string, unknown> | undefined;
  if (!props || typeof props !== "object") return event;

  for (const key of Object.keys(props)) {
    const value = props[key];
    // URL keys (e.g. $pathname) are sanitised, not dropped — checked first
    // because their names ($path*name*) would otherwise match the PII-key rule.
    if (URL_KEYS.has(key)) {
      if (typeof value === "string") props[key] = sanitizeUrl(value);
      continue;
    }
    if (keyIsPii(key)) {
      delete props[key];
      continue;
    }
    if (typeof value === "string") {
      props[key] = redactPii(value);
    }
  }
  return event;
}
