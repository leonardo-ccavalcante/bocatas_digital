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

// ── Router-site test: persons.search must escape before it hits PostgREST ────
//
// RC-06 replaced the old single `.or("nombre.ilike.…,apellidos.ilike.…")` with
// one AND'ed `.ilike("nombre_norm", …)` per normalised token. That removes the
// filter-list breakout vector entirely (a value is no longer parsed as a list),
// but the LIKE-wildcard escaping still has to hold, so the CAS-04 guard moves
// with the implementation instead of disappearing with it.

const orCalls: string[] = [];
const ilikeCalls: Array<[string, string]> = [];

vi.mock("../../../client/src/lib/supabase/server", () => ({
  createAdminClient: () => {
    const chain = {
      or: (filters: string) => {
        orCalls.push(filters);
        return chain;
      },
      ilike: (column: string, value: string) => {
        ilikeCalls.push([column, value]);
        return chain;
      },
      is: () => chain,
      order: () => chain,
      limit: async () => ({ data: [], error: null }),
    };
    return { from: () => ({ select: () => chain }) };
  },
}));

// Imported AFTER the mock so the router picks up the mocked client.
import { appRouter } from "../../routers";
import type { TrpcContext } from "../context";
import { Logger } from "../logger";

function authCtx(): TrpcContext {
  return {
    user: {
      id: "test-user-1",
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

describe("persons.search — escapes user input before PostgREST", () => {
  beforeEach(() => {
    orCalls.length = 0;
    ilikeCalls.length = 0;
  });

  it("injection payload `a,b)` never reaches a .or() filter list", async () => {
    const caller = appRouter.createCaller(authCtx());
    await caller.persons.search({ query: "a,b)" });

    // The breakout vector is gone: the value is an .ilike() argument, which
    // PostgREST never parses as a comma-separated filter list.
    expect(orCalls).toEqual([]);
    expect(ilikeCalls).toEqual([["nombre_norm", "%a,b)%"]]);
  });

  it("LIKE-wildcard payload `100%_x` is backslash-escaped, not left as wildcards", async () => {
    const caller = appRouter.createCaller(authCtx());
    await caller.persons.search({ query: "100%_x" });

    expect(ilikeCalls.length).toBe(1);
    const [, value] = ilikeCalls[0];
    // .ilike(col, value) is the unquoted context, so ONE backslash layer is
    // what reaches LIKE (ilikeForOr's double layer would be wrong here).
    expect(value).toBe("%100\\%\\_x%");
    // No raw, unescaped % / _ from the user value survives.
    expect(value).not.toContain("100%_x");
  });

  it("a normal name produces one normalised substring filter", async () => {
    const caller = appRouter.createCaller(authCtx());
    await caller.persons.search({ query: "García" });

    // Accent-folded and lowercased to match the generated nombre_norm column.
    expect(ilikeCalls).toEqual([["nombre_norm", "%garcia%"]]);
  });

  it("multi-word queries AND one escaped filter per token, in any order", async () => {
    const caller = appRouter.createCaller(authCtx());
    await caller.persons.search({ query: "  María  García " });

    expect(ilikeCalls).toEqual([
      ["nombre_norm", "%maria%"],
      ["nombre_norm", "%garcia%"],
    ]);
  });

  it("strips * so it cannot act as a PostgREST wildcard alias", async () => {
    const caller = appRouter.createCaller(authCtx());
    await caller.persons.search({ query: "a*b" });

    expect(ilikeCalls).toEqual([["nombre_norm", "%ab%"]]);
  });
});
