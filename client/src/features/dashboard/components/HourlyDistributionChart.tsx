/**
 * HourlyDistributionChart — Hourly attendance bar chart from v4 prototype.
 * Empty state: the dashboard tRPC router has no hourly aggregation endpoint.
 * TODO(frontend-v4): needs dashboard.getHourlyDistribution endpoint returning
 * { hour: string, count: number }[] for the active period/location/program.
 */

import { Skeleton } from "@/components/ui/skeleton";

// Relative heights (0–100) matching the prototype's 11-bar hourly shape:
// low → builds to midday peak → tapers off in afternoon
const BAR_HEIGHTS_PCT = [13, 29, 47, 65, 92, 100, 74, 40, 25, 19, 11] as const;

export function HourlyDistributionChart() {
  return (
    <section
      className="bocatas-card p-4 sm:p-5"
      aria-label="Distribución horaria"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
        <p className="text-eyebrow text-muted-foreground">Distribución horaria</p>
      </div>

      {/* Structured skeleton — 11 vertical bars mimicking an hourly histogram */}
      <div
        className="flex items-end gap-1 h-32 sm:h-36"
        aria-hidden="true"
      >
        {BAR_HEIGHTS_PCT.map((pct, i) => (
          <div key={i} className="flex-1 h-full flex flex-col items-center justify-end gap-1">
            <Skeleton
              className="w-full rounded-t-sm"
              style={{ height: `${pct}%`, minHeight: 4 }}
            />
            {/* Hour label stub */}
            <Skeleton className="h-2 w-3" />
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground mt-3" aria-live="polite">
        Pendiente · sin datos
        {/* TODO(frontend-v4): needs dashboard.getHourlyDistribution endpoint */}
      </p>
    </section>
  );
}
