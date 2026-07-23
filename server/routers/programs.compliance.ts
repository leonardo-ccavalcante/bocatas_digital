/**
 * programs.compliance.ts — Compliance metrics for a program edition.
 *
 * Wired as programs.compliance.* in the programsRouter.
 *
 * getComplianceEdicion returns:
 * - planosSubidos: N of sessions with at least one session_document
 * - totalSesiones: M (sessions where estado != 'cancelada')
 * - sesionesPendientes: planificada sessions past hora_fin
 * - ausenciasAlerta: enrolled persons with ≥2 consecutive absences in
 *   cerrada sessions (ALERT ONLY — never auto-baja)
 *
 * All computations are in-process from raw DB data; no stored procedures.
 * "Consecutive" means adjacent cerrada session dates ordered by fecha.
 *
 * GROUP 4c fix: soft-deleted persons are excluded from absence alerts.
 * GROUP 5  fix: absence detection keyed on session_id (not checked_in_date vs
 *   session.fecha) — retroactive / late closes no longer produce false alerts.
 * GROUP 7b fix: hora_fin interpreted in Europe/Madrid local time (DST-aware).
 *
 * RESIDUAL 3(a) fix: generic kiosk check-ins (session_id=NULL) now count as
 *   PRESENT via fallback: same programa-slug + checked_in_date + location_id.
 * RESIDUAL 3(b) fix: absence denominator scoped to planned sessions only
 *   (hora_fin IS NOT NULL) — legacy one-shot closes from families/sessions.ts
 *   (which insert with no hora_fin) are excluded to prevent false day-one alerts.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import { createAdminClient } from "../../client/src/lib/supabase/server";

type Supabase = ReturnType<typeof createAdminClient>;

const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "UUID inválido");

interface AbsenceAlert {
  personId: string;
  nombre: string;
  apellidos: string;
  consecutiveAbsences: number;
}

/**
 * Converts a local date+time in Europe/Madrid timezone to a UTC Date.
 * DST-aware: tries CEST (UTC+2) then CET (UTC+1) offsets.
 * GROUP 7b: used instead of the previous UTC-only interpretation.
 */
function toMadridUtc(fecha: string, hora: string): Date {
  const [targetH] = hora.split(":").map(Number);
  for (const offset of ["+02:00", "+01:00"]) {
    const candidate = new Date(`${fecha}T${hora}:00.000${offset}`);
    const localH = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Madrid",
        hour: "2-digit",
        hour12: false,
      }).format(candidate),
      10
    );
    if (localH === targetH) return candidate;
  }
  return new Date(`${fecha}T${hora}:00.000+01:00`);
}

/**
 * Finds enrolled persons with ≥2 consecutive absences in closed sessions.
 * Operates on cerrada PLANNED sessions only (hora_fin IS NOT NULL).
 *
 * GROUP 4c: soft-deleted persons are excluded (post-filter on persons.deleted_at).
 * GROUP 5: keyed on session_id — attendance recorded retroactively still counts.
 *
 * RESIDUAL 3(a): generic kiosk check-ins (session_id=NULL) count as PRESENT when
 *   programa-slug + checked_in_date + location_id all match the session row.
 *   Fallback is scoped to same program+day+location — does not reintroduce the
 *   original date-only cross-session bug.
 */
