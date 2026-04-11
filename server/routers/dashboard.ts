/**
 * dashboard.ts — tRPC router for Epic C: Real-Time Attendance Dashboard.
 *
 * All queries exclude es_demo = true at the DB level (authoritative for funder reports).
 * Anonymous records (person_id IS NULL) are included in all counts.
 * CSV export: zero PII — UUID, date, hour, location, program, method only.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createAdminClient } from "../../client/src/lib/supabase/server";
import { protectedProcedure, router } from "../_core/trpc";

// UUID-like validator (same as checkin router — accepts synthetic seed IDs)
const uuidLike = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID format"
);

const PeriodEnum = z.enum(["today", "week", "month"]);

export const dashboardRouter = router({
  /**
   * getKPIStats — count attendances for a given period and location.
   * Excludes es_demo = true. Includes anonymous (person_id IS NULL).
   */
  getKPIStats: protectedProcedure
    .input(
      z.object({
        period: PeriodEnum,
        locationId: z.union([z.literal("all"), uuidLike]),
      })
    )
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      // Build date range based on period
      const now = new Date();
      let dateFrom: string;
      let dateTo: string;

      if (input.period === "today") {
        const today = now.toISOString().split("T")[0];
        dateFrom = today;
        dateTo = today;
      } else if (input.period === "week") {
        // ISO week: Monday to today
        const day = now.getDay(); // 0=Sun, 1=Mon...
        const diff = day === 0 ? 6 : day - 1; // days since Monday
        const monday = new Date(now);
        monday.setDate(now.getDate() - diff);
        dateFrom = monday.toISOString().split("T")[0];
        dateTo = now.toISOString().split("T")[0];
      } else {
        // month: 1st of current month to today
        dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        dateTo = now.toISOString().split("T")[0];
      }

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

      const { count, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al obtener KPI: ${error.message}`,
        });
      }

      return { count: count ?? 0, period: input.period, locationId: input.locationId };
    }),

  /**
   * getTrendData — weekly attendance for last 4 ISO weeks.
   * Returns array of { label: "S-3" | "S-2" | "S-1" | "Esta", count: number }
   */
  getTrendData: protectedProcedure
    .input(
      z.object({
        locationId: z.union([z.literal("all"), uuidLike]),
      })
    )
    .query(async ({ input }) => {
      const supabase = createAdminClient();

      // Calculate the start of 4 weeks ago (Monday)
      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - diff);
      thisMonday.setHours(0, 0, 0, 0);

      const fourWeeksAgo = new Date(thisMonday);
      fourWeeksAgo.setDate(thisMonday.getDate() - 21); // 3 weeks back from this Monday

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

      const { data, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al obtener tendencia: ${error.message}`,
        });
      }

      // Group by ISO week (0=this week, 1=last week, 2=2 weeks ago, 3=3 weeks ago)
      const weekCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

      for (const row of data ?? []) {
        const d = new Date(row.checked_in_date + "T12:00:00Z");
        const diffMs = thisMonday.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const weekIndex = Math.floor(diffDays / 7); // 0=this week, 1=last, etc.
        if (weekIndex >= 0 && weekIndex <= 3) {
          weekCounts[weekIndex]++;
        }
      }

      // Return in chronological order (oldest first)
      return [
        { label: "S-3", count: weekCounts[3] },
        { label: "S-2", count: weekCounts[2] },
        { label: "S-1", count: weekCounts[1] },
        { label: "Esta", count: weekCounts[0] },
      ];
    }),

  /**
   * getCSVExport — zero-PII CSV data for funder reports.
   * Columns: fecha, hora, persona_uuid, punto_servicio, programa, metodo
   * Anonymous rows: persona_uuid = "anonimo"
   */
  getCSVExport: protectedProcedure
    .input(
      z.object({
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
        locationId: z.union([z.literal("all"), uuidLike]),
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

      const { data, error } = await query;

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error al exportar CSV: ${error.message}`,
        });
      }

      // Build CSV rows — zero PII
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
});
