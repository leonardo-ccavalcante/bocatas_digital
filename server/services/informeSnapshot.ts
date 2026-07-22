// informeSnapshot — captures a structured snapshot of a family's socioeconomic
// situation at each informe generation and diffs consecutive snapshots, so a
// renewal can SHOW how the person/family changed (empleo, vivienda, …) and the
// history accumulates in the DB for longitudinal tracking.
//
// The snapshot lives in families.metadata.informe_historial (JSONB, no schema
// migration). Each entry: { fecha, situacion, cambios }. Only NON-Art.9
// socioeconomic fields are captured — never situacion_legal / free-text notes.

export type SituacionSnapshot = {
  tipo_vivienda: string | null;
  situacion_laboral: string | null;
  nivel_ingresos: string | null;
  nivel_estudios: string | null;
  empadronado: boolean | null;
  direccion: string | null;
  num_adultos: number | null;
  num_menores_18: number | null;
};

/** A single detected change, with human-readable Spanish before/after values. */
export type Cambio = { campo: string; antes: string; ahora: string };

export type HistorialEntry = {
  fecha: string; // ISO YYYY-MM-DD
  situacion: SituacionSnapshot;
  cambios: Cambio[];
};

// ── Concise Spanish labels (short — for the "antes → ahora" diff, not prose) ──
const VIVIENDA: Record<string, string> = {
  calle: "situación de calle",
  albergue: "albergue",
  piso_compartido_alquiler: "piso compartido en alquiler",
  piso_propio_alquiler: "piso en alquiler",
  piso_propio_propiedad: "vivienda en propiedad",
  ocupacion_sin_titulo: "ocupación sin título",
  pension: "pensión",
  asentamiento: "asentamiento",
  centro_acogida: "centro de acogida",
  otros: "otra vivienda",
};
const LABORAL: Record<string, string> = {
  desempleado: "desempleo",
  economia_informal: "economía informal",
  empleo_temporal: "empleo temporal",
  empleo_indefinido: "empleo indefinido",
  autonomo: "autónomo/a",
  en_formacion: "en formación",
  jubilado: "jubilado/a",
  incapacidad_permanente: "incapacidad permanente",
  sin_permiso_trabajo: "sin permiso de trabajo",
};
const INGRESOS: Record<string, string> = {
  sin_ingresos: "sin ingresos",
  menos_500: "< 500€/mes",
  entre_500_1000: "500–1.000€/mes",
  entre_1000_1500: "1.000–1.500€/mes",
  mas_1500: "> 1.500€/mes",
};
const ESTUDIOS: Record<string, string> = {
  sin_estudios: "sin estudios",
  primaria: "primaria",
  secundaria: "secundaria",
  bachillerato: "bachillerato",
  formacion_profesional: "formación profesional",
  universitario: "estudios universitarios",
  postgrado: "postgrado",
};

function labelFrom(map: Record<string, string>, v: string | null): string {
  if (!v) return "—";
  return map[v] ?? v;
}

type FieldDef = { key: keyof SituacionSnapshot; campo: string; display: (v: unknown) => string };

const FIELDS: FieldDef[] = [
  { key: "situacion_laboral", campo: "Empleo", display: (v) => labelFrom(LABORAL, v as string | null) },
  { key: "tipo_vivienda", campo: "Vivienda", display: (v) => labelFrom(VIVIENDA, v as string | null) },
  { key: "nivel_ingresos", campo: "Ingresos", display: (v) => labelFrom(INGRESOS, v as string | null) },
  { key: "nivel_estudios", campo: "Estudios", display: (v) => labelFrom(ESTUDIOS, v as string | null) },
  {
    key: "empadronado",
    campo: "Empadronamiento",
    display: (v) => (v === true ? "Sí" : v === false ? "No" : "—"),
  },
  { key: "direccion", campo: "Dirección", display: (v) => (v ? String(v).trim() : "—") },
  { key: "num_adultos", campo: "Nº adultos", display: (v) => (v == null ? "—" : String(v)) },
  { key: "num_menores_18", campo: "Nº menores", display: (v) => (v == null ? "—" : String(v)) },
];

/**
 * Diff two snapshots into a list of human-readable changes. Returns [] when
 * there is no previous snapshot (first informe) or nothing changed.
 */
export function computeSituacionChanges(
  prev: SituacionSnapshot | null | undefined,
  curr: SituacionSnapshot,
): Cambio[] {
  if (!prev) return [];
  const out: Cambio[] = [];
  for (const f of FIELDS) {
    const a = prev[f.key] ?? null;
    const b = curr[f.key] ?? null;
    if (a !== b) out.push({ campo: f.campo, antes: f.display(a), ahora: f.display(b) });
  }
  return out;
}

// ── metadata.informe_historial helpers (pure) ────────────────────────────────

type Metadata = Record<string, unknown>;

export function getInformeHistorial(metadata: Metadata | null | undefined): HistorialEntry[] {
  const raw = (metadata ?? {})["informe_historial"];
  return Array.isArray(raw) ? (raw as HistorialEntry[]) : [];
}

/** The most recent stored snapshot, or null when there is no history yet. */
export function lastSnapshot(metadata: Metadata | null | undefined): SituacionSnapshot | null {
  const h = getInformeHistorial(metadata);
  return h.length > 0 ? h[h.length - 1].situacion : null;
}

/** Return a new metadata object with `entry` appended to informe_historial. */
export function appendHistorial(
  metadata: Metadata | null | undefined,
  entry: HistorialEntry,
): Metadata {
  const base = { ...(metadata ?? {}) };
  base["informe_historial"] = [...getInformeHistorial(metadata), entry];
  return base;
}
