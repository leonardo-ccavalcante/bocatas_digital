// documentContextBuilder — assembles FamilyDocumentContext from the DB for renderDocument.
//
// This is the data-fetching layer for E1 document generation.
// No PII in thrown errors — use UUIDs/IDs only.

import { TRPCError } from "@trpc/server";
import type { createAdminClient } from "../../client/src/lib/supabase/server";
import type { FamilyDocumentContext } from "./documentService.types";
import { computeDeliveryRow } from "./notaEntregaComputer";

// ── Types ─────────────────────────────────────────────────────────────────────

type Db = ReturnType<typeof createAdminClient>;

/** Shape of program_sessions.session_data.rates JSONB (E1 plan §H assumption #1). */
type SessionRates = {
  per_member_rate_fyh?: number;
  per_member_rate_carne?: number;
  per_member_rate_infantil?: number;
  per_member_rate_unidades?: number;
};

/** Session metadata fields stored in session_data (top-level, optional). */
type SessionMeta = {
  rates?: SessionRates;
  albaran_entrada?: string;
  numero_factura_carne?: string;
  codigo_consumo?: string;
  mes_fecha?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function coerce(v: string | null | undefined): string {
  return v ?? "";
}

function coerceNumber(v: number | null | undefined): number {
  return v ?? 0;
}

// ISO-2 → Spanish country name (mirrors client reports-tab/utils/paisLabel;
// inlined server-side to avoid a client→server import).
const regionNames: Intl.DisplayNames | null = (() => {
  try {
    return new Intl.DisplayNames(["es"], { type: "region" });
  } catch {
    return null;
  }
})();

function paisEs(code: string | null | undefined): string {
  if (!code) return "";
  const up = code.toUpperCase();
  if (regionNames) {
    try {
      const n = regionNames.of(up);
      if (n && n !== up) return n;
    } catch {
      /* fall through to code */
    }
  }
  return up;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * buildFamilyDataContext — fetches all DB data and assembles a FamilyDocumentContext.
 *
 * @param db           - Supabase admin client (passed in; no internal instantiation).
 * @param familyId     - UUID of the familia row.
 * @param opts.slug    - Document type. Defaults to "informe_social".
 * @param opts.programSessionId - Required for nota_entrega.
 */
export async function buildFamilyDataContext(
  db: Db,
  familyId: string,
  opts?: {
    slug?: "informe_social" | "nota_entrega" | "derivacion";
    programSessionId?: string;
  }
): Promise<FamilyDocumentContext> {
  const slug = opts?.slug ?? "informe_social";

  // ── 1. Fetch the family row with titular join ─────────────────────────────

  const { data: family, error: familyError } = await db
    .from("families")
    .select(
      `id, familia_numero, num_adultos, num_menores_18, distrito, codigo_postal, estado,
       fecha_alta, situacion_familiar_texto,
       persons!titular_id(nombre, apellidos, numero_documento, telefono,
                          pais_origen, fecha_nacimiento, direccion)`
    )
    .eq("id", familyId)
    .is("deleted_at", null)
    .single();

  if (familyError || !family) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Familia no encontrada" });
  }

  // Supabase returns the joined person as a single object (not an array) when
  // the FK is singular.  The generated types may show it as an array — narrow
  // to the first element safely.
  const titularRaw = Array.isArray(family.persons)
    ? family.persons[0]
    : family.persons;

  const titular: FamilyDocumentContext["titular"] = {
    nombre: coerce(titularRaw?.nombre),
    apellidos: coerce(titularRaw?.apellidos),
    documento: coerce(titularRaw?.numero_documento),
    telefono: coerce(titularRaw?.telefono),
    // Informe-only fields (blank for other slugs; nullGetter renders "").
    pais: paisEs(titularRaw?.pais_origen),
    fecha_nacimiento: coerce(titularRaw?.fecha_nacimiento),
    direccion: coerce(titularRaw?.direccion),
  };

  const numAdultos = coerceNumber(family.num_adultos);
  const numMenores = coerceNumber(family.num_menores_18);

  const familiaBlock: FamilyDocumentContext["familia"] = {
    numero: String(family.familia_numero).padStart(4, "0"),
    num_adultos: numAdultos,
    num_menores_18: numMenores,
    // Cross-document-consistent total (same value nota_entrega uses). Members
    // count staleness is a separate data-integrity concern, not fixed here.
    total_miembros: numAdultos + numMenores,
    distrito: family.distrito ?? null,
    codigo_postal: family.codigo_postal ?? null,
    estado: coerce(family.estado),
    fecha_alta: coerce(family.fecha_alta),
  };

  // ── 2. Fetch familia_miembros (non-deleted) ───────────────────────────────

  const { data: miembrosRaw } = await db
    .from("familia_miembros")
    .select("nombre, apellidos, relacion, fecha_nacimiento, documento")
    .eq("familia_id", familyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const miembros: FamilyDocumentContext["miembros"] = (miembrosRaw ?? []).map((m, i) => ({
    nombre: coerce(m.nombre),
    apellidos: coerce(m.apellidos),
    // DB column is `relacion` (confirmed from database.types.ts)
    parentesco: coerce(m.relacion),
    fecha_nacimiento: m.fecha_nacimiento ?? null,
    // Informe member loop: dependents are numbered from 2 (titular is member 1).
    numero: i + 2,
    documento: coerce(m.documento),
  }));

  // ── 3. Slug-specific data ─────────────────────────────────────────────────

  let informeBlock: FamilyDocumentContext["informe"] | undefined;
  let roundBlock: FamilyDocumentContext["round"] | undefined;

  if (slug === "informe_social" || slug === "derivacion") {
    // Fetch up to last 3 follow-ups, ordered by fecha DESC
    const { data: followUps } = await db
      .from("family_follow_ups")
      .select("fecha, notas")
      .eq("family_id", familyId)
      .is("deleted_at", null)
      .order("fecha", { ascending: false })
      .limit(3);

    const ups = followUps ?? [];
    const mostRecentFecha = ups.length > 0 ? coerce(ups[0].fecha) : "";
    const notasConcatenated = ups
      .map((u) => coerce(u.notas))
      .filter((n) => n !== "")
      .join("\n");

    informeBlock = {
      fecha_seguimiento: mostRecentFecha,
      notas_seguimiento: notasConcatenated,
      effective_date: mostRecentFecha,
    };
  }

  if (slug === "nota_entrega") {
    const programSessionId = opts?.programSessionId;
    if (!programSessionId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "programSessionId es obligatorio para nota_entrega",
      });
    }

    // Fetch the program session
    const { data: session, error: sessionError } = await db
      .from("program_sessions")
      .select("id, fecha, session_data")
      .eq("id", programSessionId)
      .single();

    if (sessionError || !session) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Sesión de entrega no encontrada" });
    }

    // Parse session_data — it's untyped JSONB
    const sessionData = (session.session_data ?? {}) as SessionMeta;
    const rates: Required<SessionRates> = {
      per_member_rate_fyh: sessionData.rates?.per_member_rate_fyh ?? 0,
      per_member_rate_carne: sessionData.rates?.per_member_rate_carne ?? 0,
      per_member_rate_infantil: sessionData.rates?.per_member_rate_infantil ?? 0,
      per_member_rate_unidades: sessionData.rates?.per_member_rate_unidades ?? 0,
    };

    // Fetch deliveries for this session, joining each delivery's family with titular
    // Assumption: all families in the round are those with deliveries.session_id = programSessionId.
    // We join families + their titular persons to build MemberDeliveryRow for each family.
    const { data: deliveries, error: deliveriesError } = await db
      .from("deliveries")
      .select(
        `family_id, fecha_entrega,
         families!family_id(
           id, familia_numero, num_adultos, num_menores_18,
           persons!titular_id(nombre, apellidos, numero_documento, telefono)
         )`
      )
      .eq("session_id", programSessionId)
      .is("deleted_at", null);

    if (deliveriesError) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Error al cargar entregas de la sesión",
      });
    }

    const rows = (deliveries ?? []).map((delivery) => {
      const fam = Array.isArray(delivery.families) ? delivery.families[0] : delivery.families;
      const titularD = Array.isArray(fam?.persons) ? fam.persons[0] : fam?.persons;

      return computeDeliveryRow(
        {
          familia_numero: coerceNumber(fam?.familia_numero),
          titular_nombre: coerce(titularD?.nombre),
          titular_apellidos: coerce(titularD?.apellidos),
          titular_documento: coerce(titularD?.numero_documento),
          titular_telefono: coerce(titularD?.telefono),
          num_adultos: coerceNumber(fam?.num_adultos),
          num_menores_18: coerceNumber(fam?.num_menores_18),
          fecha: coerce(delivery.fecha_entrega),
        },
        rates
      );
    });

    const totalKgFyh = rows.reduce((s, r) => s + r.kg_frutas_hortalizas, 0);
    const totalKgCarne = rows.reduce((s, r) => s + r.kg_carne, 0);
    const totalKgInfantil = rows.reduce((s, r) => s + r.kg_infantil, 0);
    const totalUnidades = rows.reduce((s, r) => s + r.unidades_no_alimentacion, 0);

    roundBlock = {
      header: {
        albaran_entrada: coerce(sessionData.albaran_entrada),
        numero_factura_carne: coerce(sessionData.numero_factura_carne),
        codigo_consumo: coerce(sessionData.codigo_consumo),
        mes_fecha: coerce(sessionData.mes_fecha),
        total_familias: rows.length,
        total_kg_fyh: totalKgFyh,
        total_kg_carne: totalKgCarne,
        total_kg_infantil: totalKgInfantil,
        total_unidades_no_alimentacion: totalUnidades,
        per_member_rate_fyh: rates.per_member_rate_fyh,
        per_member_rate_carne: rates.per_member_rate_carne,
        per_member_rate_infantil: rates.per_member_rate_infantil,
        per_member_rate_unidades: rates.per_member_rate_unidades,
      },
      rows,
    };
  }

  // ── 4. Assemble and return ────────────────────────────────────────────────

  return {
    titular,
    familia: familiaBlock,
    miembros,
    informe: informeBlock,
    round: roundBlock,
    // «DESCRIPCIÓN SITUACIÓN FAMILIAR» — the edited valoración draft. Empty when
    // unset → declared placeholder → validateContext blocks generation.
    valoracion: coerce(family.situacion_familiar_texto),
    logos: [],
    static_blocks: {},
    generated_at: new Date().toISOString(),
    generated_by_name: "",
  };
}
