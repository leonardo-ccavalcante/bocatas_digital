/**
 * programs.enrollmentEstado.ts — estado-transition rules for enrollments and
 * the tree-depth guard, extracted so routers/programs.ts stays thin (mirrors
 * the checkin.offlineSync.ts split).
 *
 * Rules (ADR-0013): estado must be enabled by the program
 * (`estados_habilitados`); `baja` always requires a motivo; final states set
 * `fecha_fin`; every transition appends to `enrollment_events` with the actor
 * as TEXT (ADR-0011).
 */
import { TRPCError } from "@trpc/server";
import type { createAdminClient } from "../../client/src/lib/supabase/server";
import { ESTADOS_FINALES, type EstadoInscripcion } from "../../shared/programEstados";

type Supabase = ReturnType<typeof createAdminClient>;

export interface EnrollmentForTransition {
  id: string;
  estado: string;
  estados_habilitados: readonly string[];
}

/** Tree depth cap (root = 1). Creating under a depth-3 parent is rejected. */
export const MAX_TREE_DEPTH = 3;

export async function assertParentDepthOk(supabase: Supabase, parentId: string): Promise<void> {
  let currentId: string | null = parentId;
  let depth = 0;
  while (currentId && depth <= MAX_TREE_DEPTH) {
    // Local const breaks the data→currentId→query type-inference cycle (TS7022)
    const lookupId: string = currentId;
    const { data, error } = await supabase
      .from("programs")
      .select("id, parent_id")
      .eq("id", lookupId)
      .single();
    if (error || !data) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Programa padre no encontrado" });
    }
    depth += 1;
    currentId = data.parent_id;
  }
  if (depth >= MAX_TREE_DEPTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Profundidad máxima del árbol: ${MAX_TREE_DEPTH} niveles`,
    });
  }
}

export function assertTransitionAllowed(
  enrollment: EnrollmentForTransition,
  estado: EstadoInscripcion,
  motivo: string | undefined
): void {
  if (!enrollment.estados_habilitados.includes(estado)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `El estado '${estado}' no está habilitado para este programa`,
    });
  }
  if (estado === "baja" && (!motivo || motivo.trim().length === 0)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Dar de baja requiere un motivo",
    });
  }
}

/** Applies a validated estado change: updates the row and appends the event. */
export async function applyEstadoChange(
  supabase: Supabase,
  actorId: string,
  enrollment: EnrollmentForTransition,
  estado: EstadoInscripcion,
  motivo?: string
) {
  assertTransitionAllowed(enrollment, estado, motivo);

  const today = new Date().toISOString().split("T")[0];
  const esFinal = ESTADOS_FINALES.includes(estado);
  const { data, error } = await supabase
    .from("program_enrollments")
    .update({
      estado,
      motivo_baja: estado === "baja" ? (motivo ?? null) : null,
      fecha_fin: esFinal ? today : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", enrollment.id)
    .select()
    .single();

  if (error) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }

  await logEnrollmentEvent(supabase, {
    enrollmentId: enrollment.id,
    anterior: enrollment.estado,
    nuevo: estado,
    motivo,
    actorId,
  });

  return data;
}

export async function logEnrollmentEvent(
  supabase: Supabase,
  ev: { enrollmentId: string; anterior: string | null; nuevo: string; motivo?: string; actorId: string }
): Promise<void> {
  const { error } = await supabase.from("enrollment_events").insert({
    enrollment_id: ev.enrollmentId,
    estado_anterior: ev.anterior,
    estado_nuevo: ev.nuevo,
    motivo: ev.motivo ?? null,
    actor: ev.actorId,
  });
  // Append-only audit trail: a failed event write must not roll back the
  // state change the user saw succeed — log loudly instead.
  if (error) {
    console.error("[enrollment_events] append failed:", error.message, ev);
  }
}
