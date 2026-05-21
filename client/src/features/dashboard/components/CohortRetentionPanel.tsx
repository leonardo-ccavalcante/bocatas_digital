/**
 * CohortRetentionPanel — Retention cohort widget from v4 prototype.
 * Empty state: the dashboard tRPC router has no cohort aggregation endpoint.
 * TODO(frontend-v4): needs dashboard.getCohortRetention endpoint returning
 * { label, n, pct, delta, warn }[] grouped by first-checkin recency buckets.
 */

import { Skeleton } from "@/components/ui/skeleton";

interface CohortRetentionPanelProps {
  activeCount?: number;
}

// Skeleton widths mirror the prototype cohort bar proportions (14%, 45%, 28%, 13%)
const COHORT_SKELETON_WIDTHS = ["w-1/6", "w-5/12", "w-1/3", "w-1/6"] as const;

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

      {/* Structured skeleton — 4 retention cohort rows */}
      <ul className="space-y-3" aria-hidden="true">
        {COHORT_SKELETON_WIDTHS.map((barWidth, i) => (
          <li key={i}>
            {/* Label + stats line */}
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
            {/* Horizontal bar */}
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <Skeleton className={`h-full rounded-full ${barWidth}`} />
            </div>
          </li>
        ))}
      </ul>

      <p className="text-[10px] text-muted-foreground mt-3" aria-live="polite">
        Pendiente · sin datos
        {/* TODO(frontend-v4): needs dashboard.getCohortRetention endpoint */}
      </p>
    </section>
  );
}
