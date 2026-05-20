/**
 * SedesPerformanceTable — Sedes performance table from v4 prototype.
 * Empty state: the dashboard tRPC router has no per-sede aggregation endpoint.
 * TODO(frontend-v4): needs dashboard.getSedesPerformance endpoint returning
 * { name, personCount, programCount, occupancyPct, deltaPct }[] per location.
 */

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
      <div
        className="flex items-center justify-center h-28"
        aria-live="polite"
      >
        <p className="text-body-sm text-muted-foreground text-center px-4">
          Pendiente de implementación
          {/* TODO(frontend-v4): needs dashboard.getSedesPerformance endpoint */}
        </p>
      </div>
    </section>
  );
}
