/**
 * authenticateRequest — identity and role come from `auth.users` (#144).
 *
 * These pin the contract the BR-1 fix establishes. Before it, the server read
 * role from `public.app_users` while the admin UI wrote only to
 * `auth.users.app_metadata`, so three things were broken at once:
 *
 *   1. a newly created staff user logged in with no permissions;
 *   2. `admin.revokeStaffAccess` did not revoke;
 *   3. `admin.setUserRole` did not apply.
 *
 * Case 2 is the one with teeth: revocation was broken precisely for users who
 * COULD log in — the ones whose privileges an admin most needs to withdraw.
 *
 * `authenticateRequest` had zero test coverage before this file. These are
 * written to fail on mutation, not merely to describe: verified that a
 * `?? "user"` role fallback, an anon key in place of the service-role key, and
 * a swap of updatedAt/lastSignedIn each turn this suite red.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

// Shared handle the module-level mock reads from, so each test can decide what
// `supabase.auth.getUser()` resolves to.
const getUser = vi.fn();
const createClient = vi.fn(() => ({ auth: { getUser } }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClient(...(args as [])),
}));

// The module snapshots SUPABASE_URL at import time — set it before importing.
process.env.SUPABASE_URL = "https://testref.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";

const { authenticateRequest } = await import("../_core/authenticateRequest");

const AUTH_UUID = "3f1c0a5e-2b7d-4c8a-9e10-5d6b7c8a9f01";

/** A request carrying a bearer token — the token value is irrelevant here
 *  because `auth.getUser` is mocked; what matters is that one is present. */
function req(): Request {
  return { headers: { authorization: "Bearer any-token" } } as unknown as Request;
}

/** Shape of the record Supabase returns from `auth.getUser()`. */
function authUser(over: Record<string, unknown> = {}) {
  return {
    id: AUTH_UUID,
    email: "voluntaria@bocatas.test",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
    last_sign_in_at: "2026-03-01T00:00:00.000Z",
    app_metadata: { role: "voluntario", provider: "email" },
    user_metadata: { nombre: "Voluntaria Prueba" },
    ...over,
  };
}

function resolveAs(user: unknown) {
  getUser.mockResolvedValue({ data: { user }, error: null });
}

beforeEach(() => {
  getUser.mockReset();
  createClient.mockClear();
});

describe("role is read from auth.users.app_metadata", () => {
  it("resolves the role the admin UI wrote", async () => {
    resolveAs(authUser({ app_metadata: { role: "admin" } }));

    const user = await authenticateRequest(req());

    expect(user?.role).toBe("admin");
  });

  it("re-reads the role on every call, holding no cache (admin.setUserRole)", async () => {
    // Honest scope: authenticateRequest is stateless, so today this cannot fail
    // — it is a guard against someone LATER adding a per-user cache. Caching is
    // what broke setUserRole and revokeStaffAccess in the first place; the
    // second store was just a cache nobody invalidated.
    resolveAs(authUser({ app_metadata: { role: "voluntario" } }));
    expect((await authenticateRequest(req()))?.role).toBe("voluntario");

    resolveAs(authUser({ app_metadata: { role: "admin" } }));
    expect((await authenticateRequest(req()))?.role).toBe("admin");
  });

  it("never falls back to Supabase's own `role`, which is the Postgres role", async () => {
    // authUser.role is "authenticated" for EVERY signed-in user. The discriminating
    // case is app_metadata carrying no role: a `?? authUser.role` (or `?? "user"`)
    // fallback would hand app access to anyone holding a valid token, and a
    // fixture that sets both roles would not notice.
    resolveAs(authUser({ role: "authenticated", app_metadata: {} }));

    expect(await authenticateRequest(req())).toBeNull();
  });

  it("prefers app_metadata.role when the Postgres role is also present", async () => {
    resolveAs(authUser({ role: "authenticated", app_metadata: { role: "voluntario" } }));

    expect((await authenticateRequest(req()))?.role).toBe("voluntario");
  });
});

