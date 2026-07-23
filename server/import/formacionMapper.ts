/**
 * formacionMapper.ts — maps parsed Notion fichas onto the ADR-0013 program
 * tree (curso + edición nodes under the existing 'formacion' program) and
 * derives one enrollment per (person, edición).
 *
 * Pure function: no I/O. Tokens that do not match the edition grammar are
 * NEVER guessed — they land in `unmapped` for stakeholder review.
 */
import type { EstadoInscripcion } from "../../shared/programEstados";
import type { Ficha } from "./notionFicha";

export interface PersonRef {
  titulo: string;
  nombre: string;
  apellidos: string;
  numeroDoc: string;
}

export interface NodeSpec {
  slug: string;
  name: string;
  tipo: "curso" | "edicion";
  parentSlug: string;
  etiquetas: string[];
}

export interface EnrollmentSpec {
  person: PersonRef;
  editionSlug: string;
  estado: EstadoInscripcion;
  motivoBaja?: string;
  metadata?: Record<string, string>;
}

export interface UnmappedToken {
  person: PersonRef;
  token: string;
}

export interface ImportPlan {
  cursos: NodeSpec[];
  ediciones: NodeSpec[];
  enrollments: EnrollmentSpec[];
  unmapped: UnmappedToken[];
  warnings: string[];
}

/** Edition token grammar: "2025/09 ESP", optionally suffixed " L.Espera". */
const EDITION_TOKEN = /^(\d{4})\/(\d{2}) (ESP|CAM|COC|PAN)( L\.Espera)?$/;

type CursoCode = "ESP" | "CAM" | "COC" | "PAN";

const CURSO_CATALOG: Record<CursoCode, { slug: string; name: string; etiquetas: string[] }> = {
  ESP: { slug: "clases_espanol", name: "Clases de Español", etiquetas: ["espanol"] },
  CAM: { slug: "curso_camarero", name: "Curso de Camarero", etiquetas: [] },
  COC: { slug: "curso_cocina", name: "Curso de Cocina", etiquetas: [] },
  PAN: { slug: "curso_panaderia", name: "Curso de Panadería y Repostería", etiquetas: [] },
};

const MOTIVO_BAJA_IMPORT = "importado de Notion";

/** Person-level estado fields → refinement of the MOST RECENT edition of that curso. */
const ESTADO_FIELD_MAP: Record<string, { curso: CursoCode; valores: Record<string, EstadoInscripcion> }> = {
  "Estado Curso Español": { curso: "ESP", valores: { baja: "baja", admitido: "admitido" } },
  "Estado Curso Camarero": {
    curso: "CAM",
    valores: { terminado: "terminado", preseleccionado: "preseleccionado", baja: "baja" },
  },
};

const GRUPO_KEY = "GRUPO (ESPAÑOL)";

interface ParsedEdition {
  curso: CursoCode;
  period: number; // yyyy * 100 + mm, for recency ordering
  espera: boolean;
  slug: string;
  name: string;
}

function parseEditionToken(token: string): ParsedEdition | null {
  const m = EDITION_TOKEN.exec(token);
  if (!m) return null;
  const [, yyyy, mm, curso, espera] = m;
  // The alternation in EDITION_TOKEN guarantees this; the check keeps the
  // narrowing honest without a type assertion.
  if (curso !== "ESP" && curso !== "CAM" && curso !== "COC" && curso !== "PAN") return null;
  return {
    curso,
    period: Number(yyyy) * 100 + Number(mm),
    espera: espera !== undefined,
    slug: `${curso.toLowerCase()}_${yyyy}_${mm}`,
    name: `${yyyy}/${mm} ${curso}`,
  };
}

/** "Apellidos, N." — the only person form allowed on stdout. */
export function personInitials(person: PersonRef): string {
  const inicial = person.nombre.trim().charAt(0);
  return `${person.apellidos.trim() || "?"}, ${inicial ? `${inicial.toUpperCase()}.` : "?"}`;
}

