// informeBulkData — fetches, for every ACTIVE family in the Programa de Familia,
// the data needed to evaluate informe readiness (see informeEligibility).
//
// "Active families roster" == the Programa de Familia roster (the families table
// is the program; no per-family program_id filter — matches families.getAll and
// the operator's "todas las familias activas" intent).
//
// Batched (3 queries: families + follow-ups + members) to avoid N+1. Pure
// data-fetching; readiness logic lives in informeEligibility.

import type { createAdminClient } from "../../client/src/lib/supabase/server";
import { informeNeedsRenewal } from "@shared/informeFreshness";
import {
  evaluateInformeReadiness,
  type InformeReadiness,
  type InformeReadinessInput,
} from "./informeEligibility";

type Db = ReturnType<typeof createAdminClient>;

export type FamilyReadinessRow = {
  family_id: string;
  familia_numero: string;
  readiness: InformeReadiness;
};

const CHUNK = 100;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Fetch + evaluate readiness for every active family. */
export async function fetchActiveFamiliesReadiness(db: Db): Promise<FamilyReadinessRow[]> {
  const { data: families, error } = await db
    .from("families")
    .select(
      `id, familia_numero, titular_id, situacion_familiar_texto, informe_social_fecha,
       persons!titular_id(nombre, apellidos, numero_documento)`,
    )
    .eq("estado", "activa")
    .is("deleted_at", null)
    .order("familia_numero", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = families ?? [];
  const ids = rows.map((r) => r.id as string);

  // Batched latest-follow-up per family (max fecha).
  const latestFollowUp = new Map<string, string>();
  for (const ids100 of chunk(ids, CHUNK)) {
    const { data, error: fuErr } = await db
      .from("family_follow_ups")
      .select("family_id, fecha")
      .in("family_id", ids100)
      .is("deleted_at", null)
      .order("fecha", { ascending: false });
    // A silent [] here would mislabel families as SIN_SEGUIMIENTO — fail loudly.
    if (fuErr) throw new Error(`follow-ups fetch failed: ${fuErr.message}`);
    for (const f of data ?? []) {
      const fid = f.family_id as string;
      if (!latestFollowUp.has(fid)) latestFollowUp.set(fid, f.fecha as string); // first = newest
    }
  }

  // Batched members per family.
  const members = new Map<string, InformeReadinessInput["members"]>();
  for (const ids100 of chunk(ids, CHUNK)) {
    const { data, error: memErr } = await db
      .from("familia_miembros")
      .select("familia_id, nombre, apellidos, fecha_nacimiento")
      .in("familia_id", ids100)
      .is("deleted_at", null);
    // A silent [] would mark families READY with zero members — fail loudly.
    if (memErr) throw new Error(`members fetch failed: ${memErr.message}`);
    for (const m of data ?? []) {
      const fid = m.familia_id as string;
      const list = members.get(fid) ?? [];
      list.push({ nombre: m.nombre, apellidos: m.apellidos, fecha_nacimiento: m.fecha_nacimiento });
      members.set(fid, list);
    }
  }

  return rows.map((r) => {
    const titularRaw = Array.isArray(r.persons) ? r.persons[0] : r.persons;
    const input: InformeReadinessInput = {
      titular_id: (r.titular_id as string | null) ?? null,
      titular: titularRaw
        ? {
            nombre: titularRaw.nombre,
            apellidos: titularRaw.apellidos,
            numero_documento: titularRaw.numero_documento,
          }
        : null,
      situacion_familiar_texto: (r.situacion_familiar_texto as string | null) ?? null,
      latest_follow_up_fecha: latestFollowUp.get(r.id as string) ?? null,
      members: members.get(r.id as string) ?? [],
    };
    const readiness = evaluateInformeReadiness(input);
    // Policy layer (on top of render-ability): a renderable family whose informe
    // is still valid (< 5 months) is skipped as INFORME_AL_DIA — the bulk tool
    // only fills gaps and renews informes due for review / expired.
    const finalReadiness: InformeReadiness =
      readiness.ready &&
      !informeNeedsRenewal((r.informe_social_fecha as string | null) ?? null)
        ? { ready: false, reason: "INFORME_AL_DIA" }
        : readiness;
    return {
      family_id: r.id as string,
      familia_numero: String(r.familia_numero).padStart(4, "0"),
      readiness: finalReadiness,
    };
  });
}
