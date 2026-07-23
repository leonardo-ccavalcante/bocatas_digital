/**
 * importRunner.test.ts — person matching + dry-run/apply behavior.
 *
 * ALL fixture people are SYNTHETIC (invented names/documents). The Supabase
 * client is faked through the narrow ImportDb interface — dry-run must
 * perform ZERO writes (asserted on the insert/upsert spies).
 */
import { describe, it, expect, vi } from "vitest";
import type {
  DbError,
  DbResult,
  EnrollmentUpsertRow,
  ImportDb,
  PersonRow,
  ProgramInsertRow,
  ProgramRow,
} from "../dbTypes";
import type { Ficha } from "../notionFicha";
import { mapFormacion } from "../formacionMapper";
import { runImport } from "../importRunner";

interface FakeDbConfig {
  persons: PersonRow[];
  existingPrograms: ProgramRow[];
  upsertErrorFor?: (row: EnrollmentUpsertRow) => DbError | null;
}

function makeFakeDb(config: FakeDbConfig) {
  const programInsert = vi.fn((row: ProgramInsertRow) => ({
    select: () => ({
      single: (): Promise<DbResult<ProgramRow>> =>
        Promise.resolve({ data: { id: `id_${row.slug}`, slug: row.slug }, error: null }),
    }),
  }));
  const enrollmentUpsert = vi.fn(
    (row: EnrollmentUpsertRow, _opts: { onConflict: string }): Promise<DbResult<null>> =>
      Promise.resolve({ data: null, error: config.upsertErrorFor?.(row) ?? null }),
  );
  const personsRange = vi.fn(
    (from: number, to: number): Promise<DbResult<PersonRow[]>> =>
      Promise.resolve({ data: config.persons.slice(from, to + 1), error: null }),
  );
  const db: ImportDb = {
    persons: () => ({
      select: (_columns: string) => ({
        is: (_column: string, _value: null) => ({ range: personsRange }),
      }),
    }),
    programs: () => ({
      select: (_columns: string) => ({
        in: (_column: string, slugs: string[]): Promise<DbResult<ProgramRow[]>> =>
          Promise.resolve({
            data: config.existingPrograms.filter((p) => slugs.includes(p.slug)),
            error: null,
          }),
      }),
      insert: programInsert,
    }),
    enrollments: () => ({ upsert: enrollmentUpsert }),
  };
  return { db, programInsert, enrollmentUpsert, personsRange };
}

function makeFicha(overrides: Partial<Ficha>): Ficha {
  return {
    titulo: "Pruebas, Ana",
    nombre: "Ana",
    apellidos: "PRUEBAS",
    tipoDoc: "NIE",
    numeroDoc: "X0000000T",
    campos: {},
    cursoTokens: [],
    tallerTokens: [],
    ...overrides,
  };
}

const ANA: PersonRow = {
  id: "p-ana",
  nombre: "Ana",
  apellidos: "Pruebas",
  numero_documento: "X0000000T",
};
const FORMACION: ProgramRow = { id: "id_formacion", slug: "formacion" };

