/**
 * exportCsv.test.ts — Contract tests for utils/exportCsv.ts
 *
 * Tests: BOM prefix, CRLF line endings, RFC 4180 escaping, redactFields.
 * Iron Law: fix the implementation, never the tests.
 */

import { describe, it, expect } from "vitest";
import {
  escapeCsvCell,
  buildCsvString,
  redactRow,
  flattenRow,
} from "../utils/exportCsv";

describe("escapeCsvCell", () => {
  it("returns value unchanged when no special characters", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(true)).toBe("true");
  });

  it("wraps in quotes when value contains a comma", () => {
    expect(escapeCsvCell("hello, world")).toBe('"hello, world"');
  });

  it("doubles internal double-quotes and wraps", () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps in quotes when value contains a newline", () => {
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps when value contains carriage return", () => {
    expect(escapeCsvCell("a\rb")).toBe('"a\rb"');
  });

  it("converts null to empty string", () => {
    expect(escapeCsvCell(null)).toBe("");
  });

  it("converts undefined to empty string", () => {
    expect(escapeCsvCell(undefined)).toBe("");
  });

  // C-03: CSV/formula injection — neutralize leading formula triggers on STRINGS.
  it("neutralizes a leading '=' formula trigger (string)", () => {
    expect(escapeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
  });

  it("neutralizes leading + - @ triggers (string)", () => {
    expect(escapeCsvCell("+34600000000")).toBe("'+34600000000");
    expect(escapeCsvCell("-cmd")).toBe("'-cmd");
    expect(escapeCsvCell("@foo")).toBe("'@foo");
  });

  it("neutralizes then quotes when the formula cell also contains a comma", () => {
    expect(escapeCsvCell("=cmd,evil")).toBe('"\'=cmd,evil"');
  });

  it("does NOT prefix negative NUMBERS (only strings are formula-risky)", () => {
    expect(escapeCsvCell(-5)).toBe("-5");
    expect(escapeCsvCell(-5.5)).toBe("-5.5");
  });
});

describe("flattenRow (C-04)", () => {
  it("flattens a nested object into dotted keys", () => {
    const row = { id: "f1", persons: { nombre: "Ana", telefono: "600" } };
    expect(flattenRow(row)).toEqual({
      id: "f1",
      "persons.nombre": "Ana",
      "persons.telefono": "600",
    });
  });

  it("leaves primitives, null, and arrays as leaf values", () => {
    const row = { a: 1, b: null, c: ["x", "y"] };
    expect(flattenRow(row)).toEqual({ a: 1, b: null, c: ["x", "y"] });
  });
});

describe("redactRow", () => {
  const HIGH_RISK = ["situacion_legal", "foto_documento_url", "recorrido_migratorio"];

  it("returns a new object, original is unchanged", () => {
    const row = { nombre: "Ana", situacion_legal: "irregular" };
    const result = redactRow(row, HIGH_RISK);
    expect(row.situacion_legal).toBe("irregular"); // unchanged
    expect(result.situacion_legal).toBe("[REDACTED]");
  });

  it("strips all three high-risk PII fields", () => {
    const row = {
      id: "abc",
      situacion_legal: "regular",
      foto_documento_url: "https://example.com/doc.jpg",
      recorrido_migratorio: "Marruecos → España",
      nombre: "Bilal",
    };
    const result = redactRow(row, HIGH_RISK);
    expect(result.situacion_legal).toBe("[REDACTED]");
    expect(result.foto_documento_url).toBe("[REDACTED]");
    expect(result.recorrido_migratorio).toBe("[REDACTED]");
    expect(result.id).toBe("abc");
    expect(result.nombre).toBe("Bilal");
  });

  it("returns the same object reference when redactFields is empty", () => {
    const row = { id: "1", nombre: "Ana" };
    const result = redactRow(row, []);
    expect(result).toBe(row);
  });
});

describe("buildCsvString", () => {
  it("returns empty string for empty rows", () => {
    expect(buildCsvString([])).toBe("");
  });

  it("uses CRLF line endings", () => {
    const rows = [{ a: "1", b: "2" }, { a: "3", b: "4" }];
    const csv = buildCsvString(rows);
    // Header + data line + separating CRLF
    expect(csv).toContain("\r\n");
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 data rows
  });

  it("header row matches object keys of first row", () => {
    const rows = [{ district: "Vallecas", count: 12 }];
    const csv = buildCsvString(rows);
    const [header] = csv.split("\r\n");
    expect(header).toBe("district,count");
  });

  it("escapes cells containing commas", () => {
    const rows = [{ name: "García, Ana", score: 5 }];
    const csv = buildCsvString(rows);
    expect(csv).toContain('"García, Ana"');
  });

  it("redacts high-risk PII fields when redactFields provided", () => {
    const HIGH_RISK = ["situacion_legal", "foto_documento_url", "recorrido_migratorio"];
    const rows = [
      {
        id: "f1",
        nombre: "Ana",
        situacion_legal: "irregular",
        foto_documento_url: "https://bucket/img.png",
        recorrido_migratorio: "Argelia → España",
      },
    ];
    const csv = buildCsvString(rows, HIGH_RISK);
    expect(csv).not.toContain("irregular");
    expect(csv).not.toContain("https://bucket/img.png");
    expect(csv).not.toContain("Argelia");
    expect(csv).toContain("[REDACTED]");
    expect(csv).toContain("Ana"); // safe field preserved
  });

  it("does NOT redact when redactFields is not provided", () => {
    const rows = [{ situacion_legal: "regular" }];
    const csv = buildCsvString(rows);
    expect(csv).toContain("regular");
  });

  // C-04: nested objects must flatten (no "[object Object]") and redaction
  // must reach nested leaf keys.
  it("flattens nested persons object into real columns (no [object Object])", () => {
    const rows = [{ id: "f1", persons: { nombre: "Ana", apellidos: "García" } }];
    const csv = buildCsvString(rows);
    expect(csv).not.toContain("[object Object]");
    const [header] = csv.split("\r\n");
    expect(header).toBe("id,persons.nombre,persons.apellidos");
    expect(csv).toContain("Ana");
    expect(csv).toContain("García");
  });

  it("redacts a high-risk field even when nested under persons", () => {
    const rows = [
      { id: "f1", persons: { situacion_legal: "irregular", nombre: "Ana" } },
    ];
    const csv = buildCsvString(rows, ["situacion_legal"]);
    expect(csv).not.toContain("irregular");
    expect(csv).toContain("[REDACTED]");
    expect(csv).toContain("Ana");
  });
});
