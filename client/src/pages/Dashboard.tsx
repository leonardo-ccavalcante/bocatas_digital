/**
 * Dashboard.tsx — Epic C: Real-Time Attendance Dashboard
 *
 * McKinsey/Colenusbaumer design principles:
 * - Data-first: numbers are the hero, not decoration
 * - Minimal chrome: no unnecessary borders, gradients, or icons
 * - Single accent color (brand amber) for primary metric
 * - Section labels in small caps, generous whitespace
 * - Mobile-first: 360px viewport, no horizontal scroll
 */
import { useState } from "react";
import { BarChart2, RefreshCw, WifiOff } from "lucide-react";
import { useKPIStats } from "@/features/dashboard/hooks/useKPIStats";
import { useTrendData } from "@/features/dashboard/hooks/useTrendData";
import { useRealtimeAttendance } from "@/features/dashboard/hooks/useRealtimeAttendance";
import { KPICard } from "@/features/dashboard/components/KPICard";
import { TrendChart } from "@/features/dashboard/components/TrendChart";
import { ExportButton } from "@/features/dashboard/components/ExportButton";
import { DateRangeFilter } from "@/features/dashboard/components/DateRangeFilter";
import { LocationFilter } from "@/features/dashboard/components/LocationFilter";
import type { Period } from "@/features/dashboard/schemas";

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("today");
  const [locationId, setLocationId] = useState("all");

  // Realtime subscription — sets up channel on mount, returns connection status
  const { status: realtimeStatus } = useRealtimeAttendance();

  // KPI queries — all 3 periods always loaded (cheap count queries)
  const todayQuery = useKPIStats("today", locationId);
  const weekQuery = useKPIStats("week", locationId);
  const monthQuery = useKPIStats("month", locationId);

  // Trend data
  const trendQuery = useTrendData(locationId);

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold tracking-tight text-foreground">Dashboard</h1>
        </div>

        {/* Realtime status indicator */}
        <div className="flex items-center gap-1.5">
          {realtimeStatus === "connected" ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-muted-foreground hidden sm:inline">En vivo</span>
            </>
          ) : realtimeStatus === "disconnected" ? (
            <>
              <WifiOff className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">actualizando...</span>
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />
              <span className="text-[10px] text-muted-foreground hidden sm:inline">Conectando...</span>
            </>
          )}
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 pb-6 space-y-4 max-w-2xl w-full mx-auto">

        {/* ── Filters row ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangeFilter value={period} onChange={setPeriod} />
          <LocationFilter value={locationId} onChange={setLocationId} />
        </div>

        {/* ── KPI Cards — 3 columns, always visible ────────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          <KPICard
            label="HOY"
            sublabel="personas"
            count={todayQuery.data?.count ?? 0}
            isLoading={todayQuery.isLoading}
            isError={todayQuery.isError}
            onRetry={() => todayQuery.refetch()}
            highlight
          />
          <KPICard
            label="SEMANA"
            sublabel="personas"
            count={weekQuery.data?.count ?? 0}
            isLoading={weekQuery.isLoading}
            isError={weekQuery.isError}
            onRetry={() => weekQuery.refetch()}
          />
          <KPICard
            label="MES"
            sublabel="personas"
            count={monthQuery.data?.count ?? 0}
            isLoading={monthQuery.isLoading}
            isError={monthQuery.isError}
            onRetry={() => monthQuery.refetch()}
          />
        </div>

        {/* ── Trend Chart ──────────────────────────────────────────────────── */}
        <TrendChart
          data={trendQuery.data ?? []}
          isLoading={trendQuery.isLoading}
        />

        {/* ── Divider ──────────────────────────────────────────────────────── */}
        <div className="border-t border-border" />

        {/* ── Export ───────────────────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">
            Exportar datos
          </p>
          <ExportButton locationId={locationId} currentPeriod={period} />
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            CSV sin datos personales · Período activo · Sin registros demo
          </p>
        </div>
      </div>
    </div>
  );
}
