import { describe, expect, it, vi } from "vitest";

// AuthCallback imports the Supabase client, which throws at module load when the
// Vite env vars are absent (as in the test runner). getSafeNext is pure, so stub
// the client to let the import resolve.
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: {} }) }));

import { getSafeNext } from "../AuthCallback";

/**
 * The server used to sanitise the post-login `next` redirect (open-redirect
 * protection). That sanitisation moved to the client with the PKCE callback fix,
 * so it must keep the same guarantees.
 */
describe("AuthCallback.getSafeNext — open-redirect protection", () => {
  it("allows internal absolute paths", () => {
    expect(getSafeNext("/")).toBe("/");
    expect(getSafeNext("/dashboard")).toBe("/dashboard");
    expect(getSafeNext("/personas/123")).toBe("/personas/123");
  });

  it("falls back to / for anything that could redirect off-site", () => {
    expect(getSafeNext(null)).toBe("/");
    expect(getSafeNext("https://attacker.example")).toBe("/");
    expect(getSafeNext("//attacker.example")).toBe("/");
    expect(getSafeNext("/\\attacker.example")).toBe("/");
    expect(getSafeNext("javascript:alert(1)")).toBe("/");
  });
});
