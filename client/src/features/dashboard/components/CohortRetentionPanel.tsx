/**
 * CohortRetentionPanel — Retention cohort widget from v4 prototype.
 * Empty state: the dashboard tRPC router has no cohort aggregation endpoint.
 * TODO(frontend-v4): needs dashboard.getCohortRetention endpoint returning
 * { label, n, pct, delta, warn }[] grouped by first-checkin recency buckets.
 */

interface CohortRetentionPanelProps {
  activeCount?: number;
}

export function CohortRetentionPanel({ activeCount }: CohortRetentionPanelProps) {
  return (
    <section
      className="bocatas-card p-4 sm:p-5"
      aria-label="Cohortes de retención"
    >
      <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
        <p className="text-eyebrow text-muted-foreground">Cohortes de retención</p>
        {typeof activeCount === "number" && (
          <span className="text-[10px] text-muted-foreground">
            {activeCount.toLocaleString("es-ES")} personas activas
          </span>
        )}
      </div>
      <div
        className="flex items-center justify-center h-28 rounded-xl border border-dashed border-border"
        aria-live="polite"
      >
        <p className="text-body-sm text-muted-foreground text-center px-4">
          Pendiente de implementación
          {/* TODO(frontend-v4): needs dashboard.getCohortRetention endpoint */}
        </p>
      </div>
    </section>
  );
}
