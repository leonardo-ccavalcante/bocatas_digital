// Family-scoped member matching for the INFORMES enrich pass (2b).
//
// Aligns each un-pivoted INFORMES member to ONE existing familia_miembros row of
// the SAME family. Safety-critical (B1/B2): a wrong match writes one person's
// DNI/parentesco onto another. Rules:
//   * Tier 1 — document (normalized): strong identity, works without a DOB.
//   * Tier 2 — nombre+apellidos+DOB (the importer's existing probeKey).
//   * Tier 3 — nombre+FIRST-apellido+DOB (absorbs single- vs double-surname).
//   * Name-based tiers REQUIRE a DOB — never match on name alone.
//   * ≥2 candidates at any tier → `ambiguous` (refuse to write; flag instead).
//   * An existing member matched once is not reused for another slot.
// Pure — no DB. The router supplies `existing` from a family-scoped query.

import { normalizeHeader } from "./csvLegacyFamiliasParser";
import type { InformesMember } from "../shared/legacyFamiliasTypes";

export interface ExistingMember {
  id: string;
  person_id: string | null;
  nombre: string;
  apellidos: string | null;
  fecha_nacimiento: string | null;
  documento: string | null;
}

export type MatchTier =
  | "documento"
  | "probe_key"
  | "name_first_apellido"
  | "none"
  | "ambiguous";

export interface MemberMatch {
  slot: number;
  matched_member_id: string | null;
  matched_person_id: string | null;
  match_tier: MatchTier;
}

function normDoc(s: string | null | undefined): string {
  return (s ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
}
function nameKey(nombre: string, apellidos: string | null): string {
  return `${normalizeHeader(nombre)}|${normalizeHeader(apellidos ?? "")}`;
}
function firstApellido(apellidos: string | null): string {
  return normalizeHeader((apellidos ?? "").split(/\s+/)[0] ?? "");
}

export function matchInformesMembers(
  informes: ReadonlyArray<InformesMember>,
  existing: ReadonlyArray<ExistingMember>
): MemberMatch[] {
  const used = new Set<string>();
  const avail = (): ExistingMember[] => existing.filter((e) => !used.has(e.id));
  const out: MemberMatch[] = [];

  for (const m of informes) {
    let hit: ExistingMember | null = null;
    let tier: MatchTier = "none";

    // Tier 1 — document.
    const md = normDoc(m.numero_documento);
    if (md) {
      const c = avail().filter((e) => normDoc(e.documento) === md);
      if (c.length === 1) {
        hit = c[0];
        tier = "documento";
      } else if (c.length > 1) {
        tier = "ambiguous";
      }
    }

    // Name-based tiers require a DOB and are skipped if Tier 1 was ambiguous.
    if (!hit && tier !== "ambiguous" && m.fecha_nacimiento) {
      // Tier 2 — full name + DOB.
      if (m.apellidos) {
        const k = nameKey(m.nombre, m.apellidos);
        const c = avail().filter(
          (e) =>
            e.fecha_nacimiento === m.fecha_nacimiento &&
            nameKey(e.nombre, e.apellidos) === k
        );
        if (c.length === 1) {
          hit = c[0];
          tier = "probe_key";
        } else if (c.length > 1) {
          tier = "ambiguous";
        }
      }
      // Tier 3 — name + first apellido + DOB.
      if (!hit && tier !== "ambiguous") {
        const fa = firstApellido(m.apellidos);
        const nm = normalizeHeader(m.nombre);
        if (fa && nm) {
          const c = avail().filter(
            (e) =>
              e.fecha_nacimiento === m.fecha_nacimiento &&
              normalizeHeader(e.nombre) === nm &&
              firstApellido(e.apellidos) === fa
          );
          if (c.length === 1) {
            hit = c[0];
            tier = "name_first_apellido";
          } else if (c.length > 1) {
            tier = "ambiguous";
          }
        }
      }
    }

    if (hit) {
      used.add(hit.id);
      out.push({
        slot: m.slot,
        matched_member_id: hit.id,
        matched_person_id: hit.person_id,
        match_tier: tier,
      });
    } else {
      out.push({
        slot: m.slot,
        matched_member_id: null,
        matched_person_id: null,
        match_tier: tier,
      });
    }
  }
  return out;
}
