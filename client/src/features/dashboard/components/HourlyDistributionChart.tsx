/**
 * HourlyDistributionChart — Hourly attendance bar chart from v4 prototype.
 * Empty state: the dashboard tRPC router has no hourly aggregation endpoint.
 * TODO(frontend-v4): needs dashboard.getHourlyDistribution endpoint returning
 * { hour: string, count: number }[] for the active period/location/program.
 */

export function HourlyDistributionChart() {
  return (
    <section
      className="bocatas-card p-4 sm:p-5"
      aria-label="Distribución horaria"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
        <p className="text-eyebrow text-muted-foreground">Distribución horaria</p>
      </div>
      <div
        className="flex items-center justify-center h-28 rounded-xl border border-dashed border-border"
        aria-live="polite"
      >
        <p className="text-body-sm text-muted-foreground text-center px-4">
          Pendiente de implementación
          {/* TODO(frontend-v4): needs dashboard.getHourlyDistribution endpoint */}
        </p>
      </div>
    </section>
  );
}
