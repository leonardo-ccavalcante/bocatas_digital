// narrativeComposer — builds a DRAFT "valoración social" narrative for the
// informe («DESCRIPCIÓN SITUACIÓN FAMILIAR»).
//
// It is a MERGE of (a) situation data already collected at person/family intake
// and (b) a summary of the family's follow-ups ("qué ha pasado"). The output is
// a starting point the coordinator reviews/edits before generating — it is NOT
// authoritative prose. Deterministic: no Date.now / locale-dependent formatting.
//
// RGPD: this composer deliberately does NOT accept the Art.9 high-risk fields
// (situacion_legal, recorrido_migratorio, notas_privadas). The coordinator adds
// any such content manually. `observaciones` / `necesidades_principales` are
// ordinary intake prose (not in HIGH_RISK_FIELDS) and are safe to include.

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
    observaciones: string | null;
    necesidades_principales: string | null;
    restricciones_alimentarias: string | null;
  };
  followUps: Array<{ fecha: string; notas: string | null }>;
};

function joinClauses(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => !!p && p.trim() !== "").join(" ");
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
  const origen = pais
    ? `La persona titular es de nacionalidad ${pais}${
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

  const extras = joinClauses([
    titular.necesidades_principales
      ? `Necesidades principales: ${titular.necesidades_principales.trim()}.`
      : null,
    titular.restricciones_alimentarias
      ? `Restricciones alimentarias: ${titular.restricciones_alimentarias.trim()}.`
      : null,
    titular.observaciones ? `Observaciones: ${titular.observaciones.trim()}.` : null,
  ]);

  return joinClauses([composicion, origen, socio, extras]);
}

/** Compose the "qué ha pasado" block from the family's follow-ups. */
function composeSeguimientos(followUps: NarrativeInput["followUps"]): string | null {
  const withNotes = followUps
    .filter((f) => f.notas && f.notas.trim() !== "")
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)); // desc, stable
  if (withNotes.length === 0) return null;
  const lines = withNotes.map((f) => `- ${fmtDate(f.fecha)}: ${(f.notas ?? "").trim()}`);
  return `Seguimiento:\n${lines.join("\n")}`;
}

/**
 * composeSituacionFamiliar — the draft «DESCRIPCIÓN SITUACIÓN FAMILIAR».
 * Returns a two-block Spanish string (situación de intake + seguimientos).
 */
export function composeSituacionFamiliar(input: NarrativeInput): string {
  const situacion = composeSituacion(input);
  const seguimientos = composeSeguimientos(input.followUps);
  return [situacion, seguimientos].filter((b): b is string => !!b).join("\n\n");
}
