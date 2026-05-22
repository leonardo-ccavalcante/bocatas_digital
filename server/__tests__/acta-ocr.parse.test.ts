import { describe, it, expect } from "vitest";
import { parseActaOcrResponse } from "../_core/acta-ocr";

describe("parseActaOcrResponse — tolerant pure parser", () => {
  it("parses well-formed rows and clamps confidence to [0,1]", () => {
    const r = parseActaOcrResponse(JSON.stringify({
      extraction_confidence: 0.9,
      rows: [
        { expediente: "101", signed: true, confidence: 1.4 },  // clamps to 1
        { expediente: 102, signed: false, confidence: 0.3 },   // numeric expediente → string
      ],
      warnings: ["fila 3 borrosa"],
    }));
    expect(r.success).toBe(true);
    expect(r.rows).toEqual([
      { expediente: "101", signed: true, confidence: 1 },
      { expediente: "102", signed: false, confidence: 0.3 },
    ]);
    expect(r.warnings).toEqual(["fila 3 borrosa"]);
  });

  it("drops rows without an expediente and defaults missing fields safely", () => {
    const r = parseActaOcrResponse(JSON.stringify({ rows: [{ signed: true }, { expediente: "" }, { expediente: "5" }] }));
    expect(r.rows).toEqual([{ expediente: "5", signed: false, confidence: 0 }]);
  });

  it("fails gracefully on non-JSON", () => {
    const r = parseActaOcrResponse("not json");
    expect(r.success).toBe(false);
    expect(r.rows).toEqual([]);
    expect(r.errors?.[0]).toMatch(/JSON/i);
  });
});
