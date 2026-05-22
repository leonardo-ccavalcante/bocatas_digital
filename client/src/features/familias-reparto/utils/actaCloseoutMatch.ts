// OCR-assisted close-out: match a vision-extracted signed acta back to the
// KNOWN day roster and propose an attendance set for operator confirmation.
//
// Design for reliability (never autonomous):
//  - Roster-anchored: we iterate the assignments WE printed (truth for who's
//    expected); OCR only annotates them. We never invent a family from OCR.
//  - Match on the printed `expediente` (exact), NOT fuzzy names.
//  - A row is auto-selected ONLY if OCR says signed AND confidence ≥ threshold.
//    Everything else is surfaced for manual review.

export interface ActaOcrRow {
  expediente: string;
  signed: boolean;
  confidence: number; // 0..1
}

export interface AssignmentLite {
  id: string;
  expediente: string | null;
  nombre: string | null;
}

export type ProposalStatus = "ok" | "low_confidence" | "not_detected";

export interface CloseoutProposalRow {
  assignment_id: string;
  expediente: string | null;
  nombre: string | null;
  signed: boolean;
  confidence: number;
  autoSelected: boolean;
  status: ProposalStatus;
}

export interface CloseoutProposal {
  rows: CloseoutProposalRow[];
  /** assignment_ids OCR confidently read as signed → pre-checked for the operator */
  attendedAutoIds: string[];
  /** OCR expedientes not on the roster — surfaced as warnings, never acted on */
  unmatchedOcr: string[];
  needsReviewCount: number;
}

const DEFAULT_THRESHOLD = 0.8;

export function buildCloseoutProposal(
  ocrRows: ActaOcrRow[],
  assignments: AssignmentLite[],
  confidenceThreshold: number = DEFAULT_THRESHOLD,
): CloseoutProposal {
  const ocrByExp = new Map<string, ActaOcrRow>();
  for (const r of ocrRows) if (r.expediente) ocrByExp.set(String(r.expediente), r);

  const rosterExps = new Set(
    assignments.map((a) => (a.expediente !== null ? String(a.expediente) : "")).filter(Boolean),
  );

  const rows: CloseoutProposalRow[] = assignments.map((a) => {
    const exp = a.expediente !== null ? String(a.expediente) : null;
    const ocr = exp ? ocrByExp.get(exp) : undefined;
    if (!ocr) {
      return { assignment_id: a.id, expediente: exp, nombre: a.nombre, signed: false, confidence: 0, autoSelected: false, status: "not_detected" };
    }
    const confident = ocr.confidence >= confidenceThreshold;
    return {
      assignment_id: a.id,
      expediente: exp,
      nombre: a.nombre,
      signed: ocr.signed,
      confidence: ocr.confidence,
      autoSelected: ocr.signed && confident,
      status: ocr.signed && !confident ? "low_confidence" : "ok",
    };
  });

  const unmatchedOcr = [...ocrByExp.keys()].filter((e) => !rosterExps.has(e));
  const attendedAutoIds = rows.filter((r) => r.autoSelected).map((r) => r.assignment_id);
  const needsReviewCount = rows.filter((r) => r.status !== "ok").length + unmatchedOcr.length;

  return { rows, attendedAutoIds, unmatchedOcr, needsReviewCount };
}
