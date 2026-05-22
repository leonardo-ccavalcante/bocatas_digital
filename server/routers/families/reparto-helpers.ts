import type { SupabaseClient } from "@supabase/supabase-js";

// PRE-2 — representative ("titular") resolution.
//
// families.titular_id is empty in prod and no familia_miembro is flagged as
// titular, so we derive a deterministic representative per family: prefer a
// member with relacion='parent' (earliest created_at), else the earliest
// member. Identity (name / DNI / phone) lives on persons, joined via person_id.

export interface Representative {
  person_id: string | null;
  nombre: string | null;
  apellidos: string | null;
  numero_documento: string | null; // DNI/NIE — PII, admin docs only
  telefono: string | null;
}

interface MemberRow {
  familia_id: string;
  relacion: string | null;
  created_at: string | null;
  person_id: string | null;
}

/** Pick the representative member for each family, deterministically. */
export function pickRepresentatives(members: MemberRow[]): Map<string, MemberRow> {
  const byFamily = new Map<string, MemberRow[]>();
  for (const m of members) {
    const arr = byFamily.get(m.familia_id) ?? [];
    arr.push(m);
    byFamily.set(m.familia_id, arr);
  }
  const out = new Map<string, MemberRow>();
  for (const [familyId, list] of byFamily) {
    const sorted = [...list].sort(
      (a, b) =>
        rank(a.relacion) - rank(b.relacion) ||
        (a.created_at ?? "").localeCompare(b.created_at ?? ""),
    );
    out.set(familyId, sorted[0]);
  }
  return out;
}

function rank(relacion: string | null): number {
  return relacion === "parent" ? 0 : 1;
}

/**
 * Resolve a representative (name + DNI + phone) for each family id.
 * Returns a Map keyed by family_id. Empty map for no input.
 */
export async function resolveRepresentatives(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  familyIds: string[],
): Promise<Map<string, Representative>> {
  const result = new Map<string, Representative>();
  if (familyIds.length === 0) return result;

  const { data: members } = await db
    .from("familia_miembros")
    .select("familia_id, relacion, created_at, person_id")
    .in("familia_id", familyIds)
    .is("deleted_at", null);

  const reps = pickRepresentatives((members ?? []) as MemberRow[]);
  const personIds = [...reps.values()].map((m) => m.person_id).filter((x): x is string => !!x);

  const persons = new Map<string, Omit<Representative, "person_id">>();
  if (personIds.length > 0) {
    const { data: prows } = await db
      .from("persons")
      .select("id, nombre, apellidos, numero_documento, telefono")
      .in("id", personIds);
    for (const p of prows ?? []) {
      persons.set(p.id, {
        nombre: p.nombre ?? null,
        apellidos: p.apellidos ?? null,
        numero_documento: p.numero_documento ?? null,
        telefono: p.telefono ?? null,
      });
    }
  }

  for (const [familyId, member] of reps) {
    const ident = member.person_id ? persons.get(member.person_id) : undefined;
    result.set(familyId, {
      person_id: member.person_id,
      nombre: ident?.nombre ?? null,
      apellidos: ident?.apellidos ?? null,
      numero_documento: ident?.numero_documento ?? null,
      telefono: ident?.telefono ?? null,
    });
  }
  return result;
}
