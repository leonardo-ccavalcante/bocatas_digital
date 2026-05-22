import { describe, it, expect } from "vitest";
import { buildCloseoutProposal, type AssignmentLite, type ActaOcrRow } from "../utils/actaCloseoutMatch";

const roster: AssignmentLite[] = [
  { id: "a1", expediente: "101", nombre: "Maria G" },
  { id: "a2", expediente: "102", nombre: "Jose P" },
  { id: "a3", expediente: "103", nombre: "Ana R" },
];

describe("buildCloseoutProposal — OCR-assisted, roster-anchored", () => {
  it("auto-selects only signed rows above the confidence threshold", () => {
    const ocr: ActaOcrRow[] = [
      { expediente: "101", signed: true, confidence: 0.95 }, // ok → auto
      { expediente: "102", signed: true, confidence: 0.5 },  // low confidence → review
      { expediente: "103", signed: false, confidence: 0.9 }, // not signed → ok, not auto
    ];
    const p = buildCloseoutProposal(ocr, roster, 0.8);
    expect(p.attendedAutoIds).toEqual(["a1"]);
    expect(p.rows.find((r) => r.assignment_id === "a2")?.status).toBe("low_confidence");
    expect(p.rows.find((r) => r.assignment_id === "a3")?.autoSelected).toBe(false);
  });

  it("flags roster families OCR did not detect (never silently absent)", () => {
    const ocr: ActaOcrRow[] = [{ expediente: "101", signed: true, confidence: 0.99 }];
    const p = buildCloseoutProposal(ocr, roster, 0.8);
    const a3 = p.rows.find((r) => r.assignment_id === "a3");
    expect(a3?.status).toBe("not_detected");
    expect(a3?.autoSelected).toBe(false);
    expect(p.needsReviewCount).toBeGreaterThanOrEqual(2); // a2 + a3 not detected
  });

  it("surfaces OCR rows whose expediente is not on the roster (warnings, never acted on)", () => {
    const ocr: ActaOcrRow[] = [
      { expediente: "101", signed: true, confidence: 0.99 },
      { expediente: "999", signed: true, confidence: 0.99 }, // not in roster
    ];
    const p = buildCloseoutProposal(ocr, roster, 0.8);
    expect(p.unmatchedOcr).toContain("999");
    // unmatched OCR never becomes an attended id
    expect(p.attendedAutoIds).toEqual(["a1"]);
  });

  it("never invents families: every proposal row maps to a real assignment id", () => {
    const ocr: ActaOcrRow[] = [{ expediente: "999", signed: true, confidence: 0.99 }];
    const p = buildCloseoutProposal(ocr, roster, 0.8);
    expect(p.rows).toHaveLength(roster.length);
    expect(p.rows.every((r) => roster.some((a) => a.id === r.assignment_id))).toBe(true);
  });
});
