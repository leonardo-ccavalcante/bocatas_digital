/**
 * dbTypes.ts — the narrow, structurally-typed slice of the Supabase client
 * that the importer uses. Keeping the surface this small lets tests fake the
 * client with plain objects (no casts, no `any`) while `AdminClientSatisfies`
 * proves at compile time that the REAL admin client
 * (createAdminClient from client/src/lib/supabase/server) is accepted.
 */
import type { createAdminClient } from "../../client/src/lib/supabase/server";
import type { EstadoInscripcion } from "../../shared/programEstados";

export interface DbError {
  message: string;
}

export interface DbResult<T> {
  data: T | null;
  error: DbError | null;
}

export interface PersonRow {
  id: string;
  nombre: string;
  apellidos: string | null;
  numero_documento: string | null;
}

export interface ProgramRow {
  id: string;
  slug: string;
}

export interface ProgramInsertRow {
  slug: string;
  name: string;
  tipo: "curso" | "edicion";
  parent_id: string;
  etiquetas: string[];
  inscribible: boolean;
  estados_habilitados: string[];
}

export interface EnrollmentUpsertRow {
  person_id: string;
  program_id: string;
  estado: EstadoInscripcion;
  metadata: Record<string, string> | null;
  motivo_baja: string | null;
  notas: string;
}

/** Column lists as literal types so the real client's query parser types the rows. */
export const PERSON_COLUMNS = "id, nombre, apellidos, numero_documento" as const;
export const PROGRAM_COLUMNS = "id, slug" as const;

export interface PersonsApi {
  select(columns: typeof PERSON_COLUMNS): {
    is(
      column: "deleted_at",
      value: null,
    ): {
      range(from: number, to: number): PromiseLike<DbResult<PersonRow[]>>;
    };
  };
}

export interface ProgramsApi {
  select(columns: typeof PROGRAM_COLUMNS): {
    in(column: "slug", values: string[]): PromiseLike<DbResult<ProgramRow[]>>;
  };
  insert(row: ProgramInsertRow): {
    select(columns: typeof PROGRAM_COLUMNS): {
      single(): PromiseLike<DbResult<ProgramRow>>;
    };
  };
}

export interface EnrollmentsApi {
  upsert(
    row: EnrollmentUpsertRow,
    options: { onConflict: "person_id,program_id" },
  ): PromiseLike<DbResult<null>>;
}

/**
 * The three table gateways the importer touches. Property accessors (rather
 * than an overloaded `from()`) keep the TypeScript assignability check of the
 * real Supabase client small enough to compile.
 */
export interface ImportDb {
  persons(): PersonsApi;
  programs(): ProgramsApi;
  enrollments(): EnrollmentsApi;
}

/**
 * Adapter used by the CLI: proves AT COMPILE TIME (via plain assignability,
 * no cast) that the production admin client satisfies ImportDb. If the
 * Supabase client's surface drifts, this function stops compiling.
 */
export function toImportDb(client: ReturnType<typeof createAdminClient>): ImportDb {
  return {
    persons: () => client.from("persons"),
    programs: () => client.from("programs"),
    enrollments: () => client.from("program_enrollments"),
  };
}
