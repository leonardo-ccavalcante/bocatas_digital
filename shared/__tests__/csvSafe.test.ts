/**
 * csvSafe.test.ts — Contract tests for the shared CSV cell escaper.
 *
 * Defends against CSV formula injection (CAS-01 / THE-02): a string cell
 * beginning with a formula trigger (= + - @ TAB CR) is prefixed with a single
 * quote so spreadsheets treat it as text, then RFC-4180 quoting is applied.
 * Numbers/booleans pass through untouched (a numeric -5 must NOT become '-5).
 *
 * Iron Law: fix the implementation, never the tests.
 */

import { describe, it, expect } from "vitest";
import { escapeCsvField } from "../csvSafe";

describe("escapeCsvField — formula injection (CAS-01 / THE-02)", () => {
  it("prefixes and quotes a leading '=' formula trigger (string)", () => {
    expect(escapeCsvField("=1+1")).toBe('"\'=1+1"');
  });

  it("prefixes and quotes a leading '@' DDE trigger (string)", () => {
    expect(escapeCsvField("@SUM(A1)")).toBe('"\'@SUM(A1)"');
  });

  it("prefixes and quotes a leading '-' trigger (string)", () => {
    expect(escapeCsvField("-2+3")).toBe('"\'-2+3"');
  });

  it("prefixes and quotes a leading '+' trigger (string)", () => {
    expect(escapeCsvField("+1")).toBe('"\'+1"');
  });

  it("prefixes and quotes a leading TAB trigger (string)", () => {
    expect(escapeCsvField("\t=evil")).toBe('"\'\t=evil"');
  });

  it("prefixes and quotes a leading CR trigger (string)", () => {
    expect(escapeCsvField("\r=evil")).toBe('"\'\r=evil"');
  });
});

describe("escapeCsvField — benign / non-string passthrough", () => {
  it("leaves a benign string unchanged", () => {
    expect(escapeCsvField("Garcia Lopez")).toBe("Garcia Lopez");
  });

  it("does NOT prefix a numeric -5 (numbers are not formula-risky)", () => {
    expect(escapeCsvField(-5)).toBe("-5");
  });

  it("does NOT prefix a numeric -5.5", () => {
    expect(escapeCsvField(-5.5)).toBe("-5.5");
  });

  it("passes booleans through", () => {
    expect(escapeCsvField(true)).toBe("true");
    expect(escapeCsvField(false)).toBe("false");
  });

  it("converts null and undefined to empty string", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });
});

describe("escapeCsvField — RFC 4180 quoting", () => {
  it("wraps a value containing a comma", () => {
    expect(escapeCsvField("hello, world")).toBe('"hello, world"');
  });

  it("doubles internal double-quotes and wraps", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps a value containing a newline", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps a value containing a carriage return", () => {
    expect(escapeCsvField("a\rb")).toBe('"a\rb"');
  });
});