describe("person matching", () => {
  it("matches by numero_documento exactly, tolerating surrounding whitespace", async () => {
    const { db } = makeFakeDb({ persons: [ANA], existingPrograms: [FORMACION] });
    const plan = mapFormacion([
      makeFicha({ numeroDoc: "  X0000000T  ", cursoTokens: ["2025/09 ESP"] }),
    ]);
    const report = await runImport(plan, db, { mode: "dry-run" });
    expect(report.enrollmentsToCreate).toHaveLength(1);
    expect(report.enrollmentsToCreate[0].personId).toBe("p-ana");
    expect(report.unmatched).toEqual([]);
  });

  it("falls back to normalized nombre+apellidos (case + accents) when the doc finds nothing", async () => {
    const jose: PersonRow = {
      id: "p-jose",
      nombre: "José Luis",
      apellidos: "Ensayo Pérez",
      numero_documento: null,
    };
    const { db } = makeFakeDb({ persons: [ANA, jose], existingPrograms: [FORMACION] });
    const plan = mapFormacion([
      makeFicha({
        titulo: "Ensayo, Jose",
        nombre: "jose luis",
        apellidos: "ENSAYO PEREZ",
        numeroDoc: "DOC-NO-EXISTE-1",
        cursoTokens: ["2025/09 ESP"],
      }),
    ]);
    const report = await runImport(plan, db, { mode: "dry-run" });
    expect(report.enrollmentsToCreate.map((e) => e.personId)).toEqual(["p-jose"]);
  });

  it("ambiguous document (two persons share it) → unmatched, never guessed", async () => {
    const twins: PersonRow[] = [
      { id: "p-t1", nombre: "Gemela", apellidos: "Uno", numero_documento: "Z0000000D" },
      { id: "p-t2", nombre: "Gemela", apellidos: "Dos", numero_documento: "Z0000000D" },
    ];
    const { db } = makeFakeDb({ persons: twins, existingPrograms: [FORMACION] });
    const plan = mapFormacion([
      makeFicha({ numeroDoc: "Z0000000D", cursoTokens: ["2025/09 ESP"] }),
    ]);
    const report = await runImport(plan, db, { mode: "dry-run" });
    expect(report.enrollmentsToCreate).toEqual([]);
    expect(report.unmatched).toHaveLength(1);
    expect(report.unmatched[0].reason).toBe("documento_ambiguo");
  });

  it("ambiguous name → unmatched; unknown person → unmatched", async () => {
    const dup: PersonRow[] = [
      { id: "p-d1", nombre: "Copia", apellidos: "Duplicada", numero_documento: null },
      { id: "p-d2", nombre: "Copia", apellidos: "Duplicada", numero_documento: null },
    ];
    const { db } = makeFakeDb({ persons: dup, existingPrograms: [FORMACION] });
    const plan = mapFormacion([
      makeFicha({
        titulo: "Duplicada, Copia",
        nombre: "Copia",
        apellidos: "Duplicada",
        numeroDoc: "",
        cursoTokens: ["2025/09 ESP"],
      }),
      makeFicha({
        titulo: "Fantasma, Persona",
        nombre: "Persona",
        apellidos: "Fantasma",
        numeroDoc: "",
        cursoTokens: ["2025/09 ESP"],
      }),
    ]);
    const report = await runImport(plan, db, { mode: "dry-run" });
    expect(report.enrollmentsToCreate).toEqual([]);
    const reasons = report.unmatched.map((u) => u.reason).sort();
    expect(reasons).toEqual(["nombre_ambiguo", "persona_no_encontrada"]);
  });

  it("pages through persons beyond the 1000-row Supabase page limit", async () => {
    const many: PersonRow[] = Array.from({ length: 1500 }, (_, i) => ({
      id: `p-${i}`,
      nombre: `Sintetica${i}`,
      apellidos: `Prueba${i}`,
      numero_documento: `SYN-${i}`,
    }));
    const { db, personsRange } = makeFakeDb({ persons: many, existingPrograms: [FORMACION] });
    const plan = mapFormacion([
      makeFicha({ numeroDoc: "SYN-1200", cursoTokens: ["2025/09 ESP"] }),
    ]);
    const report = await runImport(plan, db, { mode: "dry-run" });
    expect(report.enrollmentsToCreate.map((e) => e.personId)).toEqual(["p-1200"]);
    expect(personsRange.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("dry-run", () => {
  it("produces the report and performs ZERO writes", async () => {
    const { db, programInsert, enrollmentUpsert } = makeFakeDb({
      persons: [ANA],
      existingPrograms: [FORMACION],
    });
    const plan = mapFormacion([
      makeFicha({
        cursoTokens: ["2025/09 ESP", "2026/01 ESP L.Espera", "Sin Formato"],
        campos: { "Estado Curso Español": "Baja", "GRUPO (ESPAÑOL)": "Bajo" },
      }),
    ]);
    const report = await runImport(plan, db, { mode: "dry-run" });

    expect(programInsert).not.toHaveBeenCalled();
    expect(enrollmentUpsert).not.toHaveBeenCalled();

    expect(report.mode).toBe("dry-run");
    expect(report.nodesToCreate.cursos.map((c) => c.slug)).toEqual(["clases_espanol"]);
    expect(report.nodesToCreate.ediciones.map((e) => e.slug).sort()).toEqual([
      "esp_2025_09",
      "esp_2026_01",
    ]);
    expect(report.enrollmentsToCreate).toHaveLength(2);
    expect(report.estadoDistribution).toEqual({ inscrito: 1, baja: 1 });
    expect(report.unmapped.map((u) => u.token)).toEqual(["Sin Formato"]);
    expect(report.applied).toBeNull();
  });

  it("excludes nodes that already exist in the DB from nodesToCreate", async () => {
    const { db } = makeFakeDb({
      persons: [ANA],
      existingPrograms: [
        FORMACION,
        { id: "id_curso_esp", slug: "clases_espanol" },
        { id: "id_ed_2025_09", slug: "esp_2025_09" },
      ],
    });
    const plan = mapFormacion([makeFicha({ cursoTokens: ["2025/09 ESP"] })]);
    const report = await runImport(plan, db, { mode: "dry-run" });
    expect(report.nodesToCreate.cursos).toEqual([]);
    expect(report.nodesToCreate.ediciones).toEqual([]);
    expect(report.existingNodeSlugs.sort()).toEqual([
      "clases_espanol",
      "esp_2025_09",
      "formacion",
    ]);
  });
});

describe("apply", () => {
  it("creates missing nodes (select-then-insert) with correct parent linkage, then upserts enrollments", async () => {
    const { db, programInsert, enrollmentUpsert } = makeFakeDb({
      persons: [ANA],
      existingPrograms: [FORMACION],
    });
    const plan = mapFormacion([
      makeFicha({
        cursoTokens: ["2026/01 ESP L.Espera"],
        campos: { "GRUPO (ESPAÑOL)": "Bajo" },
      }),
    ]);
    const report = await runImport(plan, db, { mode: "apply", now: new Date("2026-07-23") });

    const inserted = programInsert.mock.calls.map((c) => c[0]);
    const curso = inserted.find((r) => r.slug === "clases_espanol");
    const edicion = inserted.find((r) => r.slug === "esp_2026_01");
    expect(curso).toMatchObject({
      tipo: "curso",
      parent_id: "id_formacion",
      etiquetas: ["espanol"],
    });
    expect(edicion).toMatchObject({
      tipo: "edicion",
      name: "2026/01 ESP",
      parent_id: "id_clases_espanol",
    });

    expect(enrollmentUpsert).toHaveBeenCalledTimes(1);
    const [row, opts] = enrollmentUpsert.mock.calls[0];
    expect(opts).toEqual({ onConflict: "person_id,program_id" });
    expect(row).toMatchObject({
      person_id: "p-ana",
      program_id: "id_esp_2026_01",
      estado: "lista_espera",
      metadata: { grupo: "Bajo" },
      motivo_baja: null,
    });
    expect(row.notas).toContain("importado de Notion 2026-07-23");

    expect(report.applied).toEqual({
      cursosCreated: 1,
      edicionesCreated: 1,
      enrollmentsUpserted: 1,
    });
  });

  it("reuses an existing curso node instead of inserting it again", async () => {
    const { db, programInsert } = makeFakeDb({
      persons: [ANA],
      existingPrograms: [FORMACION, { id: "id_curso_esp", slug: "clases_espanol" }],
    });
    const plan = mapFormacion([makeFicha({ cursoTokens: ["2025/09 ESP"] })]);
    await runImport(plan, db, { mode: "apply" });
    const insertedSlugs = programInsert.mock.calls.map((c) => c[0].slug);
    expect(insertedSlugs).toEqual(["esp_2025_09"]);
    expect(programInsert.mock.calls[0][0].parent_id).toBe("id_curso_esp");
  });

  it("collects per-row enrollment errors without aborting the batch", async () => {
    const luis: PersonRow = {
      id: "p-luis",
      nombre: "Luis",
      apellidos: "Ensayo",
      numero_documento: "Y0000000Z",
    };
    const { db, enrollmentUpsert } = makeFakeDb({
      persons: [ANA, luis],
      existingPrograms: [FORMACION],
      upsertErrorFor: (row) =>
        row.person_id === "p-ana" ? { message: "boom sintetico" } : null,
    });
    const plan = mapFormacion([
      makeFicha({ cursoTokens: ["2025/09 ESP"] }),
      makeFicha({
        titulo: "Ensayo, Luis",
        nombre: "Luis",
        apellidos: "ENSAYO",
        numeroDoc: "Y0000000Z",
        cursoTokens: ["2025/09 ESP"],
      }),
    ]);
    const report = await runImport(plan, db, { mode: "apply" });
    expect(enrollmentUpsert).toHaveBeenCalledTimes(2);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain("boom sintetico");
    expect(report.applied?.enrollmentsUpserted).toBe(1);
  });

  it("missing 'formacion' root → error collected, no node writes attempted", async () => {
    const { db, programInsert } = makeFakeDb({ persons: [ANA], existingPrograms: [] });
    const plan = mapFormacion([makeFicha({ cursoTokens: ["2025/09 ESP"] })]);
    const report = await runImport(plan, db, { mode: "apply" });
    expect(programInsert).not.toHaveBeenCalled();
    expect(report.errors.length).toBeGreaterThan(0);
  });
});
