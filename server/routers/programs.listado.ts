/**
 * programs.listado.ts — the derived "listado mensual" (ADR-0013): who was
 * enrolled in a program during a given month + how many times each attended.
 * Replaces Notion's hand-built monthly databases ("26/1 Comedor") — nobody
 * creates monthly lists; they are computed from enrollments + attendances.
 */
import { TRPCError } from "@trpc/server";
import type { createAdminClient } from "../../client/src/lib/supabase/server";

type Supabase = ReturnType<typeof createAdminClient>;

/** First/last day (inclusive) of a month as YYYY-MM-DD. */
export function monthWindow(year: number, month: number): { start: string; end: string } {
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

export interface ListadoPersona {
  person_id: string;
  nombre: string;
  apellidos: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  asistencias: number;
}

export async function getListadoMensual(
  supabase: Supabase,
  programId: string,
  year: number,
  month: number
) {
  const { start, end } = monthWindow(year, month);

  const { data: program, error: programError } = await supabase
    .from("programs")
    .select("id, slug, name, tipo")
    .eq("id", programId)
    .single();
  if (programError || !program) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Programa no encontrado" });
  }

  // Enrollments whose [fecha_inicio, fecha_fin] window overlaps the month
  const { data: enrolls, error: enrollsError } = await supabase
    .from("program_enrollments")
    .select("id, estado, fecha_inicio, fecha_fin, persons!inner(id, nombre, apellidos)")
    .eq("program_id", programId)
    .is("deleted_at", null)
    .lte("fecha_inicio", end)
    .or(`fecha_fin.is.null,fecha_fin.gte.${start}`);
  if (enrollsError) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: enrollsError.message });
  }

  // Attendance rows for this program's slug inside the month (person_id only)
  const { data: att, error: attError } = await supabase
    .from("attendances")
    .select("person_id")
    .eq("programa", program.slug)
    .eq("es_demo", false)
    .is("deleted_at", null)
    .gte("checked_in_date", start)
    .lte("checked_in_date", end);
  if (attError) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: attError.message });
  }

  const porPersona = countByPerson((att ?? []).map((a) => a.person_id));
  const anonimas = (att ?? []).filter((a) => a.person_id === null).length;

  const personas: ListadoPersona[] = (enrolls ?? []).map((e) => ({
    person_id: e.persons.id,
    nombre: e.persons.nombre ?? "",
    apellidos: e.persons.apellidos ?? "",
    estado: e.estado,
    fecha_inicio: e.fecha_inicio,
    fecha_fin: e.fecha_fin,
    asistencias: porPersona.get(e.persons.id) ?? 0,
  }));
  personas.sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`, "es"));

  return {
    program: { id: program.id, slug: program.slug, name: program.name, tipo: program.tipo },
    year,
    month,
    personas,
    totales: {
      inscritos: personas.length,
      asistieron: personas.filter((p) => p.asistencias > 0).length,
      asistencias_anonimas: anonimas,
    },
  };
}

export function countByPerson(personIds: readonly (string | null)[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of personIds) {
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
