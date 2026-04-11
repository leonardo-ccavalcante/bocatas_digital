/**
 * dashboard.ts — tRPC router for Epic C: Real-Time Attendance Dashboard.
 *
 * All queries exclude es_demo = true at the DB level (authoritative for funder reports).
 * Anonymous records (person_id IS NULL) are included in all counts.
 * CSV export: zero PII — UUID, date, hour, location, program, method only.
 *
 * v2: Added programa filter to getKPIStats, getTrendData, getCSVExport.
 *     Added getAbsenceAlerts for prolonged inactivity detection.
 *     Added getPrograms for ProgramFilter dropdown.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { protectedProcedure, router } from "../_core/trpc";

// UUID-like validator (accepts synthetic seed IDs — RFC 4122 relaxed)
const uuidLike = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID format"
);

const PeriodEnum = z.enum(["today", "week", "month"]);

// programa: "all" or a slug string (e.g. "comedor", "acompanamiento")
const ProgramaFilter = z.union([z.literal("all"), z.string().min(1).max(50)]);

/** Compute date range from period string. Returns { dateFrom, dateTo } as YYYY-MM-DD */
function getPeriodRange(period: "today" | "week" | "month"): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  if (period === "today") {
    return { dateFrom: today, dateTo: today };
  } else if (period === "week") {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    return { dateFrom: monday.toISOString().split("T")[0], dateTo: today };
  } else {
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return { dateFrom: firstOfMonth, dateTo: today };
  }
}

