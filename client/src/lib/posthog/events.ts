import { keyIsPii, valueHasPii } from "./pii";

/**
 * Roles that authenticate into the staff app. Beneficiaries never log in
 * (they are QR check-ins), so only these may be identified in PostHog.
 */
export const STAFF_ROLES = new Set<string>(["admin", "voluntario", "superadmin"]);

/**
 * The complete, closed set of events we emit. Autocapture is OFF — every event
 * is explicit and its props are constrained to IDs / counts / enums (no PII).
 */
export type KnownEvents = {
  checkin_completed: { method: "qr" | "manual" | "anonymous" };
  person_registered: Record<string, never>;
  document_uploaded: { type: string };
};

export type KnownEvent = keyof KnownEvents;

/** Allowed property value shapes — primitives only, never objects/arrays. */
export type PiiFreeProps = Record<string, string | number | boolean | undefined>;

/**
 * Runtime guard: throws if a property key names PII or a string value matches
 * a PII pattern. Defence-in-depth alongside the typed `KnownEvents` map and the
 * `before_send` scrubber.
 */
export function assertPiiFree(props?: PiiFreeProps): void {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (keyIsPii(key)) {
      throw new Error(`PostHog: refusing PII-shaped property key "${key}"`);
    }
    if (typeof value === "string" && valueHasPii(value)) {
      throw new Error(
        `PostHog: refusing property "${key}" — value matches a PII pattern`
      );
    }
  }
}
