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

// ── Round-scoped acta (Hoja de Firmas) ──────────────────────────────────────
//
// Both the "acta de citación" (antes: 2 suggested dates) and the "acta final"
// (después: actual pick-up date) are the SAME complete round roster — every
// family in the round, ordered by numeric familia_numero — differing only in
// which date columns the print layout shows. One query serves both.

export interface RoundActaRow {
  assignment_id: string;
  estado_contacto: string | null;
  preferred_slot_ids: string[];
  familia_numero: number | null;
  expediente: string | null;
  nombre: string | null;
  apellidos: string | null;
  dni: string | null; // numero_documento — PII, admin acta only (legal basis B.A.)
  telefono: string | null;
  num_adultos: number | null;
  num_menores: number | null;
  total_miembros: number;
  kg_alimentos: number | null;
  kg_carne: number | null;
  // Citación (antes): the up-to-2 dates agreed with the family. When the family
  // has been contacted, both come from their declared preferred slots; otherwise
  // fecha1 falls back to the system-suggested day and fecha2 is blank.
  fecha1: string | null;
  fecha2: string | null;
  contactada: boolean;
  // Final (después): the date the family actually picked up (attended slot).
  fecha_real: string | null;
  attended: boolean | null;
  // Signed URL (TTL) to the captured on-screen signature, for the final acta's
  // Firma cell. Null when the family signed on paper / hasn't signed.
  firma_url: string | null;
}

export interface RoundActa {
  header: {
    nombre: string | null;
    num_albaran_ba: string[] | null;
    num_factura_carne: string[] | null;
    logos: string[];
    estado: string | null;
    num_familias: number;
    num_contactadas: number;
  };
  rows: RoundActaRow[];
}

/** Build the complete round roster for both acta variants (numeric order). */
export async function buildRoundActa(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  roundId: string,
): Promise<RoundActa> {
  const SENTINEL = "00000000-0000-0000-0000-000000000000";

  // Wave 1 — three independent reads, all keyed only on roundId. Fail loudly:
  // a swallowed error would print a blank legal acta as if the round had no families.
  const [aRes, rRes, sRes] = await Promise.all([
    db
      .from("delivery_round_assignments")
      .select(
        "id, family_id, expediente, total_miembros, kg_alimentos, kg_carne, assigned_day, turno, preferred_slot_ids, attended_slot_id, attended, estado_contacto",
      )
      .eq("round_id", roundId),
    db
      .from("delivery_rounds")
      .select("nombre, num_albaran_ba, num_factura_carne, logos, estado")
      .eq("id", roundId)
      .single(),
    db.from("delivery_round_slots").select("id, slot_date").eq("round_id", roundId),
  ]);
  if (aRes.error) throw new Error(`buildRoundActa: assignments query failed: ${aRes.error.message}`);
  if (rRes.error) throw new Error(`buildRoundActa: round query failed: ${rRes.error.message}`);
  if (sRes.error) throw new Error(`buildRoundActa: slots query failed: ${sRes.error.message}`);
  const rows = aRes.data ?? [];
  const round = rRes.data;
  const slotDate = new Map((sRes.data ?? []).map((s) => [s.id, s.slot_date as string]));

  const familyIds = [...new Set(rows.map((r) => r.family_id))];
  const assignmentIds = rows.map((r) => r.id);

  // Wave 2 — three independent reads that each need only the wave-1 ids.
  const [reps, fRes, auRes] = await Promise.all([
    resolveRepresentatives(db, familyIds),
    db
      .from("families")
      .select("id, familia_numero, num_adultos, num_menores_18")
      .in("id", familyIds.length ? familyIds : [SENTINEL]),
    db
      .from("reparto_signature_audit")
      .select("assignment_id, storage_path")
      .in("assignment_id", assignmentIds.length ? assignmentIds : [SENTINEL]),
  ]);
  if (fRes.error) throw new Error(`buildRoundActa: families query failed: ${fRes.error.message}`);
  const famById = new Map((fRes.data ?? []).map((f) => [f.id, f]));

  // Wave 3 — signed URLs for the captured signatures (final acta).
  const audits = auRes.data;
  const pathByAssignment = new Map((audits ?? []).map((a) => [a.assignment_id, a.storage_path as string]));
  const uniquePaths = [...new Set((audits ?? []).map((a) => a.storage_path as string).filter(Boolean))];
  const urlByPath = new Map<string, string>();
  if (uniquePaths.length > 0) {
    const { data: signed } = await db.storage.from("firmas-entregas").createSignedUrls(uniquePaths, 300);
    for (const s of signed ?? []) if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
  }
  const firmaUrlFor = (assignmentId: string): string | null => {
    const p = pathByAssignment.get(assignmentId);
    return p ? (urlByPath.get(p) ?? null) : null;
  };

  const actaRows: RoundActaRow[] = rows.map((r) => {
    const rep = reps.get(r.family_id);
    const fam = famById.get(r.family_id);
    const preferredDates = ((r.preferred_slot_ids as string[] | null) ?? [])
      .map((id) => slotDate.get(id))
      .filter((d): d is string => !!d)
      .sort();
    const contactada = preferredDates.length > 0 || (r.estado_contacto != null && r.estado_contacto !== "pendiente");
    const fecha1 = preferredDates[0] ?? r.assigned_day ?? null;
    const fecha2 = preferredDates[1] ?? null;
    return {
      assignment_id: r.id,
      estado_contacto: r.estado_contacto ?? null,
      preferred_slot_ids: (r.preferred_slot_ids as string[] | null) ?? [],
      familia_numero: fam?.familia_numero ?? null,
      expediente: r.expediente,
      nombre: rep?.nombre ?? null,
      apellidos: rep?.apellidos ?? null,
      dni: rep?.numero_documento ?? null,
      telefono: rep?.telefono ?? null,
      num_adultos: fam?.num_adultos ?? null,
      num_menores: fam?.num_menores_18 ?? null,
      total_miembros: r.total_miembros,
      kg_alimentos: r.kg_alimentos,
      kg_carne: r.kg_carne,
      fecha1,
      fecha2,
      contactada,
      // Only a genuine pickup (attended===true) prints a date. attended_slot_id is
      // also stamped on no-show marks, so a naive check would falsely attest that
      // an AUSENTE family collected on that day — a legal-acta defect.
      fecha_real: r.attended === true && r.attended_slot_id ? (slotDate.get(r.attended_slot_id) ?? null) : null,
      attended: r.attended,
      firma_url: firmaUrlFor(r.id),
    };
  });

  // Numeric order by familia_numero (nulls last) — the print requirement.
  actaRows.sort((a, b) => {
    const an = a.familia_numero ?? Number.POSITIVE_INFINITY;
    const bn = b.familia_numero ?? Number.POSITIVE_INFINITY;
    return an - bn;
  });

  return {
    header: {
      nombre: round?.nombre ?? null,
      num_albaran_ba: round?.num_albaran_ba ?? null,
      num_factura_carne: round?.num_factura_carne ?? null,
      logos: round?.logos ?? [],
      estado: round?.estado ?? null,
      num_familias: actaRows.length,
      num_contactadas: actaRows.filter((r) => r.contactada).length,
    },
    rows: actaRows,
  };
}