export const dashboardRouter = router({
  /**
   * getKPIStats — count attendances for a given period, location, and program.
   * Excludes es_demo = true. Includes anonymous (person_id IS NULL).
   */
  getKPIStats: protectedProcedure
    .input(
      z.object({
        period: PeriodEnum,
        locationId: z.union([z.literal("all"), uuidLike]),
        programa: ProgramaFilter.optional().default("all"),
      })
    )
    .query(async ({ input }) => {
      const supabase = createAdminClient();
      const { dateFrom, dateTo } = getPeriodRange(input.period);

      let query = supabase
        .from("attendances")
        .select("id", { count: "exact", head: true })
        .eq("es_demo", false)
        .is("deleted_at", null)
        .gte("checked_in_date", dateFrom)
        .lte("checked_in_date", dateTo);

      if (input.locationId !== "all") {
        query = query.eq("location_id", input.locationId);
      }
      if (input.programa !== "all") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = (query as any).eq("programa", input.programa);
      }

      const { count, error } = await query;
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Error al obtener KPI: ${error.message}` });
      }
      return { count: count ?? 0, period: input.period, locationId: input.locationId, programa: input.programa };
    }),

  /**
   * getTrendData — weekly attendance for last 4 ISO weeks.
   * Supports programa filter.
   */
  getTrendData: protectedProcedure
    .input(
      z.object({
        locationId: z.union([z.literal("all"), uuidLike]),
        programa: ProgramaFilter.optional().default("all"),
      })
    )
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - diff);
      thisMonday.setHours(0, 0, 0, 0);

      const fourWeeksAgo = new Date(thisMonday);
      fourWeeksAgo.setDate(thisMonday.getDate() - 21);

      const dateFrom = fourWeeksAgo.toISOString().split("T")[0];
      const dateTo = now.toISOString().split("T")[0];

      let query = supabase
        .from("attendances")
        .select("checked_in_date")
        .eq("es_demo", false)
        .is("deleted_at", null)
        .gte("checked_in_date", dateFrom)
        .lte("checked_in_date", dateTo);

      if (input.locationId !== "all") {
        query = query.eq("location_id", input.locationId);
      }
      if (input.programa !== "all") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = (query as any).eq("programa", input.programa);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Error al obtener tendencia: ${error.message}` });
      }

      const weekCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
      for (const row of data ?? []) {
        const d = new Date(row.checked_in_date + "T12:00:00Z");
        const diffMs = thisMonday.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const weekIndex = Math.floor(diffDays / 7);
        if (weekIndex >= 0 && weekIndex <= 3) weekCounts[weekIndex]++;
      }

      return [
        { label: "S-3", count: weekCounts[3] },
        { label: "S-2", count: weekCounts[2] },
        { label: "S-1", count: weekCounts[1] },
        { label: "Esta", count: weekCounts[0] },
      ];
    }),

  /**
   * getCSVExport — zero-PII CSV data for funder reports.
   * Supports programa filter.
   */
  getCSVExport: protectedProcedure
    .input(
      z.object({
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
        locationId: z.union([z.literal("all"), uuidLike]),
        programa: ProgramaFilter.optional().default("all"),
      })
    )
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      let query = supabase
        .from("attendances")
        .select(`
          checked_in_date,
          created_at,
          person_id,
          programa,
          metodo,
          locations!inner(nombre)
        `)
        .eq("es_demo", false)
        .is("deleted_at", null)
        .gte("checked_in_date", input.dateFrom)
        .lte("checked_in_date", input.dateTo)
        .order("checked_in_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (input.locationId !== "all") {
        query = query.eq("location_id", input.locationId);
      }
      if (input.programa !== "all") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = (query as any).eq("programa", input.programa);
      }

      const { data, error } = await query;
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Error al exportar CSV: ${error.message}` });
      }

      const rows = (data ?? []).map((row: any) => {
        const hora = new Date(row.created_at).toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Madrid",
        });
        return {
          fecha: row.checked_in_date,
          hora,
          persona_uuid: row.person_id ?? "anonimo",
          punto_servicio: row.locations?.nombre ?? "",
          programa: row.programa,
          metodo: row.metodo,
        };
      });

      return { rows, dateFrom: input.dateFrom };
    }),

  /**
   * getAbsenceAlerts — persons who have not checked in for >= thresholdDays.
   * Returns list of { personId, nombre, apellidos, diasAusente, ultimoCheckin, programa }
   * Only considers non-demo check-ins. Excludes persons with no check-ins ever (new registrations).
   */
  getAbsenceAlerts: protectedProcedure
    .input(
      z.object({
        locationId: z.union([z.literal("all"), uuidLike]).optional().default("all"),
        programa: ProgramaFilter.optional().default("all"),
        thresholdDays: z.number().int().min(1).max(365).optional().default(14),
      })
    )
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      // Get the most recent check-in per person (non-demo, non-anonymous)
      // We look back up to 6 months to find people who were regular attendees
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const lookbackDate = sixMonthsAgo.toISOString().split("T")[0];

      let query = supabase
        .from("attendances")
        .select("person_id, checked_in_date, programa, location_id")
        .eq("es_demo", false)
        .is("deleted_at", null)
        .not("person_id", "is", null) // exclude anonymous
        .gte("checked_in_date", lookbackDate)
        .order("checked_in_date", { ascending: false });

      if (input.locationId !== "all") {
        query = query.eq("location_id", input.locationId);
      }
      if (input.programa !== "all") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = (query as any).eq("programa", input.programa);
      }

      const { data: attendanceData, error: attendanceError } = await query;
      if (attendanceError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Error al obtener asistencias: ${attendanceError.message}` });
      }

      // Find the most recent check-in per person
      const lastCheckinByPerson = new Map<string, string>(); // personId -> lastDate
      for (const row of attendanceData ?? []) {
        if (!row.person_id) continue;
        if (!lastCheckinByPerson.has(row.person_id)) {
          lastCheckinByPerson.set(row.person_id, row.checked_in_date);
        }
      }

      // Filter persons whose last check-in was >= thresholdDays ago
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const thresholdMs = input.thresholdDays * 24 * 60 * 60 * 1000;

      const absentPersonIds: Array<{ personId: string; ultimoCheckin: string; diasAusente: number }> = [];

      for (const [personId, lastDate] of Array.from(lastCheckinByPerson.entries())) {
        const lastCheckinDate = new Date(lastDate + "T12:00:00Z");
        const diffMs = today.getTime() - lastCheckinDate.getTime();
        if (diffMs >= thresholdMs) {
          absentPersonIds.push({
            personId,
            ultimoCheckin: lastDate,
            diasAusente: Math.floor(diffMs / (1000 * 60 * 60 * 24)),
          });
        }
      }

      if (absentPersonIds.length === 0) {
        return [];
      }

      // Fetch person details for absent persons
      const ids = absentPersonIds.map((p) => p.personId);
      const { data: personsData, error: personsError } = await supabase
        .from("persons")
        .select("id, nombre, apellidos, restricciones_alimentarias")
        .in("id", ids)
        .is("deleted_at", null);

      if (personsError) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Error al obtener personas: ${personsError.message}` });
      }

      const personsMap = new Map((personsData ?? []).map((p) => [p.id, p]));

      return absentPersonIds
        .map((absent) => {
          const person = personsMap.get(absent.personId);
          if (!person) return null;
          return {
            personId: absent.personId,
            nombre: person.nombre,
            apellidos: person.apellidos,
            diasAusente: absent.diasAusente,
            ultimoCheckin: absent.ultimoCheckin,
            restriccionesAlimentarias: person.restricciones_alimentarias ?? null,
          };
        })
        .filter(Boolean)
        .sort((a, b) => (b?.diasAusente ?? 0) - (a?.diasAusente ?? 0)) // most absent first
        .slice(0, 50); // cap at 50 alerts
    }),

  /**
   * getPrograms — list of active programs for ProgramFilter dropdown.
   * Returns { id, name, slug, is_default }[]
   */
  getPrograms: protectedProcedure
    .query(async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("programs")
        .select("id, name, slug, is_default")
        .order("name", { ascending: true });

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Error al obtener programas: ${error.message}` });
      }
      return data ?? [];
    }),
});
