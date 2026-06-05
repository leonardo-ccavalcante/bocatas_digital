import { describe, it, expect } from "vitest";
import {
  summarizeMemberMatches,
  classifyInformesFamily,
  informesHasNarrative,
} from "../informesMatchSummary";
import type { InformesFamily } from "../../../../../../shared/legacyFamiliasTypes";

const m = (match_tier: string) => ({ match_tier }) as { match_tier: never };
const mm = (match_tier: string) =>
  ({ slot: 2, matched_member_id: null, matched_person_id: null, match_tier }) as
    InformesFamily["member_matches"][number];

function fam(p: Partial<InformesFamily>): InformesFamily {
  return {
    legacy_numero_familia: "1",
    titular: {
      nombre: "T", apellidos: "L", fecha_nacimiento: null, pais_origen: null,
      telefono: null, direccion: null, municipio: null, codigo_postal: null,
      tipo_documento: null, numero_documento: null, warnings: [],
    },
    members: [],
    situacion_familiar_texto: null,
    necesidades_texto: null,
    family_id: "f1",
    titular_id: "t1",
    member_matches: [],
    members_truncated: false,
    warnings: [],
    ...p,
  } as InformesFamily;
}

describe("summarizeMemberMatches", () => {
  it("buckets each tier into the operator-facing summary", () => {
    const s = summarizeMemberMatches([
      m("documento"),
      m("probe_key"),
      m("name_first_apellido"),
      m("member_conflict"),
      m("ambiguous"),
      m("none"),
    ]);
    expect(s).toEqual({
      matched: 2, // documento + probe_key (auto-written, strong)
      needsConfirm: 1, // name_first_apellido (weak — flag only)
      conflict: 1, // member_conflict (DOB/DNI disagreement)
      ambiguous: 1,
      unmatched: 1, // none
    });
  });

  it("empty match list → all zero", () => {
    expect(summarizeMemberMatches([])).toEqual({
      matched: 0,
      needsConfirm: 0,
      conflict: 0,
      ambiguous: 0,
      unmatched: 0,
    });
  });
});

describe("classifyInformesFamily", () => {
  it("no roster family → missing", () => {
    expect(classifyInformesFamily(fam({ family_id: null }))).toBe("missing");
  });
  it("enrichable + member_conflict → warnings", () => {
    expect(
      classifyInformesFamily(fam({ member_matches: [mm("member_conflict")] }))
    ).toBe("warnings");
  });
  it("enrichable + truncated members → warnings", () => {
    expect(classifyInformesFamily(fam({ members_truncated: true }))).toBe("warnings");
  });
  it("enrichable + only strong matches, no avisos → enrich", () => {
    expect(
      classifyInformesFamily(fam({ member_matches: [mm("documento"), mm("probe_key")] }))
    ).toBe("enrich");
  });
});

describe("informesHasNarrative", () => {
  it("true when either narrative field is present", () => {
    expect(informesHasNarrative(fam({ situacion_familiar_texto: "x" }))).toBe(true);
    expect(informesHasNarrative(fam({ necesidades_texto: "y" }))).toBe(true);
  });
  it("false when both empty", () => {
    expect(informesHasNarrative(fam({}))).toBe(false);
  });
});
