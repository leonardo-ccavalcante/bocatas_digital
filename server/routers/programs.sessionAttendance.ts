/**
 * programs.sessionAttendance.ts — Attendance write helper for session procedures.
 *
 * Extracted from programs.enlace.ts to keep that file under the 300-line budget.
 * Used by: enlaceMarcarAsistencia (public token-gated), marcarAsistenciaSesion (staff).
 */
import { TRPCError } from "@trpc/server";
import type { createAdminClient } from "../../client/src/lib/supabase/server";

type Supabase = ReturnType<typeof createAdminClient>;

/** Inserts an attendance row for a session. Handles 23505 (duplicate) and 23503 (bad slug).
 * NOTE: en_nombre_de is NOT a column on attendances (only session_id was added in W1);
 * the responsible party is stored on the program_sessions row via en_nombre_de there. */
export async function insertSessionAttendance(
  supabase: Supabase,
  personId: string,
  locationId: string,
  programaSlug: string,
  sessionId: string,
  metodo: "qr_scan" | "manual_busqueda",
  _enNombreDe: string | null
): Promise<{ status: "registered" | "duplicate"; lastCheckinTime?: string }> {
  const today = new Date().toISOString().split("T")[0];
  const { data: existing } = await supabase
    .from("attendances")
    .select("checked_in_at")
    .eq("person_id", personId)
    .eq("location_id", locationId)
    .eq("programa", programaSlug)
    .eq("checked_in_date", today)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const time = new Date(existing.checked_in_at).toLocaleTimeString("es-ES", {
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
    });
    return { status: "duplicate", lastCheckinTime: time };
  }

  const { error } = await supabase.from("attendances").insert({
    person_id: personId,
    location_id: locationId,
    programa: programaSlug,
    metodo,
    es_demo: false,
    session_id: sessionId,
  });

  if (error) {
    if (error.code === "23505") return { status: "duplicate" };
    if (error.code === "23503") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Programa desconocido: no existe en el catálogo" });
    }
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }
  return { status: "registered" };
}
