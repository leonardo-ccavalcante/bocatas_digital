import type {
  BeforeSendFn,
  ConfigDefaults,
  MaskInputOptions,
  PostHogConfig,
  SessionRecordingOptions,
} from "posthog-js";
import { beforeSend } from "./scrubber";

/**
 * rrweb block class. Any element carrying this class is fully excluded from
 * the session replay DOM (not just text-masked). Applied to every component
 * that renders documents, photos, QR codes or high-risk fields.
 */
export const PH_BLOCK_CLASS = "ph-no-capture";

const EU_HOST = "https://eu.i.posthog.com";

/** Every input type masked — beneficiary data is typed into staff forms. */
const ALL_INPUTS_MASKED: MaskInputOptions = {
  color: true,
  date: true,
  "datetime-local": true,
  email: true,
  month: true,
  number: true,
  range: true,
  search: true,
  tel: true,
  text: true,
  time: true,
  url: true,
  week: true,
  textarea: true,
  select: true,
  password: true,
};

// `recordCanvas` / `minimumDurationMilliseconds` are valid rrweb runtime options
// not present in the published SessionRecordingOptions type — extend locally.
type ReplayOptions = Partial<SessionRecordingOptions> & {
  recordCanvas?: boolean;
  minimumDurationMilliseconds?: number;
};

/**
 * The single source of truth for PostHog init config.
 *
 * Session replay is ENABLED but maximally masked: all text masked, all inputs
 * masked, all media/PII surfaces (`.ph-no-capture`) blocked, no canvas, no
 * cross-origin iframes, and NO network request/response body or header capture
 * (API payloads carry PII). EU residency. Autocapture off. Identified-only.
 */
export function buildPostHogConfig(): Partial<PostHogConfig> {
  const apiHost =
    (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined)?.trim() ||
    EU_HOST;

  const session_recording: ReplayOptions = {
    maskAllInputs: true,
    maskInputOptions: ALL_INPUTS_MASKED,
    maskTextSelector: "*",
    blockClass: PH_BLOCK_CLASS,
    blockSelector: `.${PH_BLOCK_CLASS}`,
    recordCanvas: false,
    recordCrossOriginIframes: false,
    recordBody: false,
    recordHeaders: false,
    // Volume + low-end-Android CPU bound. Masking (not sampling) protects PII.
    // Reduced from 1 → 0.1 to lower main-thread GZIP overhead during heavy list interactions.
    sampleRate: 0.1,
    minimumDurationMilliseconds: 2000,
  };

  return {
    api_host: apiHost,
    defaults: "2026-01-30" as ConfigDefaults,
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: "history_change",
    capture_pageleave: true,
    disable_session_recording: false,
    respect_dnt: true,
    before_send: beforeSend as BeforeSendFn,
    session_recording: session_recording as SessionRecordingOptions,
  };
}