async function detectAbsenceAlerts(
  supabase: Supabase,
  programId: string,
  programSlug: string,
  cerradaSessions: { id: string; fecha: string; location_id: string | null }[]
): Promise<AbsenceAlert[]> {
  if (cerradaSessions.length === 0) return [];

  const sessionIds = cerradaSessions.map((s) => s.id);

  const { data: enrollments } = await supabase
    .from("program_enrollments")
    .select("person_id, persons(id, nombre, apellidos, deleted_at)")
    .eq("program_id", programId)
    .in("estado", ["inscrito", "preseleccionado", "admitido", "lista_espera", "activo", "pausado"])
    .is("deleted_at", null);

  // GROUP 5: select session_id for correct attendance matching (primary path)
  const { data: attendances } = await supabase
    .from("attendances")
    .select("person_id, session_id")
    .in("session_id", sessionIds)
    .is("deleted_at", null);

  // Map person_id → set of session_ids they attended (primary: session_id keyed)
  const attendedSessions = new Map<string, Set<string>>();
  for (const a of attendances ?? []) {
    if (!a.person_id || !a.session_id) continue;
    const set = attendedSessions.get(a.person_id) ?? new Set<string>();
    set.add(a.session_id);
    attendedSessions.set(a.person_id, set);
  }

  // RESIDUAL 3(a): fallback — fetch generic check-ins (session_id=NULL) for this program.
  // Scoped to the exact session dates so we don't match cross-program same-day check-ins.
  const sessionDates = [...new Set(cerradaSessions.map((s) => s.fecha))];
  const genericAttendedKeys = new Map<string, Set<string>>(); // person_id → Set<"fecha:location_id">
  if (sessionDates.length > 0 && programSlug) {
    const { data: genericAttendances } = await supabase
      .from("attendances")
      .select("person_id, checked_in_date, location_id")
      .is("session_id", null)
      .eq("programa", programSlug)
      .in("checked_in_date", sessionDates)
      .is("deleted_at", null);
    for (const a of genericAttendances ?? []) {
      if (!a.person_id || !a.checked_in_date) continue;
      const key = `${a.checked_in_date}:${a.location_id ?? ""}`;
      const set = genericAttendedKeys.get(a.person_id) ?? new Set<string>();
      set.add(key);
      genericAttendedKeys.set(a.person_id, set);
    }
  }

  const alerts: AbsenceAlert[] = [];
  for (const enrollment of enrollments ?? []) {
    const person = Array.isArray(enrollment.persons) ? enrollment.persons[0] : enrollment.persons;
    if (!person) continue;
    // GROUP 4c: skip soft-deleted persons (Art.17 RGPD — erased persons leave all reports)
    if ((person as Record<string, unknown>)["deleted_at"]) continue;

    let consecutive = 0;
    let maxConsecutive = 0;
    for (const s of cerradaSessions) {
      // Primary: session_id match (GROUP 5)
      const bySessionId = (attendedSessions.get(enrollment.person_id) ?? new Set<string>()).has(s.id);
      // Fallback: generic check-in at same program+day+location (RESIDUAL 3a)
      // Only applied when session has a known location (null location can't be matched safely)
      const byGeneric =
        s.location_id != null &&
        (genericAttendedKeys.get(enrollment.person_id) ?? new Set<string>())
          .has(`${s.fecha}:${s.location_id}`);
      if (bySessionId || byGeneric) {
        consecutive = 0;
      } else {
        consecutive++;
        if (consecutive > maxConsecutive) maxConsecutive = consecutive;
      }
    }
    if (maxConsecutive >= 2) {
      alerts.push({
        personId: enrollment.person_id,
        nombre: (person as { nombre: string }).nombre ?? "",
        apellidos: (person as { apellidos: string }).apellidos ?? "",
        consecutiveAbsences: maxConsecutive,
      });
    }
  }
  return alerts;
}

export const complianceRouter = router({
  /** Returns compliance metrics for a program (admin+). */
  getComplianceEdicion: adminProcedure
    .input(z.object({ programId: uuidLike }))
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      const { data: allSessions, error } = await supabase
        .from("program_sessions")
        .select("id, fecha, estado, hora_fin, location_id")
        .eq("program_id", input.programId)
        .order("fecha");

      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });

      // Fetch program slug for the generic check-in fallback (RESIDUAL 3a)
      const { data: progRow } = await supabase
        .from("programs")
        .select("slug")
        .eq("id", input.programId)
        .single();
      const programSlug = progRow?.slug ?? "";

      const sessions = allSessions ?? [];
      const notCancelled = sessions.filter((s) => s.estado !== "cancelada");
      // RESIDUAL 3(b): scope absence denominator to planned sessions only (hora_fin IS NOT NULL)
      // Legacy one-shot closes (families/sessions.ts) insert WITHOUT hora_fin → excluded here
      const cerrada = sessions.filter((s) => s.estado === "cerrada" && s.hora_fin != null);

      // planosSubidos: sessions (not cancelled) that have at least one document
      const { data: docCounts } = await supabase
        .from("session_documents")
        .select("session_id")
        .in("session_id", notCancelled.map((s) => s.id));
      const withDocs = new Set((docCounts ?? []).map((d) => d.session_id));
      const planosSubidos = notCancelled.filter((s) => withDocs.has(s.id)).length;

      // sesionesPendientes: planificada sessions past hora_fin today
      // GROUP 7b: hora_fin interpreted in Europe/Madrid local time
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const sesionesPendientes = sessions.filter((s) => {
        if (s.estado !== "planificada") return false;
        if (s.fecha > today) return false;
        if (s.fecha < today) return true;
        if (!s.hora_fin) return true;
        const sessionEnd = toMadridUtc(s.fecha, s.hora_fin);
        return now > sessionEnd;
      });

      const ausenciasAlerta = await detectAbsenceAlerts(
        supabase,
        input.programId,
        programSlug,
        cerrada.map((s) => ({ id: s.id, fecha: s.fecha, location_id: s.location_id ?? null }))
      );

      return {
        totalSesiones: notCancelled.length,
        sesionesCerradas: cerrada.length,
        planosSubidos,
        sesionesPendientesCount: sesionesPendientes.length,
        sesionesPendientes: sesionesPendientes.map((s) => ({
          id: s.id, fecha: s.fecha, hora_fin: s.hora_fin,
        })),
        ausenciasAlerta,
      };
    }),
});
