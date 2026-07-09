// narrativeComposer — builds a DRAFT for the informe's only narrative field,
// «DESCRIPCIÓN SITUACIÓN FAMILIAR», whose label in the official template is
// "Resumen situación socioeconómica". The draft is therefore a SOCIOECONOMIC
// summary, not a labelled dump of every intake field.
//
// It is a MERGE of (a) the socioeconomic situation collected at person/family
// intake and (b) a deduplicated summary of the family's follow-ups ("qué ha
// pasado"). The output is a starting point the coordinator reviews/edits before
// generating — it is NOT authoritative prose. Deterministic: no Date.now /
// locale-dependent formatting.
//
// Scope (matches the official template — see reference/Plantilla_Informes):
//  • INCLUDED: household composition, nationality/arrival, housing, employment,
//    income, education, empadronamiento, principal needs, coordinator notes.
//  • EXCLUDED — dietary restrictions (restricciones_alimentarias): the template
//    handles "alergias, enfermedades o circunstancias excepcionales" in the fixed
//    "NECESIDADES ESPECÍFICAS Y PROPUESTA" boilerplate, NOT in the socioeconomic
//    résumé. Putting them here is off-script.
//  • EXCLUDED — observaciones (the interviewer's intake notes): these are INTERNAL
//    working annotations of the staff member, not content for an official document.
//    Only necesidades_principales (the family's principal needs) is kept as
//    free-text intake prose.
//  • EXCLUDED (RGPD Art.9): situacion_legal, recorrido_migratorio, notas_privadas
//    are not even accepted as input; the coordinator adds any such content by hand.

// ── Spanish enum labels (inlined; mirror client persons/schemas/labels.ts —
//    duplicated on purpose to avoid a client→server import) ──
const TIPO_VIVIENDA: Record<string, string> = {
  calle: "en situación de calle / sin techo",
  albergue: "en un albergue",
  piso_compartido_alquiler: "en un piso compartido en alquiler",
  piso_propio_alquiler: "en un piso propio en alquiler",
  piso_propio_propiedad: "en vivienda en propiedad",
  ocupacion_sin_titulo: "en una ocupación sin título",
  pension: "en una pensión",
  asentamiento: "en un asentamiento",
  centro_acogida: "en un centro de acogida",
  otros: "en otro tipo de vivienda",
};
const SITUACION_LABORAL: Record<string, string> = {
  desempleado: "en situación de desempleo",
  economia_informal: "en la economía informal",
  empleo_temporal: "con empleo temporal",
  empleo_indefinido: "con empleo indefinido",
  autonomo: "como autónomo/a",
  en_formacion: "en formación",
  jubilado: "jubilado/a",
  incapacidad_permanente: "en situación de incapacidad permanente",
  sin_permiso_trabajo: "sin permiso de trabajo",
};
const NIVEL_INGRESOS: Record<string, string> = {
  sin_ingresos: "sin ingresos",
  menos_500: "menos de 500€ mensuales",
  entre_500_1000: "entre 500 y 1.000€ mensuales",
  entre_1000_1500: "entre 1.000 y 1.500€ mensuales",
  mas_1500: "más de 1.500€ mensuales",
};
const NIVEL_ESTUDIOS: Record<string, string> = {
  sin_estudios: "sin estudios",
  primaria: "estudios primarios",
  secundaria: "estudios secundarios",
  bachillerato: "bachillerato",
  formacion_profesional: "formación profesional",
  universitario: "estudios universitarios",
  postgrado: "postgrado",
};

// ── ISO-2 → Spanish country name (mirrors reports-tab/utils/paisLabel) ──
const regionNames: Intl.DisplayNames | null = (() => {
  try {
    return new Intl.DisplayNames(["es"], { type: "region" });
  } catch {
    return null;
  }
})();

function paisEs(code: string | null | undefined): string | null {
  if (!code) return null;
  const up = code.toUpperCase();
  if (regionNames) {
    try {
      const n = regionNames.of(up);
      if (n && n !== up) return n;
    } catch {
      /* fall through */
    }
  }
  return up;
}

/** Format an ISO (YYYY-MM-DD) date to DD/MM/YYYY without timezone drift. */
function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export type NarrativeInput = {
  familia: {
    num_adultos: number | null;
    num_menores_18: number | null;
    distrito: string | null;
  };
  titular: {
    pais_origen: string | null;
    fecha_llegada_espana: string | null;
    tipo_vivienda: string | null;
    situacion_laboral: string | null;
    nivel_ingresos: string | null;
    nivel_estudios: string | null;
    empadronado: boolean | null;
    necesidades_principales: string | null;
  };
  followUps: Array<{ fecha: string; notas: string | null }>;
  /** Structured changes since the last informe (empleo, vivienda, …), if any. */
  cambios?: Array<{ campo: string; antes: string; ahora: string }>;
  /** Date of the previous informe, for the "Cambios desde…" heading. */
  ultimoInformeFecha?: string | null;
};

