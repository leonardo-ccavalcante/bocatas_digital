/**
 * SedesPerformanceTable — Sedes performance table from v4 prototype.
 * Empty state: the dashboard tRPC router has no per-sede aggregation endpoint.
 * TODO(frontend-v4): needs dashboard.getSedesPerformance endpoint returning
 * { name, personCount, programCount, occupancyPct, deltaPct }[] per location.
 */

import { Skeleton } from "@/components/ui/skeleton";

// 4 skeleton rows with varied name-column widths to look natural
const ROW_NAME_WIDTHS = ["w-16", "w-14", "w-20", "w-16"] as const;

export function SedesPerformanceTable() {
  return (
    <section
      className="bocatas-card overflow-hidden"
      aria-label="Rendimiento por sede"
    >
      <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-border flex items-center justify-between">
        <p className="text-eyebrow text-muted-foreground">Rendimiento por sede</p>
        {/* TODO(frontend-v4): confirm final columns with backend schema */}
        <span className="text-[10px] text-muted-foreground">% ocupación</span>
      </div>

      {/* Skeleton header row */}
      <div
        className="px-4 sm:px-5 py-2 grid grid-cols-[1.5fr,1fr,2fr,60px] gap-4 border-b border-border"
        aria-hidden="true"
      >
        <Skeleton className="h-2.5 w-10" />
        <Skeleton className="h-2.5 w-8" />
        <Skeleton className="h-2.5 w-12" />
        <Skeleton className="h-2.5 w-8 ml-auto" />
      </div>

      {/* Structured skeleton — 4 sede data rows */}
      <ul className="divide-y divide-border" aria-hidden="true">
        {ROW_NAME_WIDTHS.map((nameWidth, i) => (
          <li
            key={i}
            className="px-4 sm:px-5 py-3 grid grid-cols-[1.5fr,1fr,2fr,60px] gap-4 items-center"
          >
            {/* Name + sub-label */}
            <div className="space-y-1.5">
              <Skeleton className={`h-3 ${nameWidth}`} />
              <Skeleton className="h-2 w-24" />
            </div>
            {/* Occupancy % */}
            <Skeleton className="h-3 w-8" />
            {/* Progress bar */}
            <Skeleton className="h-1.5 w-full rounded-full" />
            {/* Delta */}
            <Skeleton className="h-3 w-8 ml-auto" />
          </li>
        ))}
      </ul>

      <div className="px-4 sm:px-5 py-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground" aria-live="polite">
          Pendiente · sin datos
          {/* TODO(frontend-v4): needs dashboard.getSedesPerformance endpoint */}
        </p>
      </div>
    </section>
  );
}
