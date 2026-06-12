/**
 * postgrestFilter.test.ts — unit (string-shape) tests for the CAS-04 fix.
 *
 * NOTE: these are STRING-SHAPE assertions only. They are false-green at the
 * transport layer (they cannot prove what PostgREST actually matches). The
 * authoritative proof lives in the REAL integration test:
 *   server/__tests__/postgrest-ilike-escaping.integration.test.ts
 * which runs the helpers against a live PostgREST. Keep both.
 *
 * Two helpers, one per context (empirically required — see postgrestFilter.ts):
 *   ilikeForOr(v) → quoted, double-backslash token for `.or(...)` filter lists.
 *   ilikeValue(v) → unquoted, single-backslash value for `.ilike(col, value)`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ilikeForOr, ilikeValue } from "../postgrestFilter";

describe("ilikeForOr — .or() filter-list token", () => {
  it("is double-quoted so .or() breakout chars , ( ) cannot escape the list", () => {
    const out = ilikeForOr("a,b)");
    expect(out.startsWith('"')).toBe(true);
    expect(out.endsWith('"')).toBe(true);
    // The breakout sequence sits INSIDE the quoted literal, not as bare delimiters.
    expect(out).toBe('"%a,b)%"');
  });

  it("double-backslash-escapes % and _ (survives PostgREST's quoted-value parser)", () => {
    const out = ilikeForOr("100%_x");
    // On the wire the quoted-value parser consumes one backslash layer, so the
    // helper emits \\% / \\_ to deliver a literal \% / \_ to LIKE.
    expect(out).toBe('"%100\\\\%\\\\_x%"');
    // No bare, unescaped % or _ from the user value survives.
    expect(out).not.toMatch(/(?<![\\])%x/);
  });

  it("backslash-escapes an embedded double quote (PostgREST consumes one \\ → literal \"); doubling early-closes the token — verified vs live PostgREST", () => {
    expect(ilikeForOr('a"b')).toBe('"%a\\"b%"');
  });

  it("strips * (PostgREST aliases it to %; no transport-safe escape exists)", () => {
    expect(ilikeForOr("a*b")).toBe('"%ab%"');
  });

  it("a normal name produces a quoted substring token", () => {
    expect(ilikeForOr("García")).toBe('"%García%"');
  });
});

describe("ilikeValue — positional .ilike(col, value)", () => {
  it("is NOT quoted (supabase-js encodes it; a literal \" would match nothing)", () => {
    const out = ilikeValue("García");
    expect(out.startsWith('"')).toBe(false);
    expect(out).toBe("%García%");
  });

  it("single-backslash-escapes % and _ (value reaches LIKE directly)", () => {
    expect(ilikeValue("100%_x")).toBe("%100\\%\\_x%");
  });

  it("strips * (alias to %, not escapable)", () => {
    expect(ilikeValue("a*b")).toBe("%ab%");
  });

  it("wraps with literal % wildcards on both ends for substring search", () => {
    const out = ilikeValue("Juan");
    expect(out.startsWith("%")).toBe(true);
    expect(out.endsWith("%")).toBe(true);
  });
});

// ── Router-site test: persons.search must escape before .or() ────────────────

const orCalls: string[] = [];

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        or: (filters: string) => {
          orCalls.push(filters);
          return {
            is: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          };
        },
      }),
    }),
  }),
}));

// Imported AFTER the mock so the router picks up the mocked client.
import { appRouter } from "../../routers";
import type { TrpcContext } from "../context";
import { Logger } from "../logger";

function authCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-open-id",
      email: "test@bocatas.org",
      name: "Test User",
      loginMethod: "manus",
      role: "voluntario",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    logger: new Logger(),
    correlationId: "test-correlation-id",
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("persons.search — escapes user input before PostgREST .or()", () => {
  beforeEach(() => {
    orCalls.length = 0;
  });

  it("injection payload `a,b)` cannot break out of the .or() filter list", async () => {
    const caller = appRouter.createCaller(authCtx());
    await caller.persons.search({ query: "a,b)" });

    expect(orCalls.length).toBe(1);
    const filter = orCalls[0];
    // No raw, unquoted `ilike.%a,b)%` interpolation.
    expect(filter).not.toContain("ilike.%a,b)%");
    // Both columns use the quoted, escaped token.
    expect(filter).toContain('nombre.ilike."%a,b)%"');
    expect(filter).toContain('apellidos.ilike."%a,b)%"');
  });

  it("LIKE-wildcard payload `100%_x` is double-backslash escaped, not left as wildcards", async () => {
    const caller = appRouter.createCaller(authCtx());
    await caller.persons.search({ query: "100%_x" });

    expect(orCalls.length).toBe(1);
    const filter = orCalls[0];
    expect(filter).toContain("\\\\%");
    expect(filter).toContain("\\\\_");
    // No raw, unescaped % / _ from the user value.
    expect(filter).not.toContain("100%_x");
  });

  it("a normal name still produces a substring search filter", async () => {
    const caller = appRouter.createCaller(authCtx());
    await caller.persons.search({ query: "García" });

    expect(orCalls.length).toBe(1);
    expect(orCalls[0]).toBe('nombre.ilike."%García%",apellidos.ilike."%García%"');
  });
});
