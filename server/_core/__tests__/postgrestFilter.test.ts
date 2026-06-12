/**
 * postgrestFilter.test.ts — RED→GREEN for the CAS-04 filter-injection fix.
 *
 * Two layers:
 *   1. Unit tests for escapeIlikePattern — the dangerous chars (`% _ , ( ) \ * "`)
 *      must be neutralised, and a normal name must still produce a substring match.
 *   2. One router-site test (persons.search) via the existing createCaller +
 *      vi.mock(createAdminClient) pattern — the filter string handed to PostgREST
 *      `.or()` must carry the escaped value, never the raw breakout chars.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { escapeIlikePattern } from "../postgrestFilter";

describe("escapeIlikePattern — helper", () => {
  it("escapes the SQL LIKE wildcards % and _ so they match literally", () => {
    const out = escapeIlikePattern("100%_x");
    // The user's % and _ become escaped (literal), not wildcards.
    expect(out).toContain("\\%");
    expect(out).toContain("\\_");
    // No bare, unescaped % or _ from the user value survives.
    expect(out).not.toMatch(/(?<!\\)%x/);
    expect(out).not.toMatch(/(?<!\\)_x/);
  });

  it("neutralises PostgREST .or() filter-list breakout chars , ( )", () => {
    const out = escapeIlikePattern("a,b)");
    // Whole token is double-quoted, so the comma/paren cannot break the list.
    expect(out.startsWith('"')).toBe(true);
    expect(out.endsWith('"')).toBe(true);
    // The raw breakout sequence `,b)` is no longer sitting unquoted in the token:
    // it is enclosed inside the double-quoted literal.
    const inner = out.slice(1, -1); // strip the wrapping quotes
    expect(inner).toContain("a,b)"); // present, but only inside the quoted literal
  });

  it("escapes the LIKE escape char (backslash) first", () => {
    const out = escapeIlikePattern("a\\b");
    expect(out).toContain("\\\\"); // user backslash doubled
  });

  it("escapes an embedded double quote by doubling it", () => {
    const out = escapeIlikePattern('a"b');
    // doubled quote inside the token (plus the two wrapping quotes)
    expect(out.slice(1, -1)).toContain('a""b');
  });

  it("disables the *→% alias by double-quoting the token", () => {
    const out = escapeIlikePattern("a*b");
    // The * stays literal inside the quoted token rather than aliasing to %.
    expect(out.startsWith('"')).toBe(true);
    expect(out.slice(1, -1)).toContain("a*b");
  });

  it("a normal name still produces a substring (%-anchored) ilike pattern", () => {
    const out = escapeIlikePattern("García");
    expect(out).toBe('"%García%"');
  });

  it("wraps with literal % wildcards on both ends for substring search", () => {
    const out = escapeIlikePattern("Juan");
    expect(out.startsWith('"%')).toBe(true);
    expect(out.endsWith('%"')).toBe(true);
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
    // The escaped value is double-quoted, so the raw `,`/`)` are inside a quoted
    // literal — they no longer sit as bare filter-list delimiters.
    // There must be no `ilike.%a,b)%` raw interpolation.
    expect(filter).not.toContain("ilike.%a,b)%");
    // Both columns use the quoted, escaped token.
    expect(filter).toContain('nombre.ilike."%a,b)%"');
    expect(filter).toContain('apellidos.ilike."%a,b)%"');
  });

  it("LIKE-wildcard payload `100%_x` is escaped, not left as wildcards", async () => {
    const caller = appRouter.createCaller(authCtx());
    await caller.persons.search({ query: "100%_x" });

    expect(orCalls.length).toBe(1);
    const filter = orCalls[0];
    expect(filter).toContain("\\%");
    expect(filter).toContain("\\_");
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
