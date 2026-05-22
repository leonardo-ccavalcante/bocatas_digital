import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPostHogConfig, PH_BLOCK_CLASS } from "../config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildPostHogConfig", () => {
  it("targets the EU host and the identified-only profile model", () => {
    const cfg = buildPostHogConfig();
    expect(cfg.api_host).toBe("https://eu.i.posthog.com");
    expect(cfg.person_profiles).toBe("identified_only");
    expect(cfg.autocapture).toBe(false);
    expect(cfg.capture_pageview).toBe("history_change");
    expect(cfg.respect_dnt).toBe(true);
  });

  it("honours VITE_PUBLIC_POSTHOG_HOST when provided", () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_HOST", "https://eu-assets.i.posthog.com");
    expect(buildPostHogConfig().api_host).toBe(
      "https://eu-assets.i.posthog.com"
    );
  });

  it("ENABLES session replay (replay is a required feature)", () => {
    expect(buildPostHogConfig().disable_session_recording).toBe(false);
  });

  it("masks ALL rendered text globally", () => {
    expect(buildPostHogConfig().session_recording?.maskTextSelector).toBe("*");
  });

  it("masks ALL inputs and every input option", () => {
    const sr = buildPostHogConfig().session_recording!;
    expect(sr.maskAllInputs).toBe(true);
    const opts = sr.maskInputOptions as Record<string, boolean>;
    expect(Object.keys(opts).length).toBeGreaterThan(5);
    expect(Object.values(opts).every(v => v === true)).toBe(true);
  });

  it("blocks the ph-no-capture media/PII surface class", () => {
    const sr = buildPostHogConfig().session_recording!;
    expect(sr.blockSelector).toContain(PH_BLOCK_CLASS);
  });

  it("never records canvas or cross-origin iframes", () => {
    const sr = buildPostHogConfig().session_recording! as Record<
      string,
      unknown
    >;
    expect(sr.recordCanvas).toBe(false);
    expect(sr.recordCrossOriginIframes).toBe(false);
  });

  it("never captures network request/response bodies or headers", () => {
    const sr = buildPostHogConfig().session_recording! as Record<
      string,
      unknown
    >;
    expect(sr.recordBody).toBe(false);
    expect(sr.recordHeaders).toBe(false);
  });

  it("bounds replay volume with sampleRate and a minimum duration", () => {
    const sr = buildPostHogConfig().session_recording! as Record<
      string,
      unknown
    >;
    expect(typeof sr.sampleRate).toBe("number");
    expect(sr.sampleRate as number).toBeGreaterThan(0);
    expect(sr.sampleRate as number).toBeLessThanOrEqual(1);
    expect(sr.minimumDurationMilliseconds as number).toBeGreaterThanOrEqual(0);
  });

  it("wires the before_send PII scrubber", () => {
    expect(typeof buildPostHogConfig().before_send).toBe("function");
  });
});
