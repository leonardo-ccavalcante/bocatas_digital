/**
 * sessionCalendario.ts — regla ÚNICA de generación del calendario de sesiones.
 *
 * Vivía sólo en el servidor (iterateDateSlots, server/routers/programs.sessions.ts).
 * Se extrae aquí para que la previsualización del modal «Generar calendario»
 * cuente EXACTAMENTE lo que el servidor va a insertar, sin inventar un endpoint
 * de simulación y sin una segunda copia del bucle que divergiría al primer arreglo.
 *
 * Reglas (idénticas a las que ejecutaba programs.sessions.ts):
 * - Rango [desde, hasta] INCLUSIVO por los dos extremos, recorrido en UTC.
 * - dia_semana usa la convención de getUTCDay(): 0 = domingo … 6 = sábado,
 *   la misma que DIA_SEMANA_LABELS en sessionSchemas.ts.
 * - Límite v1: UNA sesión por día. Si varias franjas caen el mismo día se usa
 *   la primera; `solapadas` lo declara para que quien llame pueda avisar.
 */
import { ProgramacionSchema, type ProgramacionSlot } from "./sessionSchemas";

export interface FechaProgramada {
  /** "YYYY-MM-DD" */
  fecha: string;
  slot: ProgramacionSlot;
  /** Cuántas franjas caían ese día. >1 ⇒ sólo se usa la primera (límite v1). */
  solapadas: number;
}

export function fechasProgramadas(
  desde: string,
  hasta: string,
  slots: ProgramacionSlot[]
): FechaProgramada[] {
  const out: FechaProgramada[] = [];
  if (slots.length === 0) return out;
  const end = new Date(hasta + "T00:00:00Z");
  // Una fecha inválida da NaN: la comparación es false y el bucle no entra.
  for (
    const d = new Date(desde + "T00:00:00Z");
    d <= end;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const dia = d.getUTCDay();
    const fecha = d.toISOString().split("T")[0];
    const coincidentes = slots.filter((s) => s.dia_semana === dia);
    if (coincidentes.length > 0) {
      out.push({ fecha, slot: coincidentes[0], solapadas: coincidentes.length });
    }
  }
  return out;
}

export interface ResumenCalendario {
  /** Sesiones que generarSesiones va a crear de verdad. */
  nuevas: number;
  /** Fechas del rango que ya tienen sesión y que el servidor salta. */
  existentes: number;
  primera: string | null;
  ultima: string | null;
}

/**
 * Lo que se va a crear, descontando las fechas que ya tienen sesión —
 * el mismo dedupe por (program_id, fecha) que hace el servidor.
 */
export function resumirCalendario(
  desde: string,
  hasta: string,
  slots: ProgramacionSlot[],
  fechasExistentes: string[] = []
): ResumenCalendario {
  const ya = new Set(fechasExistentes);
  const todas = fechasProgramadas(desde, hasta, slots);
  const nuevas = todas.filter((f) => !ya.has(f.fecha));
  return {
    nuevas: nuevas.length,
    existentes: todas.length - nuevas.length,
    primera: nuevas[0]?.fecha ?? null,
    ultima: nuevas[nuevas.length - 1]?.fecha ?? null,
  };
}

export interface EntradaCalendario {
  desde: string;
  hasta: string;
  slots: ProgramacionSlot[];
  locationId: string;
}

/**
 * Errores en español, listos para pintar. Vacío = configuración válida.
 * La ubicación es obligatoria aquí aunque el servidor la acepte ausente:
 * sin ella la sesión no se puede abrir (programs.sessions.ts:191-203) ni
 * admite asistencia por enlace (programs.enlace.ts:380-385).
 */
export function validarCalendario(entrada: EntradaCalendario): string[] {
  const errores: string[] = [];
  if (!entrada.desde || !entrada.hasta) {
    errores.push("Indica el primer y el último día del curso.");
  } else if (entrada.hasta < entrada.desde) {
    errores.push("El último día no puede ser anterior al primero.");
  }
  if (entrada.slots.length === 0) {
    errores.push("Añade al menos un día de clase.");
  } else if (!ProgramacionSchema.safeParse(entrada.slots).success) {
    errores.push(
      "Cada franja necesita hora de inicio y hora de fin, y la de fin debe ser posterior a la de inicio."
    );
  } else if (new Set(entrada.slots.map((s) => s.dia_semana)).size < entrada.slots.length) {
    // El límite v1 genera UNA sesión por día (fechasProgramadas usa la primera
    // franja): aceptar dos franjas del mismo día publicaría un horario que
    // calla la segunda.
    errores.push(
      "Hay dos franjas para el mismo día: sólo se puede generar una sesión por día (deja una franja por día)."
    );
  }
  if (!entrada.locationId) {
    errores.push("Selecciona una ubicación: sin ella no se puede pasar lista en la sesión.");
  }
  return errores;
}
