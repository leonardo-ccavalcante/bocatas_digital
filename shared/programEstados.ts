/**
 * programEstados.ts — single source of truth for the program-tree vocabulary:
 * node types (tipo) and the global enrollment-state catalog.
 *
 * Decisions (grill 2026-07-23, Leo): ONE global catalog — each program enables
 * the subset it uses (`programs.estados_habilitados`), so reports stay
 * comparable across programs. `baja` always requires a motivo. Waiting lists
 * are a STATE, never a separate page/node. Program types are presets over the
 * generic tree, not different schemas.
 */

/** Canonical enrollment states, in funnel order. */
export const ESTADOS_INSCRIPCION = [
  "inscrito",
  "preseleccionado",
  "admitido",
  "lista_espera",
  "activo",
  "pausado",
  "baja",
  "terminado",
] as const;

/** Legacy states still present in old rows (reports treat completado ≡ terminado). */
export const ESTADOS_LEGACY = ["completado", "rechazado"] as const;

export type EstadoInscripcion = (typeof ESTADOS_INSCRIPCION)[number];
export type EstadoInscripcionAny =
  | EstadoInscripcion
  | (typeof ESTADOS_LEGACY)[number];

/** Every value `programs.estados_habilitados` may contain (mirrors the DB CHECK).
 * Kept as a literal tuple so z.enum() and typed .eq() calls keep the union. */
export const ESTADOS_CATALOGO = [...ESTADOS_INSCRIPCION, ...ESTADOS_LEGACY] as const;

export const ESTADO_LABELS: Record<EstadoInscripcionAny, string> = {
  inscrito: "Inscrito",
  preseleccionado: "Preseleccionado",
  admitido: "Admitido",
  lista_espera: "Lista de espera",
  activo: "Activo",
  pausado: "Pausado",
  baja: "Baja",
  terminado: "Terminado",
  completado: "Terminado",
  rechazado: "Rechazado",
};

/** States that close an enrollment (set fecha_fin when entered). */
export const ESTADOS_FINALES: readonly EstadoInscripcionAny[] = [
  "baja",
  "terminado",
  "completado",
  "rechazado",
];

/** Node types of the program tree (presets, not schemas). */
export const TIPOS_PROGRAMA = [
  "contenedor",
  "curso",
  "edicion",
  "continuo",
  "actividad",
  "basico",
] as const;

export type TipoPrograma = (typeof TIPOS_PROGRAMA)[number];

export const TIPO_LABELS: Record<TipoPrograma, string> = {
  contenedor: "Contenedor (paraguas)",
  curso: "Curso (con ediciones)",
  edicion: "Edición / promoción",
  continuo: "Flujo continuo",
  actividad: "Actividad (conteo anónimo)",
  basico: "Básico",
};

/** Creation-form presets per tipo: default states + whether people enroll here. */
export const TIPO_PRESETS: Record<
  TipoPrograma,
  { inscribible: boolean; estados: EstadoInscripcion[] }
> = {
  contenedor: { inscribible: false, estados: [] },
  curso: { inscribible: false, estados: [] },
  edicion: {
    inscribible: true,
    estados: [
      "inscrito",
      "preseleccionado",
      "admitido",
      "lista_espera",
      "activo",
      "baja",
      "terminado",
    ],
  },
  continuo: { inscribible: true, estados: ["activo", "pausado", "baja"] },
  actividad: { inscribible: false, estados: [] },
  basico: {
    inscribible: true,
    estados: ["activo", "pausado", "baja", "terminado"],
  },
};

/** Initial state for a new enrollment given a program's enabled states. */
export function estadoInicial(estadosHabilitados: readonly string[]): EstadoInscripcion {
  if (estadosHabilitados.includes("activo")) return "activo";
  const first = ESTADOS_INSCRIPCION.find((e) => estadosHabilitados.includes(e));
  return first ?? "activo";
}
