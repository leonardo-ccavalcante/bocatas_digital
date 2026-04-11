/**
 * schemas.ts — Zod schemas and TypeScript types for Epic C Dashboard.
 */
import { z } from "zod";

export const PeriodSchema = z.enum(["today", "week", "month"]);
export type Period = z.infer<typeof PeriodSchema>;

export const KPIStatsSchema = z.object({
  count: z.number(),
  period: PeriodSchema,
  locationId: z.string(),
});
export type KPIStats = z.infer<typeof KPIStatsSchema>;

export const TrendPointSchema = z.object({
  label: z.string(),
  count: z.number(),
});
export type TrendPoint = z.infer<typeof TrendPointSchema>;

export const CSVRowSchema = z.object({
  fecha: z.string(),
  hora: z.string(),
  persona_uuid: z.string(),
  punto_servicio: z.string(),
  programa: z.string(),
  metodo: z.string(),
});
export type CSVRow = z.infer<typeof CSVRowSchema>;

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  week: "Semana",
  month: "Mes",
};

export const PERIOD_KPI_LABELS: Record<Period, string> = {
  today: "HOY",
  week: "SEMANA",
  month: "MES",
};
