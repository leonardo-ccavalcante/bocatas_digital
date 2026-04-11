import { z } from "zod";

export const DashboardFiltersSchema = z.object({
  location_id: z.string().uuid().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  programa: z.string().optional(),
});

export type DashboardFilters = z.infer<typeof DashboardFiltersSchema>;

export const AttendanceStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  today: z.number().int().nonnegative(),
  this_week: z.number().int().nonnegative(),
  this_month: z.number().int().nonnegative(),
  by_programa: z.record(z.string(), z.number()),
  by_location: z.record(z.string(), z.number()),
});

export type AttendanceStats = z.infer<typeof AttendanceStatsSchema>;
