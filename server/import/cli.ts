/**
 * cli.ts — implementation of scripts/import-notion-formacion.ts.
 *
 * Usage: tsx scripts/import-notion-formacion.ts --dir <folder> [--apply] [--out report.json]
 *
 * DRY-RUN IS THE DEFAULT and performs ZERO writes (person matching is
 * read-only). AGENTS.md: "Never auto-import legacy-system data — migration
 * scope is validated with the stakeholders first" — therefore --apply
 * additionally requires the env var CONFIRM_IMPORT=yes.
 *
 * stdout carries counts and "Apellidos, N." initials only; full detail
 * (including document numbers) goes to the report JSON — keep it out of git.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { toImportDb } from "./dbTypes";
import { parseFicha } from "./notionFicha";
import { mapFormacion } from "./formacionMapper";
import { runImport } from "./importRunner";
import { formatSummary } from "./reportFormat";

interface CliArgs {
  dir: string;
  apply: boolean;
  out: string;
}

const USAGE =
  "Uso: tsx scripts/import-notion-formacion.ts --dir <carpeta> [--apply] [--out report.json]";

function parseArgs(argv: string[]): CliArgs {
  let dir = "";
  let apply = false;
  let out = "notion-formacion-report.json";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dir") dir = argv[++i] ?? "";
    else if (argv[i] === "--apply") apply = true;
    else if (argv[i] === "--out") out = argv[++i] ?? out;
    else {
      console.error(`Argumento no reconocido: ${argv[i]}\n${USAGE}`);
      process.exit(2);
    }
  }
  if (!dir) {
    console.error(USAGE);
    process.exit(2);
  }
  return { dir: resolve(dir), apply, out: resolve(out) };
}

const APPLY_BANNER = `
############################################################
#  MODO --apply: ESCRITURA REAL EN LA BASE DE DATOS        #
#                                                          #
#  AGENTS.md: "Never auto-import legacy-system data —      #
#  migration scope is validated with the stakeholders      #
#  first."                                                 #
#                                                          #
#  Este modo crea nodos curso/edicion y upserta            #
#  enrollments. Ejecuta primero el dry-run, revisa el      #
#  JSON con los stakeholders y solo entonces lanza:        #
#                                                          #
#      CONFIRM_IMPORT=yes tsx scripts/... --apply          #
############################################################
`;

function gateApply(): void {
  console.error(APPLY_BANNER);
  if (process.env.CONFIRM_IMPORT !== "yes") {
    console.error("ABORTADO: --apply requiere CONFIRM_IMPORT=yes en el entorno.");
    process.exit(1);
  }
  console.error("CONFIRM_IMPORT=yes recibido — continuando con la escritura.\n");
}

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.apply) gateApply();

  const files = readdirSync(args.dir).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    console.error(`Sin ficheros .md en ${args.dir} — nada que importar.`);
    process.exit(1);
  }
  const fichas = files.map((f) => parseFicha(readFileSync(join(args.dir, f), "utf8")));
  const plan = mapFormacion(fichas);

  const db = toImportDb(createAdminClient());
  const report = await runImport(plan, db, { mode: args.apply ? "apply" : "dry-run" });

  writeFileSync(args.out, `${JSON.stringify({ fichas: files.length, ...report }, null, 2)}\n`);
  process.stdout.write(`${formatSummary(report, files.length)}\n`);
  process.stdout.write(`\nInforme completo: ${args.out} (contiene PII — no subir a git)\n`);

  if (report.errors.length > 0) process.exitCode = 1;
}

/** Entry point called by scripts/import-notion-formacion.ts. */
export function runCli(argv: string[]): void {
  main(argv).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ERROR: ${message}`);
    if (/SUPABASE/i.test(message)) {
      console.error(
        "El matching de personas necesita la BD: exporta SUPABASE_URL y " +
          "SUPABASE_SERVICE_ROLE_KEY (el server los lee de .env).",
      );
    }
    process.exit(1);
  });
}