describe("no usable role denies access", () => {
  it("denies after revokeStaffAccess sets app_metadata.role = null", async () => {
    // The exact write admin.revokeStaffAccess performs. This is the case that
    // was broken for every user who already had an app_users row.
    resolveAs(authUser({ app_metadata: { role: null } }));

    expect(await authenticateRequest(req())).toBeNull();
  });

  it("denies when app_metadata carries no role at all", async () => {
    // A self-registered GoTrue account never gets a role (TECH_DEBT S-06).
    resolveAs(authUser({ app_metadata: {} }));

    expect(await authenticateRequest(req())).toBeNull();
  });

  it("denies when app_metadata is missing entirely", async () => {
    resolveAs(authUser({ app_metadata: undefined }));

    expect(await authenticateRequest(req())).toBeNull();
  });

  it("denies an unrecognised role rather than trusting it", async () => {
    resolveAs(authUser({ app_metadata: { role: "superuser" } }));

    expect(await authenticateRequest(req())).toBeNull();
  });

  it("denies a non-string role", async () => {
    resolveAs(authUser({ app_metadata: { role: true } }));

    expect(await authenticateRequest(req())).toBeNull();
  });
});

describe("every role the app understands is accepted", () => {
  it.each(["user", "admin", "superadmin", "voluntario", "beneficiario"] as const)(
    "accepts %s",
    async (role) => {
      resolveAs(authUser({ app_metadata: { role } }));

      expect((await authenticateRequest(req()))?.role).toBe(role);
    }
  );
});

