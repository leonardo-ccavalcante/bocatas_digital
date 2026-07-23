/**
 * importRunner.ts — executes an ImportPlan against the DB.
 *
 * dry-run (THE DEFAULT everywhere): read-only — matches persons, diffs nodes
 * against existing slugs, and returns the report. NO writes, ever.
 * apply: select-then-insert curso/edición nodes (existence-tolerant), then
 * upserts enrollments on (person_id, program_id) per ADR-0007. Row errors are
 * collected, never abort the batch.
 */
import { TIPO_PRESETS } from "../../shared/programEstados";
import type { ImportPlan, NodeSpec } from "./formacionMapper";
import type { MatchedEnrollment, UnmatchedPerson } from "./personMatcher";
import { matchPersons } from "./personMatcher";
import type { ImportDb, ProgramInsertRow } from "./dbTypes";
import { PROGRAM_COLUMNS } from "./dbTypes";

export interface RunOptions {
  mode: "dry-run" | "apply";
  now?: Date;
}

export interface AppliedCounts {
  cursosCreated: number;
  edicionesCreated: number;
  enrollmentsUpserted: number;
}

export interface ImportReport {
  mode: "dry-run" | "apply";
  generatedAt: string;
  nodesToCreate: { cursos: NodeSpec[]; ediciones: NodeSpec[] };
  existingNodeSlugs: string[];
  enrollmentsToCreate: MatchedEnrollment[];
  unmatched: UnmatchedPerson[];
  unmapped: ImportPlan["unmapped"];
  estadoDistribution: Record<string, number>;
  warnings: string[];
  errors: string[];
  applied: AppliedCounts | null;
}

const ROOT_SLUG = "formacion";

async function fetchExistingSlugs(
  db: ImportDb,
  slugs: string[],
): Promise<{ idBySlug: Map<string, string>; error: string | null }> {
  const { data, error } = await db.programs().select(PROGRAM_COLUMNS).in("slug", slugs);
  if (error) return { idBySlug: new Map(), error: `programs fetch: ${error.message}` };
  return { idBySlug: new Map((data ?? []).map((p) => [p.slug, p.id])), error: null };
}

function toProgramInsert(node: NodeSpec, parentId: string): ProgramInsertRow {
  const preset = TIPO_PRESETS[node.tipo];
  return {
    slug: node.slug,
    name: node.name,
    tipo: node.tipo,
    parent_id: parentId,
    etiquetas: node.etiquetas,
    inscribible: preset.inscribible,
    estados_habilitados: [...preset.estados],
  };
}

/** Inserts the missing nodes of one level; fills idBySlug; collects errors. */
async function createNodes(
  db: ImportDb,
  nodes: NodeSpec[],
  idBySlug: Map<string, string>,
  errors: string[],
): Promise<number> {
  let created = 0;
  for (const node of nodes) {
    const parentId = idBySlug.get(node.parentSlug);
    if (!parentId) {
      errors.push(`nodo ${node.slug}: padre "${node.parentSlug}" no existe — omitido`);
      continue;
    }
    const { data, error } = await db
      .programs()
      .insert(toProgramInsert(node, parentId))
      .select(PROGRAM_COLUMNS)
      .single();
    if (error || !data) {
      errors.push(`nodo ${node.slug}: ${error?.message ?? "insert sin datos"}`);
      continue;
    }
    idBySlug.set(data.slug, data.id);
    created += 1;
  }
  return created;
}

async function upsertEnrollments(
  db: ImportDb,
  enrollments: MatchedEnrollment[],
  idBySlug: Map<string, string>,
  notas: string,
  errors: string[],
): Promise<number> {
  let upserted = 0;
  for (const enrollment of enrollments) {
    const programId = idBySlug.get(enrollment.editionSlug);
    if (!programId) {
      errors.push(`enrollment ${enrollment.editionSlug}: edición sin nodo — omitido`);
      continue;
    }
    const { error } = await db.enrollments().upsert(
      {
        person_id: enrollment.personId,
        program_id: programId,
        estado: enrollment.estado,
        metadata: enrollment.metadata ?? null,
        motivo_baja: enrollment.motivoBaja ?? null,
        notas,
      },
      { onConflict: "person_id,program_id" },
    );
    if (error) {
      errors.push(`enrollment ${enrollment.editionSlug}/${enrollment.personId}: ${error.message}`);
      continue;
    }
    upserted += 1;
  }
  return upserted;
}

function countEstados(enrollments: MatchedEnrollment[]): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const e of enrollments) {
    distribution[e.estado] = (distribution[e.estado] ?? 0) + 1;
  }
  return distribution;
}

/** Runs the plan. dry-run is read-only; apply writes nodes + enrollments. */
export async function runImport(
  plan: ImportPlan,
  db: ImportDb,
  options: RunOptions,
): Promise<ImportReport> {
  const now = options.now ?? new Date();
  const warnings = [...plan.warnings];
  const errors: string[] = [];

  const match = await matchPersons(db, plan.enrollments);
  errors.push(...match.errors);

  const allSlugs = [
    ROOT_SLUG,
    ...plan.cursos.map((c) => c.slug),
    ...plan.ediciones.map((e) => e.slug),
  ];
  const { idBySlug, error: slugError } = await fetchExistingSlugs(db, allSlugs);
  if (slugError) errors.push(slugError);

  const missingCursos = plan.cursos.filter((c) => !idBySlug.has(c.slug));
  const missingEdiciones = plan.ediciones.filter((e) => !idBySlug.has(e.slug));
  const rootMissing = !idBySlug.has(ROOT_SLUG);
  if (rootMissing) {
    const msg = `programa raíz "${ROOT_SLUG}" no existe en la BD — los cursos no pueden colgarse`;
    if (options.mode === "apply") errors.push(msg);
    else warnings.push(msg);
  }

  let applied: AppliedCounts | null = null;
  if (options.mode === "apply" && !slugError && !rootMissing) {
    const cursosCreated = await createNodes(db, missingCursos, idBySlug, errors);
    const edicionesCreated = await createNodes(db, missingEdiciones, idBySlug, errors);
    const notas = `importado de Notion ${now.toISOString().slice(0, 10)}`;
    const enrollmentsUpserted = await upsertEnrollments(
      db,
      match.matched,
      idBySlug,
      notas,
      errors,
    );
    applied = { cursosCreated, edicionesCreated, enrollmentsUpserted };
  }

  return {
    mode: options.mode,
    generatedAt: now.toISOString(),
    nodesToCreate: { cursos: missingCursos, ediciones: missingEdiciones },
    existingNodeSlugs: [...idBySlug.keys()],
    enrollmentsToCreate: match.matched,
    unmatched: match.unmatched,
    unmapped: plan.unmapped,
    estadoDistribution: countEstados(match.matched),
    warnings,
    errors,
    applied,
  };
}
