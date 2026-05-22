import type { PostHog } from "posthog-js";
import { buildPostHogConfig } from "./config";
import {
  type KnownEvent,
  type KnownEvents,
  type PiiFreeProps,
  STAFF_ROLES,
  assertPiiFree,
} from "./events";

let client: PostHog | null = null;

/**
 * The EIPD gate. When `VITE_PUBLIC_POSTHOG_KEY` is unset (CI, and prod until the
 * session-replay EIPD addendum is signed), this returns undefined and PostHog is
 * never loaded — zero bundle/runtime cost.
 */
export function getPostHogKey(): string | undefined {
  const raw = (
    import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined
  )?.trim();
  return raw ? raw : undefined;
}

export function isPostHogActive(): boolean {
  return client !== null;
}

/**
 * Lazily import + initialise posthog-js, gated on the key. The dynamic import
 * means the chunk is only fetched when a key exists, so CI (key unset) never
 * loads it and Lighthouse is unaffected.
 */
export async function initPostHog(): Promise<boolean> {
  if (client) return true;
  const key = getPostHogKey();
  if (!key) return false;
  if (typeof window === "undefined") return false;

  const { default: posthog } = await import("posthog-js");
  posthog.init(key, buildPostHogConfig());
  client = posthog;
  return true;
}

/** Typed, PII-free event capture. No-op until initialised. */
export function capture<E extends KnownEvent>(
  event: E,
  props?: KnownEvents[E]
): void {
  assertPiiFree(props as PiiFreeProps | undefined);
  if (!client) return;
  client.capture(event, props);
}

/** Identify a STAFF user by id + role only. Never name/email, never beneficiaries. */
export function identifyStaff(id: string, role: string): void {
  if (!client) return;
  if (!STAFF_ROLES.has(role)) return;
  client.identify(id, { role });
}

/** Clear the identified user (on logout). */
export function resetPostHog(): void {
  if (!client) return;
  client.reset();
}

/** Honour an explicit opt-out request. */
export function optOutCapturing(): void {
  if (!client) return;
  client.opt_out_capturing();
}