function refineEstado(
  enrollment: EnrollmentSpec,
  estado: EstadoInscripcion,
): void {
  enrollment.estado = estado;
  if (estado === "baja") enrollment.motivoBaja = MOTIVO_BAJA_IMPORT;
}

/** Applies person-level estado fields + GRUPO metadata to the most recent editions. */
function applyPersonFields(
  ficha: Ficha,
  person: PersonRef,
  byEdition: Map<string, { parsed: ParsedEdition; enrollment: EnrollmentSpec }>,
  warnings: string[],
): void {
  const mostRecent = new Map<CursoCode, { parsed: ParsedEdition; enrollment: EnrollmentSpec }>();
  for (const entry of byEdition.values()) {
    const current = mostRecent.get(entry.parsed.curso);
    if (!current || entry.parsed.period > current.parsed.period) {
      mostRecent.set(entry.parsed.curso, entry);
    }
  }

  for (const [key, { curso, valores }] of Object.entries(ESTADO_FIELD_MAP)) {
    const raw = ficha.campos[key];
    if (raw === undefined || raw.trim() === "") continue;
    const target = mostRecent.get(curso);
    if (!target) {
      warnings.push(`${personInitials(person)}: "${key}: ${raw}" sin ediciones ${curso} — no aplicado`);
      continue;
    }
    const estado = valores[raw.trim().toLowerCase()];
    if (!estado) {
      warnings.push(`${personInitials(person)}: valor no reconocido "${key}: ${raw}" — no aplicado`);
      continue;
    }
    refineEstado(target.enrollment, estado);
  }

  const grupo = ficha.campos[GRUPO_KEY];
  if (grupo !== undefined && grupo.trim() !== "") {
    const esp = mostRecent.get("ESP");
    if (esp) {
      esp.enrollment.metadata = { ...esp.enrollment.metadata, grupo: grupo.trim() };
    } else {
      warnings.push(`${personInitials(person)}: GRUPO (ESPAÑOL) sin ediciones ESP — no aplicado`);
    }
  }
}

/** Maps fichas to the import plan (nodes deduped by slug across all fichas). */
export function mapFormacion(fichas: Ficha[]): ImportPlan {
  const cursos = new Map<string, NodeSpec>();
  const ediciones = new Map<string, NodeSpec>();
  const enrollments: EnrollmentSpec[] = [];
  const unmapped: UnmappedToken[] = [];
  const warnings: string[] = [];

  for (const ficha of fichas) {
    const person: PersonRef = {
      titulo: ficha.titulo,
      nombre: ficha.nombre,
      apellidos: ficha.apellidos,
      numeroDoc: ficha.numeroDoc,
    };
    const byEdition = new Map<string, { parsed: ParsedEdition; enrollment: EnrollmentSpec }>();

    for (const token of ficha.cursoTokens) {
      const parsed = parseEditionToken(token);
      if (!parsed) {
        unmapped.push({ person, token });
        continue;
      }
      const catalog = CURSO_CATALOG[parsed.curso];
      if (!cursos.has(catalog.slug)) {
        cursos.set(catalog.slug, {
          slug: catalog.slug,
          name: catalog.name,
          tipo: "curso",
          parentSlug: "formacion",
          etiquetas: catalog.etiquetas,
        });
      }
      if (!ediciones.has(parsed.slug)) {
        ediciones.set(parsed.slug, {
          slug: parsed.slug,
          name: parsed.name,
          tipo: "edicion",
          parentSlug: catalog.slug,
          etiquetas: [],
        });
      }
      if (byEdition.has(parsed.slug)) {
        warnings.push(`${personInitials(person)}: token duplicado "${token}" — ignorado`);
        continue;
      }
      const enrollment: EnrollmentSpec = {
        person,
        editionSlug: parsed.slug,
        estado: parsed.espera ? "lista_espera" : "inscrito",
      };
      byEdition.set(parsed.slug, { parsed, enrollment });
      enrollments.push(enrollment);
    }

    applyPersonFields(ficha, person, byEdition, warnings);
  }

  return {
    cursos: [...cursos.values()],
    ediciones: [...ediciones.values()],
    enrollments,
    unmapped,
    warnings,
  };
}
