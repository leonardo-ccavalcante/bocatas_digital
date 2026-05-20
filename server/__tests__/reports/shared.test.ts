/**
 * shared.test.ts — TECH_DEBT C-05: wrapDbError must not leak raw DB errors.
 *
 * The raw Supabase error.message can echo column values (PII) and schema
 * internals. wrapDbError must return a generic client-facing message + a
 * correlationId, and keep the raw detail server-side only.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { wrapDbError } from "../../routers/reports/_shared";

afterEach(() => vi.restoreAllMocks());

const RAW = {
  code: "23505",
  message: "duplicate key value violates unique constraint — telefono=+34600111222",
};

describe("wrapDbError (C-05)", () => {
  it("does NOT include the raw DB message (PII / schema internals) in the client error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = wrapDbError("reports.familiasAtendidas", RAW);
    expect(err.message).not.toContain("telefono");
    expect(err.message).not.toContain("+34600111222");
    expect(err.message).not.toContain("duplicate key");
    expect(err.message).not.toContain("constraint");
  });

  it("returns a correlationId in the client message (to tie to server logs)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = wrapDbError("reports.familiasAtendidas", RAW);
    expect(err.message).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });

  it("logs the raw detail server-side (so on-call can still diagnose)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    wrapDbError("reports.familiasAtendidas", RAW);
    const logged = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("reports.familiasAtendidas");
    expect(logged).toContain("telefono=+34600111222"); // raw detail lives in logs only
  });

  it("is an INTERNAL_SERVER_ERROR TRPCError", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = wrapDbError("x", RAW);
    expect(err.name).toBe("TRPCError");
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