describe("identity is derived from the auth record", () => {
  it("uses the auth UUID for both id and openId", async () => {
    resolveAs(authUser());

    const user = await authenticateRequest(req());

    expect(user?.id).toBe(AUTH_UUID);
    // openId survives only for the `User` contract; Manus openIds are gone.
    expect(user?.openId).toBe(AUTH_UUID);
  });

  it("prefers user_metadata.nombre over name", async () => {
    // createStaffUser writes both; nombre is the Spanish-facing one.
    resolveAs(authUser({ user_metadata: { nombre: "Nombre", name: "Name" } }));

    expect((await authenticateRequest(req()))?.name).toBe("Nombre");
  });

  it("falls back to user_metadata.name for accounts created elsewhere", async () => {
    // Google OAuth / magic-link accounts carry only `name`.
    resolveAs(authUser({ user_metadata: { name: "Google Person" } }));

    expect((await authenticateRequest(req()))?.name).toBe("Google Person");
  });

  it("returns null name when metadata has neither, without throwing", async () => {
    resolveAs(authUser({ user_metadata: null }));

    const user = await authenticateRequest(req());

    expect(user).not.toBeNull();
    expect(user?.name).toBeNull();
  });

  it("treats a blank name as absent", async () => {
    resolveAs(authUser({ user_metadata: { nombre: "   " } }));

    expect((await authenticateRequest(req()))?.name).toBeNull();
  });

  it("carries email through, and null when absent", async () => {
    resolveAs(authUser());
    expect((await authenticateRequest(req()))?.email).toBe("voluntaria@bocatas.test");

    resolveAs(authUser({ email: undefined }));
    expect((await authenticateRequest(req()))?.email).toBeNull();
  });

  it("maps each timestamp to its own field, not to a neighbour's", async () => {
    // Without this, swapping updatedAt and lastSignedIn goes unnoticed: the
    // fallback test only exercises the case where both sources are null.
    resolveAs(authUser());

    const user = await authenticateRequest(req());

    expect(user?.createdAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(user?.updatedAt).toEqual(new Date("2026-02-01T00:00:00.000Z"));
    expect(user?.lastSignedIn).toEqual(new Date("2026-03-01T00:00:00.000Z"));
  });

  it("reports the auth provider as loginMethod", async () => {
    resolveAs(authUser({ app_metadata: { role: "admin", provider: "google" } }));
    expect((await authenticateRequest(req()))?.loginMethod).toBe("google");

    resolveAs(authUser({ app_metadata: { role: "admin" } }));
    expect((await authenticateRequest(req()))?.loginMethod).toBeNull();
  });

  it("falls back to created_at when the account has never signed in", async () => {
    resolveAs(authUser({ last_sign_in_at: null, updated_at: null }));

    const user = await authenticateRequest(req());

    expect(user?.lastSignedIn).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(user?.updatedAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("never yields an Invalid Date, whatever the timestamps look like", async () => {
    // Not a crash guard: superjson's isDate checks !isNaN(valueOf()), so an
    // Invalid Date skips the Date transformer and JSON-serialises to null. The
    // point is that `auth.me` would then ship createdAt: null for a field the
    // `User` type declares as Date.
    resolveAs(
      authUser({ created_at: undefined, updated_at: "not-a-date", last_sign_in_at: 12345 })
    );

    const user = await authenticateRequest(req());

    expect(user).not.toBeNull();
    for (const d of [user!.createdAt, user!.updatedAt, user!.lastSignedIn]) {
      expect(Number.isNaN(d.getTime())).toBe(false);
      expect(() => d.toISOString()).not.toThrow();
    }
  });

  it("trims and caps a name — user_metadata is self-writable and unbounded", async () => {
    // The account holder can set this via auth.updateUser with only the anon
    // key. It is persisted into autor_nombre / actor_name / derivation PDFs, so
    // it must not be an unbounded write. Identity lives in actor_id, not here.
    resolveAs(authUser({ user_metadata: { nombre: `  ${"A".repeat(500)}  ` } }));

    const name = (await authenticateRequest(req()))?.name;

    expect(name).toHaveLength(120);
    expect(name?.startsWith(" ")).toBe(false);
  });
});

describe("cookie parsing survives malformed input", () => {
  it("does not throw on a malformed percent-escape", async () => {
    // handleStorageProxy awaits authenticateRequest OUTSIDE its try/catch, and
    // Express 4 does not catch async rejections — so a URIError here hung the
    // request and raised an unhandledRejection. Anonymous, unrated-limited.
    resolveAs(authUser());

    await expect(
      authenticateRequest({ headers: { cookie: "junk=%ZZ" } } as unknown as Request)
    ).resolves.toBeNull();
  });

  it("still finds a valid session cookie alongside an undecodable one", async () => {
    resolveAs(authUser());
    const session = encodeURIComponent(JSON.stringify({ access_token: "good-token" }));

    const user = await authenticateRequest({
      headers: { cookie: `junk=%ZZ; sb-testref-auth-token=${session}` },
    } as unknown as Request);

    expect(user?.id).toBe(AUTH_UUID);
    expect(getUser).toHaveBeenCalledWith("good-token");
  });
});

describe("the token is verified against GoTrue with the service-role client", () => {
  it("builds the client with the service-role key, never the anon key", async () => {
    // Load-bearing: the fix's whole claim is that getUser() resolves the LIVE
    // auth.users row rather than decoding the caller's stale JWT claims. Swap
    // this key for the anon one and that guarantee quietly disappears, with
    // every behavioural assertion in this file still green.
    resolveAs(authUser());

    await authenticateRequest(req());

    expect(createClient).toHaveBeenCalledWith(
      "https://testref.supabase.co",
      "service-role-test-key",
      expect.anything()
    );
  });

  it("passes the caller's token to getUser rather than trusting the request", async () => {
    resolveAs(authUser());

    await authenticateRequest(req());

    expect(getUser).toHaveBeenCalledWith("any-token");
  });
});

describe("token handling is unchanged", () => {
  it("reads the token from the plain (non-chunked) ssr cookie", async () => {
    resolveAs(authUser());
    const session = encodeURIComponent(JSON.stringify({ access_token: "plain-token" }));

    const user = await authenticateRequest({
      headers: { cookie: `sb-testref-auth-token=${session}` },
    } as unknown as Request);

    expect(user?.id).toBe(AUTH_UUID);
    expect(getUser).toHaveBeenCalledWith("plain-token");
  });

  it("falls back to the legacy sb-access-token cookie", async () => {
    resolveAs(authUser());

    const user = await authenticateRequest({
      headers: { cookie: "sb-access-token=legacy-token" },
    } as unknown as Request);

    expect(user?.id).toBe(AUTH_UUID);
    expect(getUser).toHaveBeenCalledWith("legacy-token");
  });

  it("returns null with no token, without calling Supabase", async () => {
    const user = await authenticateRequest({ headers: {} } as unknown as Request);

    expect(user).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns null when the token does not verify", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });

    expect(await authenticateRequest(req())).toBeNull();
  });

  it("reads the token from the chunked @supabase/ssr cookie", async () => {
    resolveAs(authUser());
    const session = JSON.stringify({ access_token: "cookie-token" });
    const mid = Math.floor(session.length / 2);

    const user = await authenticateRequest({
      headers: {
        cookie:
          `sb-testref-auth-token.0=${encodeURIComponent(session.slice(0, mid))}; ` +
          `sb-testref-auth-token.1=${encodeURIComponent(session.slice(mid))}`,
      },
    } as unknown as Request);

    expect(user?.id).toBe(AUTH_UUID);
    expect(getUser).toHaveBeenCalledWith("cookie-token");
  });
});