function joinClauses(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => !!p && p.trim() !== "").join(" ");
}

/**
 * Terminate a free-text fragment with exactly one sentence mark. Coordinator
 * notes frequently already end in "." / "!" / "?"; appending another "." would
 * produce ".." in a legal document.
 */
function endSentence(s: string): string {
  const t = s.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/** Compose the intake block: family composition + titular situation. */
function composeSituacion(input: NarrativeInput): string {
  const { familia, titular } = input;
  const adultos = familia.num_adultos ?? 0;
  const menores = familia.num_menores_18 ?? 0;

  const composicion = `La unidad familiar está compuesta por ${adultos} ${
    adultos === 1 ? "persona adulta" : "personas adultas"
  }${menores > 0 ? ` y ${menores} ${menores === 1 ? "menor" : "menores"}` : ""}${
    familia.distrito ? `, con residencia en el distrito de ${familia.distrito}` : ""
  }.`;

  const pais = paisEs(titular.pais_origen);
  const llegada = fmtDate(titular.fecha_llegada_espana);
  // "procede de {país}" avoids the gentilicio problem (Intl gives country names,
  // not demonyms) and stays gender-neutral, unlike "de nacionalidad {país}".
  const origen = pais
    ? `La persona titular procede de ${pais}${
        llegada ? ` y llegó a España el ${llegada}` : ""
      }.`
    : null;

  const vivienda = titular.tipo_vivienda ? TIPO_VIVIENDA[titular.tipo_vivienda] : null;
  const laboral = titular.situacion_laboral ? SITUACION_LABORAL[titular.situacion_laboral] : null;
  const ingresos = titular.nivel_ingresos ? NIVEL_INGRESOS[titular.nivel_ingresos] : null;
  const estudios = titular.nivel_estudios ? NIVEL_ESTUDIOS[titular.nivel_estudios] : null;

  const socio = joinClauses([
    vivienda ? `Reside ${vivienda}.` : null,
    laboral || ingresos
      ? `Se encuentra ${laboral ?? "en situación laboral no especificada"}${
          ingresos ? `, con ingresos ${ingresos}` : ""
        }.`
      : null,
    estudios ? `Tiene ${estudios}.` : null,
    titular.empadronado === true
      ? "Consta empadronada."
      : titular.empadronado === false
        ? "No consta empadronada."
        : null,
  ]);

  // Dietary restrictions and the interviewer's `observaciones` are intentionally
  // NOT emitted here — see the module header. Only the family's principal needs
  // belong in this socioeconomic résumé.
  const extras = joinClauses([
    titular.necesidades_principales
      ? `Necesidades principales: ${endSentence(titular.necesidades_principales)}`
      : null,
  ]);

  return joinClauses([composicion, origen, socio, extras]);
}

/**
 * Compose the "qué ha pasado" block from the family's follow-ups.
 * Deduplicates exact repeats (same date + same note) and keeps the 5 most recent
 * DISTINCT entries — a legal résumé must never list the identical line twice, and
 * the draft is a scaffold for the coordinator, not an exhaustive contact log.
 */
function composeSeguimientos(followUps: NarrativeInput["followUps"]): string | null {
  const withNotes = followUps
    .filter((f) => f.notas && f.notas.trim() !== "")
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)); // desc, stable

  const seen = new Set<string>();
  const distinct: NarrativeInput["followUps"] = [];
  for (const f of withNotes) {
    const key = `${f.fecha}|${(f.notas ?? "").trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(f);
  }
  if (distinct.length === 0) return null;

  const lines = distinct
    .slice(0, 5)
    .map((f) => `- ${fmtDate(f.fecha)}: ${(f.notas ?? "").trim()}`);
  return `Seguimiento del proceso:\n${lines.join("\n")}`;
}

/** Compose the "Cambios desde el último informe" block (renewal diff). */
function composeCambios(input: NarrativeInput): string | null {
  const cambios = input.cambios ?? [];
  if (cambios.length === 0) return null;
  const fecha = fmtDate(input.ultimoInformeFecha);
  const header = fecha
    ? `Cambios desde el último informe (${fecha}):`
    : "Cambios desde el último informe:";
  const lines = cambios.map((c) => `- ${c.campo}: ${c.antes} → ${c.ahora}`);
  return `${header}\n${lines.join("\n")}`;
}

/**
 * composeSituacionFamiliar — the draft «DESCRIPCIÓN SITUACIÓN FAMILIAR».
 * Blocks (in order): situación de intake · cambios desde el último informe ·
 * seguimientos ("qué ha pasado"). Cambios/seguimientos are omitted when empty.
 */
export function composeSituacionFamiliar(input: NarrativeInput): string {
  const situacion = composeSituacion(input);
  const cambios = composeCambios(input);
  const seguimientos = composeSeguimientos(input.followUps);
  return [situacion, cambios, seguimientos].filter((b): b is string => !!b).join("\n\n");
}
