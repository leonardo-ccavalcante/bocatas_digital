/**
 * Dashboard.tsx — v4 visual port of bocatas-v4 prototype.
 *
 * Layout: sticky header (period pills + sede/programa dropdowns), KPI grid,
 * trend chart + program-mix side-by-side, cohort/hourly row, sedes table,
 * absence alerts, export button.
 *
 * Data flow unchanged: useKPIStats, useTrendData, useRealtimeAttendance,
 * useAbsenceAlerts all wired to real tRPC endpoints.
 *
 * New widgets with no backend endpoint render empty-state + TODO comment:
 *   - ProgramMixChart   (TODO: needs dashboard.getProgramMix)
 *   - CohortRetentionPanel (TODO: needs dashboard.getCohortRetention)
 *   - HourlyDistributionChart (TODO: needs dashboard.getHourlyDistribution)
 *   - SedesPerformanceTable (TODO: needs dashboard.getSedesPerformance)
 */
import { useState } from "react";
import { BarChart2, WifiOff, RefreshCw } from "lucide-react";
import { useKPIStats } from "@/features/dashboard/hooks/useKPIStats";
import { useTrendData } from "@/features/dashboard/hooks/useTrendData";
import { useRealtimeAttendance } from "@/features/dashboard/hooks/useRealtimeAttendance";
import { useAbsenceAlerts } from "@/features/dashboard/hooks/useAbsenceAlerts";
import { KPICard } from "@/features/dashboard/components/KPICard";
import { TrendChart } from "@/features/dashboard/components/TrendChart";
import { ExportButton } from "@/features/dashboard/components/ExportButton";
import { DateRangeFilter } from "@/features/dashboard/components/DateRangeFilter";
import { LocationFilter } from "@/features/dashboard/components/LocationFilter";
import { ProgramFilter } from "@/features/dashboard/components/ProgramFilter";
import { AbsenceAlertsPanel } from "@/features/dashboard/components/AbsenceAlertsPanel";
import { CohortRetentionPanel } from "@/features/dashboard/components/CohortRetentionPanel";
import { HourlyDistributionChart } from "@/features/dashboard/components/HourlyDistributionChart";
import { SedesPerformanceTable } from "@/features/dashboard/components/SedesPerformanceTable";
import type { Period } from "@/features/dashboard/schemas";

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("today");
  const [locationId, setLocationId] = useState("all");
  const [programa, setPrograma] = useState("all");

  // Realtime subscription — sets up channel on mount, returns connection status
  const { status: realtimeStatus } = useRealtimeAttendance();

  // KPI queries — all 3 periods always loaded (cheap count queries)
  const todayQuery = useKPIStats("today", locationId, programa);
  const weekQuery = useKPIStats("week", locationId, programa);
  const monthQuery = useKPIStats("month", locationId, programa);

  // Trend data
  const trendQuery = useTrendData(locationId, programa);

  // Absence alerts count for header badge
  const { count: alertCount } = useAbsenceAlerts({ locationId, programa });

  return (
    <div className="min-h-full bg-background">
      {/* ── Sticky header ────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border">
        {/* Title row */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <BarChart2 className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <h1 className="text-h2 truncate text-foreground">Dashboard</h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Realtime status */}
            <div className="flex items-center gap-1.5" aria-live="polite" aria-atomic="true">
              {realtimeStatus === "connected" ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">En vivo</span>
                </>
              ) : realtimeStatus === "disconnected" ? (
                <>
                  <WifiOff className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <span className="text-[10px] text-muted-foreground">actualizando...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" aria-hidden="true" />
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">Conectando...</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Filters row */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-2 overflow-x-auto">
          <DateRangeFilter value={period} onChange={setPeriod} />
          <LocationFilter value={locationId} onChange={setLocationId} />
          <ProgramFilter value={programa} onChange={setPrograma} />
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">

        {/* ── KPI strip ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          <KPICard
            label="HOY"
            sublabel="personas"
            count={todayQuery.data?.count ?? 0}
            isLoading={todayQuery.isLoading}
            isError={todayQuery.isError}
            onRetry={() => void todayQuery.refetch()}
            highlight
          />
          <KPICard
            label="SEMANA"
            sublabel="personas"
            count={weekQuery.data?.count ?? 0}
            isLoading={weekQuery.isLoading}
            isError={weekQuery.isError}
            onRetry={() => void weekQuery.refetch()}
          />
          <KPICard
            label="MES"
            sublabel="personas"
            count={monthQuery.data?.count ?? 0}
            isLoading={monthQuery.isLoading}
            isError={monthQuery.isError}
            onRetry={() => void monthQuery.refetch()}
          />
        </div>

        {/* ── Trend + Program mix (side-by-side on desktop) ────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <TrendChart
              data={trendQuery.data ?? []}
              isLoading={trendQuery.isLoading}
            />
          </div>

          {/* Program mix — empty state, no backend endpoint */}
          <div className="bocatas-card p-4 sm:p-5">
            <p className="text-eyebrow text-muted-foreground">Mix por programa</p>
            <p className="text-[12px] text-muted-foreground mt-0.5 mb-4">% personas atendidas</p>
            <ul className="space-y-3" aria-hidden="true">
              {/* TODO(frontend-v4): needs dashboard.getProgramMix endpoint */}
              {[64, 48, 32, 20].map((w, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                  <div className="flex-1 h-2.5 rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full bg-muted animate-pulse"
                      style={{ width: `${w}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground mt-3" aria-live="polite">
              Pendiente · sin datos
            </p>
          </div>
        </div>

        {/* ── Cohort retention + Hourly distribution ───────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CohortRetentionPanel />
          <HourlyDistributionChart />
        </div>

        {/* ── Sedes performance ────────────────────────────────────────────── */}
        <SedesPerformanceTable />

        {/* ── Absence alerts ───────────────────────────────────────────────── */}
        <AbsenceAlertsPanel
          locationId={locationId}
          programa={programa}
          thresholdDays={14}
          defaultCollapsed={alertCount === 0}
        />

        {/* ── Export ───────────────────────────────────────────────────────── */}
        <div>
          <p className="text-eyebrow text-muted-foreground mb-2">Exportar datos</p>
          <ExportButton locationId={locationId} currentPeriod={period} programa={programa} />
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            CSV sin datos personales &middot; Período activo &middot; Sin registros demo
          </p>
        </div>
      </div>
    </div>
  );
}
