// Pure summariser for the INFORMES enrich preview: turns a family's raw
// member_matches[] into the operator-facing buckets the lane UI renders.
// Mirrors the RPC's write policy — only `matched` (documento|probe_key) is
// auto-written; everything else is surfaced for human review.

import type {
  MemberMatch,
  InformesFamily,
} from "../../../../../shared/legacyFamiliasTypes";

export interface MatchSummary {
  /** documento | probe_key — strong, auto-written by enrich_families_from_informes. */
  matched: number;
  /** name_first_apellido — weak, flag-only (never auto-written; needs confirm). */
  needsConfirm: number;
  /** member_conflict — name matches but DOB/DNI disagree; adjudicate. */
  conflict: number;
  /** ambiguous — ≥2 candidates; refused. */
  ambiguous: number;
  /** none — no roster member matched. */
  unmatched: number;
}

export function summarizeMemberMatches(
  matches: ReadonlyArray<Pick<MemberMatch, "match_tier">>
): MatchSummary {
  const s: MatchSummary = {
    matched: 0,
    needsConfirm: 0,
    conflict: 0,
    ambiguous: 0,
    unmatched: 0,
  };
  for (const mm of matches) {
    switch (mm.match_tier) {
      case "documento":
      case "probe_key":
        s.matched++;
        break;
      case "name_first_apellido":
        s.needsConfirm++;
        break;
      case "member_conflict":
        s.conflict++;
        break;
      case "ambiguous":
        s.ambiguous++;
        break;
      default:
        s.unmatched++;
    }
  }
  return s;
}

// Preview bucket for one INFORMES family. `missing` = no roster family (never
// enriched); `warnings` = enrichable but something needs the operator's eye;
// `enrich` = clean backfill.
export type InformesBucket = "enrich" | "warnings" | "missing";

export function classifyInformesFamily(f: InformesFamily): InformesBucket {
  if (f.family_id === null) return "missing";
  const s = summarizeMemberMatches(f.member_matches);
  const hasAviso =
    f.warnings.length > 0 ||
    f.members_truncated ||
    s.conflict > 0 ||
    s.ambiguous > 0 ||
    s.needsConfirm > 0;
  return hasAviso ? "warnings" : "enrich";
}

/** Whether the social-report narrative EXISTS (presence only — never the Art.9 text). */
export function informesHasNarrative(f: InformesFamily): boolean {
  return Boolean(f.situacion_familiar_texto || f.necesidades_texto);
}
