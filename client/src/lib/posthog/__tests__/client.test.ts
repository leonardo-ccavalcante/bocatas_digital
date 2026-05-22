// @vitest-environment jsdom
// initPostHog has an SSR guard (`typeof window === "undefined"`); the real
// runtime is the browser, so exercise it in jsdom rather than node.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initMock = vi.fn();
const captureMock = vi.fn();
const identifyMock = vi.fn();
const resetMock = vi.fn();
const optOutMock = vi.fn();

vi.mock("posthog-js", () => ({
  default: {
    init: initMock,
    capture: captureMock,
    identify: identifyMock,
    reset: resetMock,
    opt_out_capturing: optOutMock,
  },
}));

async function freshClient() {
  vi.resetModules();
  return import("../client");
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPostHogKey", () => {
  it("returns undefined when the env var is unset/empty", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "");
    const { getPostHogKey } = await freshClient();
    expect(getPostHogKey()).toBeUndefined();
  });

  it("trims and returns the configured key", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "  phc_abc  ");
    const { getPostHogKey } = await freshClient();
    expect(getPostHogKey()).toBe("phc_abc");
  });
});

describe("initPostHog gating", () => {
  it("is a complete no-op when the key is unset (never loads posthog)", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "");
    const { initPostHog, isPostHogActive } = await freshClient();
    const started = await initPostHog();
    expect(started).toBe(false);
    expect(initMock).not.toHaveBeenCalled();
    expect(isPostHogActive()).toBe(false);
  });

  it("initialises posthog with the masked config when the key is set", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "phc_live");
    const { initPostHog, isPostHogActive } = await freshClient();
    const started = await initPostHog();
    expect(started).toBe(true);
    expect(initMock).toHaveBeenCalledTimes(1);
    const [key, cfg] = initMock.mock.calls[0];
    expect(key).toBe("phc_live");
    expect(cfg).toMatchObject({
      autocapture: false,
      disable_session_recording: false,
      person_profiles: "identified_only",
    });
    expect(isPostHogActive()).toBe(true);
  });
});

describe("capture", () => {
  it("is a no-op before init", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "");
    const { capture } = await freshClient();
    capture("checkin_completed", { method: "qr" });
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("forwards a PII-free event after init", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "phc_live");
    const ph = await freshClient();
    await ph.initPostHog();
    ph.capture("checkin_completed", { method: "qr" });
    expect(captureMock).toHaveBeenCalledWith("checkin_completed", {
      method: "qr",
    });
  });

  it("throws and never forwards an event with PII props", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "phc_live");
    const ph = await freshClient();
    await ph.initPostHog();
    expect(() =>
      // @ts-expect-error — email is not a PII-free prop on this event
      ph.capture("person_registered", { email: "jane@example.com" })
    ).toThrow();
    expect(captureMock).not.toHaveBeenCalled();
  });
});

describe("identify / reset / opt-out", () => {
  it("identifies staff with id + role only (no name/email)", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "phc_live");
    const ph = await freshClient();
    await ph.initPostHog();
    ph.identifyStaff("42", "admin");
    expect(identifyMock).toHaveBeenCalledWith("42", { role: "admin" });
  });

  it("resets on logout", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "phc_live");
    const ph = await freshClient();
    await ph.initPostHog();
    ph.resetPostHog();
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("identify/reset/opt-out are safe no-ops before init", async () => {
    vi.stubEnv("VITE_PUBLIC_POSTHOG_KEY", "");
    const ph = await freshClient();
    expect(() => ph.identifyStaff("1", "admin")).not.toThrow();
    expect(() => ph.resetPostHog()).not.toThrow();
    expect(() => ph.optOutCapturing()).not.toThrow();
    expect(identifyMock).not.toHaveBeenCalled();
  });
});
