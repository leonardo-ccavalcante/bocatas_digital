/**
 * reportFormat.ts — human summary of an ImportReport for the CLI stdout.
 *
 * PII rule: stdout NEVER carries full identity — persons appear only as
 * "Apellidos, N." initials; documents never appear. Full detail lives in the
 * report JSON file, which stays out of the repo.
 */
import { personInitials } from "./formacionMapper";
import type { ImportReport } from "./importRunner";

const MAX_LISTED = 30;

function line(label: string, value: number | string): string {
  return `  ${label.padEnd(28, " ")}${value}`;
}

function section(title: string, rows: string[]): string[] {
  return rows.length === 0 ? [] : ["", `${title}:`, ...rows.slice(0, MAX_LISTED),
    ...(rows.length > MAX_LISTED ? [`  … y ${rows.length - MAX_LISTED} más (ver JSON)`] : [])];
}

/** Builds the counts-only stdout summary (no documents, initials only). */
export function formatSummary(report: ImportReport, fichaCount: number): string {
  const out: string[] = [
    `=== Importación Notion → Formación (${report.mode}) ===`,
    line("Fichas leídas:", fichaCount),
    line("Cursos a crear:", report.nodesToCreate.cursos.length),
    line("Ediciones a crear:", report.nodesToCreate.ediciones.length),
    line("Enrollments (con match):", report.enrollmentsToCreate.length),
  ];
  for (const [estado, count] of Object.entries(report.estadoDistribution).sort()) {
    out.push(line(`  · ${estado}`, count));
  }
  out.push(
    line("Personas sin match:", report.unmatched.length),
    line("Tokens sin mapear:", report.unmapped.length),
    line("Warnings:", report.warnings.length),
    line("Errores:", report.errors.length),
  );
  if (report.applied) {
    out.push(
      line("APLICADO — cursos:", report.applied.cursosCreated),
      line("APLICADO — ediciones:", report.applied.edicionesCreated),
      line("APLICADO — enrollments:", report.applied.enrollmentsUpserted),
    );
  }
  out.push(
    ...section(
      "Sin match (iniciales)",
      report.unmatched.map((u) => `  - ${personInitials(u.person)} (${u.reason})`),
    ),
    ...section(
      "Tokens sin mapear",
      report.unmapped.map((u) => `  - "${u.token}" — ${personInitials(u.person)}`),
    ),
  );
  return out.join("\n");
}
